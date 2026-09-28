import type { ChatMessage } from "./types";
import type { LedgerQuery } from "./ledger";
import { matchDirectFaq, type FaqId } from "./direct-faq";

export type DirectIntent =
  | { type: "price" }
  | { type: "mining" }
  | { type: "arborist" }
  | { type: "ledger"; filters: LedgerQuery }
  | { type: "treasury"; fund: "zcg" | "lockbox" | "both" }
  | { type: "faq"; id: FaqId }
  | { type: "zip"; number: number; overview: boolean }
  | { type: "latest_zip" }
  | { type: "courtesy"; thanks: boolean }
  | { type: "preference" };
export const normalizeQuestion = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replaceAll("’", "'").replace(/[?!]/g, "").replace(/[.,](?!\d)/g, "").replace(/\s+/g, " ").trim();
const canonical = (s: string) => normalizeQuestion(s).replace(/^(?:please |por favor )/, "").replace(/(?: please| por favor)$/, "").replace(/\b(zcg|lockbox)'s\b/g, "$1");
/** Conversational filler removed before a second matching attempt; the exact question is always tried first so short follow-ups such as "and now?" keep their meaning. */
const FILLER_START = /^(?:(?:hey|hi|hello|ola|oi|ei)[, ]+zarvis[, ]+|zarvis[, ]+)?(?:(?:please|por favor|pode|poderia|voce pode|voce poderia|can you|could you|would you|will you|do you know|you know|i want to know|i'd like to know|i would like to know|i need to know|quero saber|gostaria de saber|eu quero saber|eu gostaria de saber|preciso saber|just|quickly|rapidamente|rapidinho) )*(?:(?:tell me|show me|give me|me diga|me diz|me dizer|me fala|me falar|me mostre|me mostra|me explicar|me explique|me explica|dizer|informar|me informar|mostrar) )?(?:(?:please|por favor|quickly|rapidamente) )*/;
const FILLER_ANYWHERE = /\b(?:right now|at the moment|at this moment|at present|as of (?:now|today)|currently|presently|nowadays|today|now|atualmente|neste momento|no momento|hoje em dia|hoje|agora|for me|pra mim|para mim|por gentileza|please|por favor)\b/g;
export const relaxed = (q: string) => q.replace(FILLER_START, "").replace(FILLER_ANYWHERE, " ").replace(/\s+/g, " ").trim();
/** An earlier user turn that reads as an instruction or preference (imperative, always/only, format, language, currency or persona words) keeps the whole conversation on the model; an ordinary open question does not. */
const INSTRUCTION = /^(?:please |por favor )?(?:(?:do not|don't|dont|never|always|only|just|nao|nunca|sempre|somente|apenas) )?(?:answer|reply|respond|use|write|speak|talk|format|output|return|give|keep|make|be|show|display|include|exclude|add|remove|skip|avoid|stop|start|call|calculate|compute|convert|list|summarize|translate|ignore|forget|remember|pretend|assume|consider|treat|act|responda|responde|usar|escreva|fale|formate|mostre|inclua|exclua|adicione|remova|evite|pare|comece|calcule|compute|converta|liste|resuma|traduza|ignora|esqueca|lembre|finja|suponha|considere|trate|aja|seja|de|me de|me chame)\b/;
const CONSTRAINT = /\b(?:always|only|never|from now on|going forward|in (?:all|every|future) (?:answers?|replies|responses)|sempre|somente|apenas|nunca|de agora em diante|daqui (?:em|para) (?:diante|frente)|a partir de agora|em todas as respostas|json|markdown|table|tabela|bullets?|list format|format|formato|language|lingua|idioma|english|portuguese|spanish|french|german|italian|ingles|portugues|espanhol|frances|alemao|italiano|brl|eur|reais|euros|currency|moeda|short|brief|concise|detailed|verbose|breve|curt[oa]|conciso|detalhad\w*|tone|tom|style|estilo|words|palavras|characters|caracteres|emojis?|uppercase|lowercase|maiuscul\w*|minuscul\w*|ignore|pretend|act as|you are|voce e|finja|role|persona|system prompt|instructions?|instrucoes|my (?:address|key|keys|seed|balance|wallet)|minha (?:chave|carteira|seed|senha|semente)|meu (?:endereco|saldo))\b/;
export const looksLikeInstruction = (q: string) => INSTRUCTION.test(q) || CONSTRAINT.test(q);
const project = '(?:"[a-z0-9][a-z0-9 -]{0,79}"|zingo|zashi|zec ?hub|zebra|zaino|nighthawk|ywallet|zcash media)';
const paid = "(?:pay|paid|pay out|paid out|spend|spent|disburse|disbursed|distribute|distributed)";
const pago = "(?:pagou|pagaram|gastou|gastaram|desembolsou|desembolsaram|distribuiu|distribuiram)";
const allTime = "(?: in (20[0-9]{2})| (all time|in total|overall|so far|to date|ever))?";
const todoTempo = "(?: (?:em )?(20[0-9]{2})| (no total|ao todo|ate hoje|ate agora|desde o inicio))?";
// Group order in every ledger pattern: program, project, year.
const ledgerPatterns = [
  new RegExp(`^how much (?:money |usd )?(?:did|has|have) (?:the )?(zcg|coinholders?) (?:already |ever )?${paid} (?:in|on|for|to|towards|through) (?:grants|grant payments|grant milestones|milestones|grantees)(?: (?:to|for|on) (${project}))?${allTime}$`),
  new RegExp(`^how much (?:money |usd )?(?:the )?(zcg|coinholders?) (?:has|have|did) (?:already |ever )?${paid} (?:in|on|for|to|towards|through) (?:grants|grant payments|grant milestones|milestones|grantees)(?: (?:to|for|on) (${project}))?${allTime}$`),
  new RegExp(`^quanto (?:o |os |a )?(zcg|coinholders?) (?:ja )?${pago} (?:em|com|para) (?:grants|marcos|subsidios|grantees)(?: (?:ao|para|para a|para o|a|com) (${project}))?${todoTempo}$`),
  new RegExp(`^(?:total |all )?(zcg|coinholder) (?:grant payments|paid grants|grant spending|grant disbursements|grant payouts|payments in grants|spending on grants)(?: (?:to|for) (${project}))?(?: (?:in|for) (20[0-9]{2})| (all time|in total|overall|so far|to date))?$`),
  new RegExp(`^(?:what (?:is|are|was|were) )?(?:the )?total (?:grant )?(?:payments|spending|disbursements|payouts|amount paid) (?:by|from|of) (?:the )?(zcg|coinholders?)(?: (?:in|on|for) grants)?(?: (?:to|for) (${project}))?${allTime}$`),
  new RegExp(`^(?:qual (?:e |foi )?(?:o )?)?total (?:pago|gasto|desembolsado) (?:pelo|pela|pelos|do|da|de) (?:o )?(zcg|coinholders?)(?: em grants)?(?: (?:ao|para|a) (${project}))?${todoTempo}$`),
];
const funds = (raw: string): "zcg" | "lockbox" | "both" | undefined => {
  const q = raw.replace(/\b(?:the|o|do|da|de) /g, "").replace(/ (?:treasury|treasuries|fund|funds|reserves?|tesouraria|tesouro|caixa|reservas?)$/, "");
  return /^(?:zcg (?:and|e|\+) lockbox|lockbox (?:and|e|\+) zcg)$/.test(q) ? "both" : q === "zcg" || q === "lockbox" ? q : undefined;
};
const latest = "(?:the )?(?:(?:latest|current) )?";
/** Data-age clauses: the deterministic treasury answer already stamps report, import, estimate and quote times with their ages. */
const freshness = "(?:how (?:old|fresh|recent|current|up to date) (?:are|is) (?:(?:the|these|those|this) )?(?:data|figures|numbers|balances|information|they|it)|de quando (?:sao|e) (?:(?:os|esses|essas|essa) )?(?:dados|saldos|numeros|informacoes)|qual (?:e )?a idade d(?:os|esses|essas|as) (?:dados|saldos|numeros|informacoes)|quao (?:antigos|recentes|atuais) (?:sao|estao) (?:(?:os|esses) )?(?:dados|saldos|numeros))";
const holdings = "(?:treasury|treasuries|treasury balances?|balances?|holdings|reserves)";
const treasuryPattern = new RegExp(`^(?:what (?:does|do) (.+) hold|what (?:is|are) ${latest}(.+?) ${holdings}|what ${latest}(.+?) ${holdings} (?:is|are)|what (?:is|are) ${latest}(?:balances?|holdings|treasury balances?) (?:of|in) (?:the )?(.+?)|how (?:big|large) (?:is|are) ${latest}(.+?) ${holdings}|what do ${latest}(.+?) (?:treasury )?balances (?:tell (?:us|me)|show|say)|how much(?: zec| money| cash| usd)? (?:does|do) (.+?) (?:hold|have|own)(?: in (?:its |their )?(?:treasury|reserves|treasuries))?|how much(?: zec| money| cash| usd)? (?:is|are) (?:there )?in (?:the )?(.+?)|how (?:old|fresh|recent|current) (?:is|are) ${latest}(.+?) (?:balances?|balance data|treasury data|data|figures)|qua(?:l|is) (?:e |sao )?(?:o saldo|os saldos)(?: atua(?:l|is)| mais recentes?)? (?:do |de |da )?(.+?)|qual (?:e )?(?:o )?(?:tamanho|valor) d[oa] (?:tesouraria|tesouro|reserva|saldo) d[oa] (.+?)|quais (?:sao )?(?:os |as )?(?:ativos|fundos|reservas) d[oa] (.+?)|o que (?:os )?saldos(?: atuais| mais recentes)? (?:do |de )?(.+?) (?:nos |me )?(?:dizem|mostram|indicam)|de quando (?:e|sao) (?:o saldo|os saldos|os dados)(?: atua(?:l|is)| mais recentes?)? (?:do |de )?(.+?)|quanto (?:zec |dinheiro )?(?:tem|ha|existe|esta) (?:no |na |em |do |de )(.+?)|quanto (?:o |a )?(.+?) (?:tem|possui|guarda|detem)(?: em (?:zec|caixa|tesouraria|reserva))?|o que (?:o |a )?(.+?) (?:possui|detem|guarda)(?: em (?:zec|caixa))?)(?: (?:and|e) ${freshness})?$`);
const shortTreasuryPattern = new RegExp(`^(?:saldo (?:do|de|da) (.+)|(?:tesouraria|tesouro|reservas?|caixa) (?:do|de|da) (.+)|${latest}(.+?) (?:balances?|holdings|treasury|reserves)|(.+?) balance sheet)$`);
const freshnessFollowUp = new RegExp(`^(?:(?:and|e) )?${freshness}$`);
const pricePattern = /^(?:(?:qual (?:e )?(?:o )?(?:preco|cotacao|valor) (?:atual )?d[oa] |quanto (?:esta|custa|vale|esta valendo|esta custando) (?:o |um |1 )?|(?:o )?(?:preco|cotacao|valor) (?:atual )?d[oa] )(?:zec|zcash)(?: (?:hoje|agora|em usd|em dolar|em dolares))?|(?:what is|what's|whats|how much is) (?:the )?(?:current |latest |today's )?(?:zec|zcash) (?:price|usd price|value|quote)(?: (?:today|now|in usd|in dollars))?|(?:what is|what's|whats) (?:the )?(?:current |latest |today's )?(?:price|value|quote) (?:of|for) (?:one |1 |a )?(?:zec|zcash)(?: (?:today|now|in usd|in dollars))?|(?:the )?(?:current |latest )?(?:zec|zcash) (?:price|preco|cotacao|usd price|price in usd|value)(?: (?:today|now|hoje|agora))?|(?:the )?(?:current |latest )?price of (?:zec|zcash)|(?:what is|what's|whats) (?:one |1 |a )?(?:zec|zcash) (?:worth|trading at|going for|selling for)(?: (?:today|now|in usd|in dollars))?|how much (?:is|does) (?:one |1 |a )?(?:zec|zcash) (?:worth|cost|trading at|going for|selling for)(?: (?:today|now|in usd|in dollars))?|how much is (?:one |1 |a )?(?:zec|zcash)(?: (?:in usd|in dollars|today|now))?|(?:zec|zcash) (?:to|in) usd)$/;
const keyTopic = (intent?: DirectIntent) => intent?.type === "faq" && ["viewing", "incoming", "full", "outgoing", "key_spend", "key_sender"].includes(intent.id);

function resolve(q: string, previous?: DirectIntent): DirectIntent | undefined {
  const exact = resolveExact(q, previous);
  if (exact) return exact;
  const plain = relaxed(q);
  return plain && plain !== q ? resolveExact(plain, previous) : undefined;
}
function resolveExact(q: string, previous?: DirectIntent): DirectIntent | undefined {
  if (/^(?:hi|hello|hey|ola|oi|hello zarvis|hi zarvis|ola zarvis|oi zarvis)$/.test(q)) return { type: "courtesy", thanks: false };
  if (/^(?:thanks|thank you|obrigado|obrigada|valeu)$/.test(q)) return { type: "courtesy", thanks: true };
  if (/^(?:(?:answer|reply|respond|responda|responde)(?: to me)? (?:in|em) (?:english|ingles|portuguese|portugues)|(?:use|usar|mostre em|show amounts in) (?:usd|dollars|dolares)|keep answers short|be brief|seja breve|respostas curtas)$/.test(q)) return { type: "preference" };
  if (pricePattern.test(q)) return { type: "price" };
  if (/^(?:qual (?:e )?o (?:hashrate|solrate) (?:atual )?(?:da rede |do |de )?(?:zcash|zec)(?: (?:hoje|agora))?|(?:what is|what's) (?:the )?(?:current )?(?:zcash|zec)(?: network)? (?:hashrate|solrate)(?: (?:today|now))?)(?: (?:cite (?:a fonte a data e a janela de medicao|a data e a janela)|include (?:the )?source (?:date|time) and (?:averaging )?window))?$/.test(q)) return { type: "mining" };
  if (/^(?:(?:what|which|when) (?:is|was) the (?:latest|last|most recent|newest) arborist call|(?:the )?(?:latest|last|most recent|newest) arborist call|qual (?:foi |e |é )?(?:a |o )?(?:ultima|ultimo|mais recente) (?:arborist call|call (?:do|da) arborist|reuniao (?:do |da )?arborist)|(?:a )?ultima arborist call)$/.test(q)) return { type: "arborist" };
  for (const pattern of ledgerPatterns) {
    const m = q.match(pattern);
    if (m) {
      const year = m[3] ? Number(m[3]) : null;
      if (year !== null && (year < 2016 || year > 2100)) return;
      return { type: "ledger", filters: { scope: m[1] === "zcg" ? "zcg_grants" : "coinholder_grants", year, search: (m[2] ?? "").replaceAll('"', '') } };
    }
  }
  const treasury = q.match(treasuryPattern);
  const shortTreasury = q.match(shortTreasuryPattern);
  const fund = funds(treasury?.slice(1).find(Boolean) ?? shortTreasury?.slice(1).find(Boolean) ?? "");
  if (fund) return { type: "treasury", fund };
  const zip = q.match(/^(?:(?:what is|what's|whats|o que e|explique|explain) zip[ -]*([0-9]{1,6})|zip[ -]*([0-9]{1,6})|(?:what is (?:the )?(?:status|title|created date) of|qual (?:e )?(?:o status|o titulo|a data de criacao) (?:do|de)) zip[ -]*([0-9]{1,6})|when was zip[ -]*([0-9]{1,6}) created)$/);
  if (zip) return { type: "zip", number: Number(zip.slice(1).find(Boolean)), overview: !zip[3] && !zip[4] };
  if (/^(?:qual (?:e )?(?:o )?(?:ultimo|mais recente) zip|(?:what is|what's|whats) (?:the )?(?:latest|newest|last) zip|latest zip|ultimo zip)$/.test(q)) return { type: "latest_zip" };
  const faq = matchDirectFaq(q);
  if (faq) return { type: "faq", id: faq };
  const year = q.match(/^(?:(?:and|e|what about|how about)(?: (?:in|em))? )?(20[0-9]{2})$/);
  if (year && previous?.type === "ledger" && Number(year[1]) >= 2016 && Number(year[1]) <= 2100) return { ...previous, filters: { ...previous.filters, year: Number(year[1]) } };
  const nextFund = q.match(/^(?:and|e|what about|how about) (?:the |o )?(zcg|lockbox)$/);
  if (nextFund && previous?.type === "treasury") return { type: "treasury", fund: nextFund[1] as "zcg" | "lockbox" };
  if (previous?.type === "treasury" && freshnessFollowUp.test(q)) return previous;
  const nextZip = q.match(/^(?:and|e|what about|how about) (?:o )?zip[ -]*([0-9]{1,6})$/);
  if (nextZip && (previous?.type === "zip" || previous?.type === "latest_zip")) return { type: "zip", number: Number(nextZip[1]), overview: previous.type === "zip" ? previous.overview : true };
  if (previous?.type === "zip" && /^(?:what is its status|and its status|when was it created|qual (?:e )?o status dele|e o status|quando foi criado)$/.test(q)) return { ...previous, overview: false };
  if (previous?.type === "latest_zip" && /^(?:what is its status|and its status|when was it created|qual (?:e )?o status dele|e o status|quando foi criado)$/.test(q)) return previous;
  if (previous?.type === "price" && /^(?:and now|e agora|what about now)$/.test(q)) return previous;
  if (keyTopic(previous)) {
    if (/^(?:can it spend my zec|can it spend|ela pode gastar meus zec|pode gastar meus zec)$/.test(q)) return { type: "faq", id: "key_spend" };
    if (previous?.type === "faq" && ["incoming", "key_sender"].includes(previous.id) && /^(?:can it identify the sender|and the sender|e o remetente)$/.test(q)) return { type: "faq", id: "key_sender" };
    if (/^(?:and (?:the |a )?full viewing key|e (?:a |uma )?fvk)$/.test(q)) return { type: "faq", id: "full" };
  }
}

/** Prior instructions or preferences may carry language/format constraints and are never silently discarded; an earlier open question only resets the follow-up subject. */
export function directIntent(messages: ChatMessage[]): DirectIntent | undefined {
  if (messages.at(-1)?.role !== "user") return;
  const turns = messages.filter((message) => message.role === "user");
  let previous: DirectIntent | undefined;
  let latest: DirectIntent | undefined;
  for (const [index, message] of turns.entries()) {
    const q = canonical(message.content);
    latest = resolve(q, previous);
    if (!latest) {
      if (index === turns.length - 1 || looksLikeInstruction(q)) return;
      previous = undefined; continue;
    }
    if (latest.type !== "preference" && latest.type !== "courtesy") previous = latest;
  }
  return latest;
}
