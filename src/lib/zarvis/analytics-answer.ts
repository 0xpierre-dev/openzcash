import { locale, pick, type DirectLanguage } from "./language";
import type { MonthlyComparison, MonthlyReading, SupplyReading } from "./chain-analytics";
import type { Evidence } from "./local";

/** Exact factual requests only. Multi-part and analytical questions keep the model/tool path. */
export function directAnalyticsQuery(question: string, now = Date.now()): { metric: "supply" | "monthly_activity" | "monthly_comparison"; month: string | null } | undefined {
  const q = question.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[?!.¿]/g, "").trim().replace(/\s+/g, " ");
  if (/^(?:(?:what (?:is|are) (?:the )?(?:current )?(?:zcash |zec )?(?:circulating supply|total supply|shielded supply|pool balances|shielded pool balances))|(?:how much zec is (?:in (?:the )?(?:shielded )?pools|shielded))|(?:qual (?:e )?a oferta (?:circulante|total) (?:de |do )?(?:zec|zcash))|(?:quanto zec (?:esta|ha|tem) (?:em cada pool|nos pools(?: blindados)?|blindado))|(?:quais (?:sao )?os saldos (?:dos|de cada) pools?(?: blindados)?)|(?:cual es la oferta (?:circulante|total) de (?:zec|zcash))|(?:cuanto zec hay en (?:los )?pools(?: blindados)?))(?: (?:now|today|hoje|agora|hoy))?$/.test(q)) return { metric: "supply", month: null };
  const comparison = /^(?:compare|comparar|compara) /.test(q);
  const match = q.replace(/^(?:compare|comparar|compara) (?:a |la )?/, "").match(/^(?:(?:show|give me|mostre|mostrar|muestra) )?(?:(?:zcash|zec) )?(?:monthly (?:chain )?activity|atividade mensal|actividad mensual)(?: (?:for|in|de|do|em|en|del))? (.+)$/);
  if (!match) return;
  let month = /^\d{4}-\d{2}$/.test(match[1]) ? match[1] : undefined;
  if (/^(?:last month|mes passado|el mes pasado|mes anterior|previous month)$/.test(match[1])) {
    const date = new Date(now); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() - 1);
    month = date.toISOString().slice(0, 7);
  }
  if (/^(?:this month|este mes|esse mes|mes atual|current month)$/.test(match[1])) month = new Date(now).toISOString().slice(0, 7);
  if (!month) {
    const named = match[1].match(/^([a-z]+) (?:de )?(20\d{2})$/);
    const names = ["january janeiro enero", "february fevereiro febrero", "march marco marzo", "april abril", "may maio mayo", "june junho junio", "july julho julio", "august agosto", "september setembro septiembre", "october outubro octubre", "november novembro noviembre", "december dezembro diciembre"];
    const index = named ? names.findIndex(values => values.split(" ").includes(named[1])) : -1;
    if (named && index >= 0) month = named[2] + "-" + String(index + 1).padStart(2, "0");
  }
  if (month) return { metric: comparison ? "monthly_comparison" : "monthly_activity", month };
}
const zec = (value: string, lang: DirectLanguage) => new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 8 }).format(Number(value) / 1e8) + " ZEC";
const when = (value: string, lang: DirectLanguage) => new Intl.DateTimeFormat(locale(lang), { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " UTC";
export function analyticsAnswer(evidence: Evidence, lang: DirectLanguage): string {
  const unavailable = pick(lang, {
    en: "I could not verify these chain analytics. Missing data is not zero. Monthly queries support one calendar month in UTC.",
    pt: "Não consegui verificar esses dados da rede. Dados ausentes não significam zero. As consultas mensais aceitam um mês de calendário em UTC.",
    es: "No pude verificar estos datos de la red. Los datos ausentes no significan cero. Las consultas mensuales admiten un mes de calendario en UTC.",
  });
  const payload = JSON.parse(evidence.content).data;
  if (!payload) return unavailable;
  const links = (evidence.sources ?? []).map(s => "[" + s.title + "](" + s.url + ")").join(" · ");
  if (payload.metric === "monthly_comparison") {
    const c = payload.comparison as MonthlyComparison, changes = c.changes;
    if (!changes || !c.comparable) return pick(lang, {
      en: "This comparison includes a partial or incompatible period. A closed-month growth rate cannot be reported.",
      pt: "Esta comparação inclui um período parcial ou incompatível. Não é possível apresentar uma taxa de crescimento entre meses fechados.",
      es: "Esta comparación incluye un período parcial o incompatible. No se puede presentar una tasa de crecimiento entre meses cerrados.",
    }) + "\n\n" + links;
    const n = (value: number) => new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 2 }).format(value);
    const delta = (value: number) => (value > 0 ? "+" : "") + n(value);
    const rate = (value: number | null) => value === null ? "—" : delta(value) + "%";
    const pp = (value: number | null) => value === null ? "—" : delta(value) + " pp";
    const labels = pick(lang, {
      en: ["Chain activity", "Transactions", "Fully shielded share", "Pool-touching share", "Shielded closing balance"],
      pt: ["Atividade da rede", "Transações", "Participação totalmente blindada", "Participação com pools blindados", "Saldo blindado no fechamento"],
      es: ["Actividad de la red", "Transacciones", "Participación totalmente blindada", "Participación con pools blindados", "Saldo blindado al cierre"],
    });
    const monthLabel = (value: string) => new Intl.DateTimeFormat(locale(lang), { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(value + "-01T00:00:00Z"));
    const heading = "**" + labels[0] + " · " + monthLabel(c.previous.month) + " → " + monthLabel(c.current.month) + " · UTC**";
    const share = (value: number | null) => value === null ? "—" : n(value) + "%";
    // Core Markdown lists also render in the compact/mobile chat; GFM tables are not supported.
    const comparison = [
      [labels[1], n(changes.transactions.previous), n(changes.transactions.current), rate(changes.transactions.changePercent)],
      [labels[2], share(changes.fullyShielded.previousPercent), share(changes.fullyShielded.currentPercent), pp(changes.fullyShielded.changePercentagePoints)],
      [labels[3], share(changes.poolTouching.previousPercent), share(changes.poolTouching.currentPercent), pp(changes.poolTouching.changePercentagePoints)],
      [labels[4], zec(changes.closingShielded.previousZat, lang), zec(changes.closingShielded.currentZat, lang), rate(changes.closingShielded.changePercent)],
    ].map(([label, previous, current, change]) => "- **" + label + ":** " + previous + " → " + current + " (**" + change + "**)").join("\n");
    const note = pick(lang, {
      en: "Closed UTC months; coinbase excluded. pp means percentage points. A zero baseline has no growth rate. Transactions are not unique users, and these changes do not establish that a grant or project caused adoption. Monthly counts have one source.",
      pt: "Meses fechados em UTC; coinbase excluída. pp significa pontos percentuais. Uma base zero não permite calcular crescimento percentual. Transações não são usuários únicos, e essas mudanças não demonstram que um grant ou projeto causou adoção. As contagens mensais têm uma única fonte.",
      es: "Meses cerrados en UTC; coinbase excluida. pp significa puntos porcentuales. Una base cero no permite calcular crecimiento porcentual. Las transacciones no son usuarios únicos, y estos cambios no demuestran que un grant o proyecto causó adopción. Los recuentos mensuales tienen una sola fuente.",
    });
    const age = c.previous.stale || c.current.stale ? pick(lang, { en: " Source response is outdated.", pt: " A resposta da fonte está desatualizada.", es: " La respuesta de la fuente está desactualizada." }) : "";
    return heading + "\n\n" + comparison + "\n\n" + note + age + "\n\n" + links;
  }
  if (payload.metric === "supply") {
    if (payload.status === "mismatch") return pick(lang, {
      en: "The explorers disagree at the same block height. I could not establish one verified balance; the figures have not been averaged.",
      pt: "Os exploradores divergiram na mesma altura de bloco. Não consegui estabelecer um saldo único verificado; os valores não foram combinados.",
      es: "Los exploradores discrepan a la misma altura de bloque. No pude establecer un saldo único verificado; los valores no se han combinado.",
    }) + "\n\n" + links;
    const reading = payload.selected as SupplyReading | null;
    if (!reading) return unavailable;
    const labels = pick(lang, {
      en: ["Issued", "Circulating (issued minus Lockbox)", "Shielded"],
      pt: ["Emitido", "Circulante (emitido menos Lockbox)", "Blindado"],
      es: ["Emitido", "Circulante (emitido menos Lockbox)", "Blindado"],
    });
    const title = pick(lang, { en: "Supply at block ", pt: "Oferta no bloco ", es: "Oferta en el bloque " }) + reading.height + " · " + reading.provider;
    const facts = labels.slice(0, 3).map((label, i) => label + ": **" + zec([reading.totalZat, reading.circulatingZat, reading.shieldedZat][i], lang) + "**.").join("\n\n");
    const pools = reading.pools.map(p => "- **" + p.pool + ":** " + zec(p.balanceZat, lang)).join("\n");
    const comparison = payload.status === "matched" ? pick(lang, {
      en: "Both explorers agree at the same height and hash.",
      pt: "Os dois exploradores concordam na mesma altura e hash.",
      es: "Los dos exploradores coinciden en la misma altura y hash.",
    }) : payload.status === "different_heights" ? pick(lang, {
      en: "The sources have different heights; the newer indexed snapshot is shown, without claiming a confirmed match.",
      pt: "As fontes têm alturas diferentes; exibimos a leitura de maior altura, sem afirmar uma confirmação entre elas.",
      es: "Las fuentes tienen alturas diferentes; se muestra la lectura de mayor altura, sin afirmar una coincidencia confirmada.",
    }) : pick(lang, {
      en: "An equivalent second-source confirmation is unavailable.",
      pt: "A confirmação equivalente por uma segunda fonte está indisponível.",
      es: "No hay una confirmación equivalente de una segunda fuente.",
    });
    const freshness = reading.freshness === "current" ? "" : pick(lang, {
      en: " Freshness is " + reading.freshness + "; this is not a confirmed live balance.",
      pt: " A atualidade da leitura " + (reading.freshness === "stale" ? "está vencida" : "não foi confirmada") + "; não é um saldo ao vivo confirmado.",
      es: " La actualidad de la lectura " + (reading.freshness === "stale" ? "está vencida" : "no está confirmada") + "; no es un saldo en vivo confirmado.",
    });
    const dateLabel = pick(lang, { en: "Source response: ", pt: "Resposta da fonte: ", es: "Respuesta de la fuente: " });
    return "**" + title + "**\n\n" + facts + "\n\n" + pools + "\n\n" + comparison + freshness + " " + dateLabel + when(reading.reportedAt, lang) + ".\n\n" + links;
  }
  const m = payload.monthly as MonthlyReading;
  const number = (value: number) => new Intl.NumberFormat(locale(lang)).format(value);
  const percent = (value: number | null) => value === null ? "—" : number(value) + "%";
  const partial = m.periodStatus === "partial";
  const title = pick(lang, {
    en: "Chain activity · ", pt: "Atividade da rede · ", es: "Actividad de la red · ",
  }) + m.month + " · UTC" + (partial ? pick(lang, { en: " · partial month", pt: " · mês parcial", es: " · mes parcial" }) : "");
  const body = pick(lang, {
    en: "**" + number(m.totalTransactions) + " transactions**, excluding coinbase.\n\nFully shielded: **" + percent(m.fullyShielded.percent) + "** (" + number(m.fullyShielded.numerator) + "/" + number(m.totalTransactions) + "). Touching a shielded pool: **" + percent(m.poolTouching.percent) + "** (" + number(m.poolTouching.numerator) + "/" + number(m.totalTransactions) + ").",
    pt: "**" + number(m.totalTransactions) + " transações**, sem coinbase.\n\nTotalmente blindadas: **" + percent(m.fullyShielded.percent) + "** (" + number(m.fullyShielded.numerator) + "/" + number(m.totalTransactions) + "). Com participação de um pool blindado: **" + percent(m.poolTouching.percent) + "** (" + number(m.poolTouching.numerator) + "/" + number(m.totalTransactions) + ").",
    es: "**" + number(m.totalTransactions) + " transacciones**, sin coinbase.\n\nTotalmente blindadas: **" + percent(m.fullyShielded.percent) + "** (" + number(m.fullyShielded.numerator) + "/" + number(m.totalTransactions) + "). Con participación de un pool blindado: **" + percent(m.poolTouching.percent) + "** (" + number(m.poolTouching.numerator) + "/" + number(m.totalTransactions) + ").",
  });
  const flow = m.netFlowZat === null ? pick(lang, { en: "Net flow unavailable.", pt: "Fluxo líquido indisponível.", es: "Flujo neto no disponible." })
    : pick(lang, { en: "Net pool flow: ", pt: "Fluxo líquido dos pools: ", es: "Flujo neto de los pools: " }) + "**" + zec(m.netFlowZat, lang) + "**.";
  const note = pick(lang, {
    en: "Net flow is not gross shielding volume. These are the publisher's indexed aggregates, without an independent monthly count reconciliation.",
    pt: "Fluxo líquido não é o volume bruto de entradas blindadas. São os agregados indexados da fonte, sem reconciliação independente das contagens mensais.",
    es: "El flujo neto no es el volumen bruto de entradas blindadas. Son los agregados indexados de la fuente, sin conciliación independiente de los recuentos mensuales.",
  });
  const age = m.stale ? pick(lang, { en: " Source response is outdated.", pt: " A resposta da fonte está desatualizada.", es: " La respuesta de la fuente está desactualizada." }) : "";
  return "**" + title + "**\n\n" + body + "\n\n" + flow + " " + note + age + "\n\n" + when(m.reportedAt, lang) + " · " + links;
}
