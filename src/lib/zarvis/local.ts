import "server-only";
import { lookupPublicData, lookupSchema } from "./data";
import { queryLedger, ledgerQuerySchema, type LedgerSummary } from "./ledger";
import { searchKnowledge } from "./knowledge";
import { getZipCorpus } from "./zips";
import { isZipQuestion, zipCatalogEvidence, latestZipAnswer, requestedZips } from "./zip-catalog";
import { boundedRead } from "./timeout";
import type { ChatMessage, ZarvisSource } from "./types";
import { miningAnswer } from "./mining";
import { needsMiningResearch } from "./research-scope";
import { directIntent, normalizeQuestion } from "./direct-intent";
import { faqAnswer } from "./direct-faq";
import { treasuryAnswer, numberedZipAnswer } from "./direct-data";
import { arboristAnswer } from "./arborist";
import { sessionPreferences, type ZarvisSession } from "./session";
import { answerLanguage } from "./language";
export { directIntent, normalizeQuestion } from "./direct-intent";

export type Evidence = { content: string; source?: ZarvisSource };
export type LocalPlan = { query: string; documents: ReturnType<typeof searchKnowledge>; evidence: Evidence[]; direct?: string; reviewedFaq?: boolean; external: boolean };
/** Retrieve for the latest topic; short replies can refer to the preceding answer/offer. */
export function retrievalQuestion(messages: ChatMessage[]): string {
  const latest = messages.at(-1)?.content ?? "";
  if (latest.length <= 70 && /^(?:yes|sim|ok|sure|please|continue|tell me more|conte mais|fale mais|aprofunde|pode|isso|e\b|and\b|what about\b|how about\b|explain(?: (?:that|it|more))?$|explique(?: (?:isso|mais))?$|por que\b|why\b)/i.test(latest.trim())) {
    return `${messages.slice(-3, -1).map((m) => m.content.slice(0, 900)).join("\n")}\n${latest}`;
  }
  return latest;
}
const validDate = (value: string | null) => !!value && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now() + 60_000;
const validAmount = (value: string) => typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= Number.MAX_SAFE_INTEGER / 100;
const count = (value: number) => Number.isSafeInteger(value) && value >= 0;
function date(value: string, pt: boolean): string {
  return new Intl.DateTimeFormat(pt ? "pt-BR" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " UTC";
}
function priceAnswer(evidence: Evidence, pt: boolean): string {
  const unavailable = pt
    ? "Não foi possível consultar a cotação em USD agora. [Abrir o Observatório ZEC](https://openzcash.org/zec-observatory)."
    : "The USD price feed is unavailable right now. [Open the ZEC Observatory](https://openzcash.org/zec-observatory).";
  try {
    const quote = JSON.parse(evidence.content).data?.quote;
    const at = Date.parse(quote?.quotedAt);
    if (!quote || !(quote.usd > 0) || !Number.isFinite(quote.usd) || !Number.isFinite(at) || at > Date.now() + 60000) return unavailable;
    const usd = new Intl.NumberFormat(pt ? "pt-BR" : "en-US", { style: "currency", currency: "USD" }).format(quote.usd);
    if (quote.stale || Date.now() - at >= 10 * 60000) return pt
      ? `Não consegui confirmar a cotação atual. Última referência: **${usd} por ZEC**, de ${date(quote.quotedAt, pt)}; é uma cotação em cache. [Cotação do OpenZcash](https://openzcash.org/api/zec-price).`
      : `I could not confirm the current price. Last saved quote: **${usd} per ZEC**, from ${date(quote.quotedAt, pt)}; this is a cached reference. [OpenZcash price feed](https://openzcash.org/api/zec-price).`;
    return pt
      ? `1 ZEC = **${usd}**. Cotação de ${date(quote.quotedAt, pt)}. [Cotação do OpenZcash](https://openzcash.org/api/zec-price).`
      : `1 ZEC = **${usd}**. Quoted ${date(quote.quotedAt, pt)}. [OpenZcash price feed](https://openzcash.org/api/zec-price).`;
  } catch { return unavailable; }
}
export function ledgerAnswer(data: LedgerSummary, pt: boolean): string | undefined {
  if (!ledgerQuerySchema.safeParse(data.filters).success || data.filters.scope !== "zcg_grants" || data.filters.search || data.filters.year === null || !validDate(data.importedAt) || !validAmount(data.budgetedUsdOfPaidEntries) || !count(data.paidEntries) || !count(data.paidEntriesMissingUsd)) return;
  const value = Number(data.budgetedUsdOfPaidEntries);
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER / 100) return;
  const usd = new Intl.NumberFormat(pt ? "pt-BR" : "en-US", { style: "currency", currency: "USD" }).format(value);
  const caveat = data.paidEntriesMissingUsd ? (pt ? ` ${data.paidEntriesMissingUsd} registros pagos não têm valor USD; o total é incompleto.` : ` ${data.paidEntriesMissingUsd} paid entries have no USD amount; this total is incomplete.`) : "";
  return pt
    ? `Em **${data.filters.year}**, o registro do ZCG soma **${usd}** em valores orçados de **${data.paidEntries} registros de grants marcados como pagos**.${caveat}\n\nO filtro usa a data de pagamento e exclui registros sem data. Não inclui grants dos coinholders nem planilhas operacionais separadas; não é a cotação atual dos ZEC. Dados importados em ${date(data.importedAt!, pt)}. [Pagamentos do ZCG](https://openzcash.org/zcg/disbursements).`
    : `In **${data.filters.year}**, the ZCG ledger records **${usd}** in budgeted values for **${data.paidEntries} grant entries marked paid**.${caveat}\n\nThis uses payment dates and excludes undated entries. It excludes coinholder grants and separate operational worksheets; it is not today's ZEC valuation. Data imported ${date(data.importedAt!, pt)}. [ZCG payments](https://openzcash.org/zcg/disbursements).`;
}
export async function lookupLedger(args: unknown, signal: AbortSignal): Promise<Evidence> {
  const url = "https://openzcash.org/zcg/disbursements";
  const parsed = ledgerQuerySchema.safeParse(args);
  if (!parsed.success) return { content: JSON.stringify({ error: "Unsupported ledger filters." }) };
  try {
    signal.throwIfAborted();
    const data = await boundedRead(() => queryLedger(parsed.data), signal);
    signal.throwIfAborted();
    const retrievedAt = new Date().toISOString();
    return { content: JSON.stringify({ sourceUrl: url, retrievedAt, data }), source: { title: "OpenZcash · ZCG payment ledger", url, retrievedAt } };
  } catch { signal.throwIfAborted(); return { content: JSON.stringify({ sourceUrl: url, error: "Ledger data unavailable. Do not report a zero total." }) }; }
}

export function relevantTopics(query: string): Array<typeof lookupSchema._output.topic> {
  const q = normalizeQuestion(query);
  // A payment total needs the complete ledger tool, not large ecosystem/grant excerpts.
  if (/\b(?:paid|payments|pagou|pagos?|pagamentos|gastos|gastou)\b/.test(q) && /\b(?:grants?|zcg)\b/.test(q) && !/\b(?:treasury|tesouro|balance|saldo)\b/.test(q)) return [];
  const matches: Array<[RegExp, typeof lookupSchema._output.topic]> = [
    [/\b(?:price|preco|cotacao|quanto (?:vale|valia|custa|custava|era|estava|esta) (?:o |um |1 )?zec|how much (?:is|was|does) (?:a |one |1 )?zec)\b/, "price"],
    [/\b(?:hashrate|solrate|difficulty|dificuldade)\b.*\b(?:current|today|now|atual|hoje|agora)\b|\b(?:current|today|now|atual|hoje|agora)\b.*\b(?:hashrate|solrate|difficulty|dificuldade)\b/, "mining"],
    [/\b(?:treasur\w*|tesour\w*|balances?|saldos?|holdings?|lockbox)\b/, "treasuries"],
    [/\b(?:meetings?|reunioes|reuniao)\b(?! (?:arborist|de engenharia))/, "meetings"],
    [/\b(?:elections?|committee|eleicoes|eleicao|comite|membros)\b/, "elections"],
    [/\b(?:scheduled?|upcoming payments|agendad\w*)\b/, "schedule"],
    [/\b(?:maya|investments?|investimentos?)\b/, "investments"],
    [/\b(?:monthly|mensal|relatorios?)\b/, "monthly"],
    [/\b(?:zec ?hub dao|dao (?:da |do |de )?zec ?hub|daodao|dao (?:proposals?|votes?|propostas?|votacao|votacoes))\b/, "zechub_dao"],
    [/\b(?:forum|forums|foruns|discourse|forum ?thread|forumzcashcommunitycom)\b|\bwhat (?:did|does|do|is|are|were|was) (?:the )?(?:community|people|users|folks) (?:say|saying|said|think|thinking|discuss|discussing)\b|\bo que (?:a comunidade|as pessoas) (?:diz|disse|dizem|disseram|acha|acham|fala|falou|discute|discutiu)\b/, "forum"],
    [/\b(?:zec?hub)\b(?! dao)/, "zechub"],
    [/\b(?:coinholder)\b/, "coinholder"],
    [/\b(?:news|noticias)\b/, "news"],
    [/\b(?:arborist|arboretum|engineering calls?|reuni(?:ao|oes) (?:de engenharia|arborist)|calls? #?\s?\d{1,4})\b|#\d{1,4}\b.*\bcalls?\b/, "arborist"],
    [/\b(?:wallets?|carteiras?|zashi|zodl|ywallet|zkool|keystone|trezor)\b/, "wallets"],
    // The bare singular ("the community decided", "Zcash Community Grants") is not the directory; plural, "community in/of" and named groups are.
    [/\b(?:communities|comunidades|communit(?:y|ies) (?:in|of|group|groups|directory|page|near)|comunidade (?:em|de|do|da|no|na|local)|local communit(?:y|ies)|zcash communit(?:y|ies)(?! grants?\b)|ambassadors?|embaixador\w*|zcash (?:brasil|brazil|nigeria|ghana|arabia|india|indonesia|japan|korea|china|france|ukraine|turkiye|turkey|east africa|south africa|en espanol|club|global germany|caracas|barcelona|queretaro)|zechub nigeria|zcashsa|ruzcash|zcast|coderaiz|pesa ya siri|boston zcash)\b/, "communities"],
    [/^(?!.*\b(?:zips?|improvement|melhoria)\b).*\b(?:decid\w*|decis(?:ao|oes)|verdicts?|veredito\w*|approved|rejected|declined|withdrawn|vetoed|aprovad\w*|rejeitad\w*|recusad\w*|retirad\w*|vetad\w*)\b/, "decisions"],
    [/^(?!.*\b(?:zips?|improvement|melhoria)\b).*\b(?:proposals?|propostas?|(?:grant|funding|zcg) applications?|applicants?|candidaturas?|under review|em (?:analise|revisao))\b/, "proposals"],
    [/\b(?:ecosystem|repositori\w*|ecossistema|zebra|zaino|zingo)\b/, "ecosystem"],
    [/\b(?:funding history|historico de financiamento)\b/, "funding_history"],
    [/\b(?:block height|chain tip|current block|latest block|altura (?:do |de )?bloco|bloco atual|halvings?|shielded (?:supply|pools?|value)|(?:circulating|total|chain) supply|oferta (?:circulante|total)|pools? blindad\w*|value pools?)\b/, "chain"],
    [/\b(?:recipients?|beneficiarios?)\b/, "recipients"],
    [/\b(?:grants?|zcg)\b/, "grants"],
  ];
  const topics = [...new Set(matches.filter(([pattern]) => pattern.test(q)).map(([, topic]) => topic))];
  // A dated price question wants the daily-close history, not today's quote. A month name alone is not a date ("market", "may"): the reader resolves a period only with a year.
  if (topics.includes("price") && /\b(?:20[12]\d|hist[oó]ric\w*|history|ago|atras|last (?:month|year|week))\b/.test(q) && !/\b(?:current|today|now|atual|hoje|agora)\b/.test(q)) topics.splice(topics.indexOf("price"), 1, "price_history");
  return topics.slice(0, 2);
}
/** Topics whose readers filter by the question itself (a call number, a month, a wallet or community name, an outcome). */
const QUERY_TOPICS = new Set<typeof lookupSchema._output.topic>(["arborist", "wallets", "communities", "decisions", "price_history", "forum", "zechub_dao"]);
export async function prepareLocal(messages: ChatMessage[], signal: AbortSignal, priorSession: ZarvisSession = {}): Promise<LocalPlan> {
  signal.throwIfAborted();
  const session = sessionPreferences(priorSession, messages);
  const compatible = (!session.language || session.language === "en" || session.language === "pt") && (!session.currency || session.currency === "USD") && session.detail !== "detailed";
  const intent = compatible ? directIntent(messages) : undefined;
  // One detector for every deterministic block, so a direct answer, FAQ or calculator block is never mixed-language.
  const pt = answerLanguage(messages, session) === "pt";
  const query = intent?.type === "zip" ? `ZIP ${intent.number}` : intent?.type === "latest_zip" ? "What is the latest ZIP?" : retrievalQuestion(messages);
  if (intent?.type === "courtesy" || intent?.type === "preference") {
    const direct = intent.type === "courtesy" ? intent.thanks ? (pt ? "De nada!" : "You're welcome!") : (pt ? "Olá! Sou o Zarvis. Posso ajudar com Zcash e os dados públicos do OpenZcash." : "Hi! I'm Zarvis. I can help with Zcash and OpenZcash's public data.")
      : /^(?:please |por favor )?(?:answer|reply|respond|responda|responde)\b/.test(normalizeQuestion(messages.at(-1)?.content ?? ""))
        ? (pt ? "Combinado. Vou responder em português." : "Understood. I'll answer in English.")
        : /\b(?:usd|dollars|dolares)\b/.test(normalizeQuestion(messages.at(-1)?.content ?? ""))
          ? (pt ? "Combinado. Vou usar USD para valores monetários." : "Understood. I'll use USD for monetary amounts.")
          : (pt ? "Combinado. Vou manter as respostas objetivas." : "Understood. I'll keep answers concise.");
    return { query, documents: [], evidence: [], direct, external: false };
  }
  if (intent?.type === "faq") {
    const answer = faqAnswer(intent.id, pt);
    return { query, documents: [{ id: `direct-${intent.id}`, ...answer.source, text: answer.text, kind: "reference" }], evidence: [], direct: answer.text, reviewedFaq: true, external: false };
  }
  if (intent?.type === "mining") {
    const result = await lookupPublicData({ topic: "mining", query: "" }, signal);
    return { query, documents: [], evidence: [result], direct: miningAnswer(result.content, pt), external: false };
  }
  if (intent?.type === "arborist") {
    const result = await lookupPublicData({ topic: "arborist", query: "" }, signal);
    return { query, documents: [], evidence: [result], direct: arboristAnswer(result.content, pt), external: false };
  }
  const zip = isZipQuestion(query) ? await getZipCorpus(signal) : undefined;
  const documents = searchKnowledge(query, 4, 5000, zip?.corpus);
  if (intent?.type === "ledger") {
    const result = await lookupLedger(intent.filters, signal);
    const data = JSON.parse(result.content).data as LedgerSummary | undefined;
    const direct = (data ? ledgerAnswer(data, pt) ?? ledgerFactsAnswer(data, pt) : undefined) ?? (pt ? "O registro de pagamentos está indisponível agora. Isso não significa que o total seja zero. [Pagamentos do ZCG](https://openzcash.org/zcg/disbursements)." : "The payment ledger is unavailable right now. This does not mean the total is zero. [ZCG payments](https://openzcash.org/zcg/disbursements).");
    return { query, documents, evidence: [result], direct, external: false };
  }
  if (intent?.type === "treasury") {
    const result = await lookupPublicData({ topic: "treasuries", query: "" }, signal);
    return { query, documents, evidence: [result], direct: treasuryAnswer(result.content, intent.fund, pt), external: false };
  }
  const scenarioQuestion = /(?:simul|scenario|cenario|\b[0-9]+\s*[x×]\b)/i.test(query) && /treasur|tesour|cypherpunk|cipherpunk|lockbox|zcg/i.test(query);
  const topics = scenarioQuestion ? [] : intent?.type === "price" ? ["price" as const] : relevantTopics(query);
  const evidence = await Promise.all(topics.map((topic) => lookupPublicData({ topic, query: QUERY_TOPICS.has(topic) ? normalizeQuestion(query).slice(0, 120) : "" }, signal)));
  if (zip) evidence.push(zipCatalogEvidence(query, zip.corpus, zip.stale));
  signal.throwIfAborted();
  const q = normalizeQuestion(query);
  const currentExternal = /\b(?:latest|newest|current|ultimo|ultima|atual|today|hoje|recent\w*)\b/.test(q)
    && /\b(?:zips?|nu\d+|upgrade|release|protocol|protocolo|versao)\b/.test(q);
  const missingZip = zip && requestedZips(query).some((n) => !zip.corpus.documents.some((d) => d.number === n));
  const external = zip ? !!missingZip || (zip.stale && (currentExternal || intent?.type === "zip")) : currentExternal || (needsMiningResearch(query) && !topics.includes("mining"));
  const direct = intent?.type === "price" ? priceAnswer(evidence[0], pt)
    : intent?.type === "zip" && zip ? numberedZipAnswer(intent.number, intent.overview, zip.corpus, zip.stale, pt)
    : intent?.type === "latest_zip" && zip ? latestZipAnswer("What is the latest ZIP?", zip.corpus, zip.stale, pt) : undefined;
  return { query, documents, evidence, direct, external };
}

export function ledgerFactsAnswer(data: LedgerSummary, pt: boolean): string | undefined {
  if (!validDate(data.importedAt) || !ledgerQuerySchema.safeParse(data.filters).success || !validAmount(data.budgetedUsdOfPaidEntries) || !validAmount(data.recordedZecPaid) || !count(data.paidEntries) || !count(data.paidEntriesMissingUsd) || !count(data.paidEntriesMissingZec)) return;
  const names = { zcg_grants: "ZCG grants", coinholder_grants: "Coinholder grants", ic_payments: "IC payments", discretionary: "Discretionary spending", monthly: "Monthly operations" };
  const scope = names[data.filters.scope]; if (!scope) return;
  const usd = new Intl.NumberFormat(pt ? "pt-BR" : "en-US", { style: "currency", currency: "USD" }).format(Number(data.budgetedUsdOfPaidEntries));
  const zec = new Intl.NumberFormat(pt ? "pt-BR" : "en-US", { maximumFractionDigits: 8 }).format(Number(data.recordedZecPaid));
  const project = data.filters.search.replace(/[\[\]()*_`<>\n\r]/g, " ");
  const title = `${scope}${project ? ` · ${pt ? "contendo" : "matching"} “${project}”` : ""} · ${data.filters.year ?? (pt ? "todos os anos" : "all years")}`;
  const missing = data.paidEntriesMissingUsd || data.paidEntriesMissingZec;
  return pt
    ? `**${title}**: **${usd}** em valores orçados de **${data.paidEntries} registros marcados como pagos**; **${zec} ZEC** registrados como desembolsados.${missing ? " Alguns registros não têm valor em USD ou ZEC; os totais dessas colunas são parciais." : ""}\n\nValores históricos do registro, não cotação atual nem confirmação bancária. ${project ? "O filtro busca esse texto em projetos, destinatários e marcos; não confirma uma identidade única. " : ""}${data.filters.year !== null ? "O ano usa a data de pagamento e exclui linhas sem data. " : "Inclui registros sem data. "}Programas e planilhas operacionais são separados. Importado em ${date(data.importedAt!, pt)}. [Registro de pagamentos](https://openzcash.org/zcg/disbursements).`
    : `**${title}**: **${usd}** in budgeted values for **${data.paidEntries} entries marked paid**; **${zec} ZEC** recorded as disbursed.${missing ? " Some entries lack USD or ZEC values; totals for those columns are incomplete." : ""}\n\nHistorical ledger values, not current valuation or bank settlement. ${project ? "The filter matches this text in projects, recipients and milestones; it does not establish a single recipient identity. " : ""}${data.filters.year !== null ? "The year uses payment dates and excludes undated rows. " : "Undated entries are included. "}Programs and operations worksheets are separate. Imported ${date(data.importedAt!, pt)}. [Payment ledger](https://openzcash.org/zcg/disbursements).`;
}
