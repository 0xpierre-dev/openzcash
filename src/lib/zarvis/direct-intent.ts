import type { ChatMessage } from "./types";
import type { LedgerQuery } from "./ledger";
import { matchDirectFaq, type FaqId } from "./direct-faq";
import { normalizeQuestion } from "./language";
export { normalizeQuestion } from "./language";

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
const canonical = (s: string) => normalizeQuestion(s).replace(/^(?:please |por favor )/, "").replace(/(?: please| por favor)$/, "").replace(/\b(zcg|lockbox)'s\b/g, "$1");
/** Conversational filler removed before a second matching attempt; the exact question is always tried first so short follow-ups such as "and now?" keep their meaning. */
const FILLER_START = /^(?:(?:hey|hi|hello|ola|oi|ei|hola|oye|buenas)[, ]+zarvis[, ]+|zarvis[, ]+)?(?:(?:please|por favor|pode|poderia|voce pode|voce poderia|puedes|podrias|me puedes|me podrias|sabes|can you|could you|would you|will you|do you know|you know|i want to know|i'd like to know|i would like to know|i need to know|quero saber|gostaria de saber|eu quero saber|eu gostaria de saber|preciso saber|quiero saber|me gustaria saber|necesito saber|just|quickly|rapidamente|rapidinho|rapido) )*(?:(?:tell me|show me|give me|me diga|me diz|me dizer|me fala|me falar|me mostre|me mostra|me explicar|me explique|me explica|dizer|informar|me informar|mostrar|dime|decirme|decir|muestrame|mostrarme|explicame|explicarme|cuentame|contarme|me dices|me explicas|me muestras) )?(?:(?:please|por favor|quickly|rapidamente|rapido) )*/;
const FILLER_ANYWHERE = /\b(?:right now|at the moment|at this moment|at present|as of (?:now|today)|currently|presently|nowadays|today|now|atualmente|neste momento|no momento|hoje em dia|hoje|agora|actualmente|en este momento|ahora mismo|hoy en dia|hoy|ahora|for me|pra mim|para mim|para mi|por gentileza|please|por favor)\b/g;
export const relaxed = (q: string) => q.replace(FILLER_START, "").replace(FILLER_ANYWHERE, " ").replace(/\s+/g, " ").trim();
/** An earlier user turn that reads as an instruction or preference (imperative, always/only, format, language, currency or persona words) keeps the whole conversation on the model; an ordinary open question does not. */
const INSTRUCTION = /^(?:please |por favor )?(?:(?:do not|don't|dont|never|always|only|just|nao|nunca|sempre|somente|apenas|siempre|solamente) )?(?:answer|reply|respond|use|write|speak|talk|format|output|return|give|keep|make|be|show|display|include|exclude|add|remove|skip|avoid|stop|start|call|calculate|compute|convert|list|summarize|translate|ignore|forget|remember|pretend|assume|consider|treat|act|responda|responde|usar|escreva|fale|formate|mostre|inclua|exclua|adicione|remova|evite|pare|comece|calcule|compute|converta|liste|resuma|traduza|ignora|esqueca|lembre|finja|suponha|considere|trate|aja|seja|de|me de|me chame|contesta|contestame|respondeme|usa (?:dolares|euros|reales|usd|brl|eur|json|markdown|tablas?|formato|vinetas|espanol|ingles|portugues|frances)|escribe|habla|muestra|incluye|excluye|agrega|elimina|evita|calcula|convierte|resume (?:en|la|el|lo|los|las|esto|eso|todo)|traduce|olvida|recuerda|finge|supon|actua|llamame)\b/;
const CONSTRAINT = /\b(?:always|only|never|from now on|going forward|in (?:all|every|future) (?:answers?|replies|responses)|sempre|somente|apenas|nunca|de agora em diante|daqui (?:em|para) (?:diante|frente)|a partir de agora|em todas as respostas|siempre|solamente|a partir de ahora|de ahora en adelante|en todas las respuestas|json|markdown|table|tabela|tabla|bullets?|list format|format|formato|language|lingua|idioma|english|portuguese|spanish|french|german|italian|ingles|portugues|espanhol|espanol|frances|alemao|aleman|italiano|brl|eur|reais|euros|currency|moeda|moneda|short|brief|concise|detailed|verbose|breve|curt[oa]|conciso|detalhad\w*|detallad\w*|tone|tom|tono|style|estilo|words|palavras|palabras|characters|caracteres|emojis?|uppercase|lowercase|maiuscul\w*|minuscul\w*|mayuscul\w*|ignore|pretend|act as|you are|voce e|finja|finge|role|persona|system prompt|instructions?|instrucoes|instrucciones|my (?:address|key|keys|seed|balance|wallet)|minha (?:chave|carteira|seed|senha|semente)|meu (?:endereco|saldo)|mi (?:direccion|clave|billetera|cartera|saldo|semilla|frase))\b/;
export const looksLikeInstruction = (q: string) => INSTRUCTION.test(q) || CONSTRAINT.test(q);
const project = '(?:"[a-z0-9][a-z0-9 -]{0,79}"|zingo|zashi|zec ?hub|zebra|zaino|nighthawk|ywallet|zcash media)';
const paid = "(?:pay|paid|pay out|paid out|spend|spent|disburse|disbursed|distribute|distributed)";
const pago = "(?:pagou|pagaram|gastou|gastaram|desembolsou|desembolsaram|distribuiu|distribuiram)";
const pagado = "(?:pago|pagado|gasto|gastado|desembolso|desembolsado|distribuyo|distribuido)";
const allTime = "(?: in (20[0-9]{2})| (all time|in total|overall|so far|to date|ever))?";
const todoTempo = "(?: (?:em )?(20[0-9]{2})| (no total|ao todo|ate hoje|ate agora|desde o inicio))?";
const todoTiempo = "(?: (?:en )?(20[0-9]{2})| (en total|hasta ahora|hasta hoy|hasta la fecha|desde el inicio))?";
const enGrants = "(?: en (?:grants|subvenciones|subsidios|hitos|becas))?";
// Group order in every ledger pattern: program, project, year.
const ledgerPatterns = [
  new RegExp(`^how much (?:money |usd )?(?:did|has|have) (?:the )?(zcg|coinholders?) (?:already |ever )?${paid} (?:in|on|for|to|towards|through) (?:grants|grant payments|grant milestones|milestones|grantees)(?: (?:to|for|on) (${project}))?${allTime}$`),
  new RegExp(`^how much (?:money |usd )?(?:the )?(zcg|coinholders?) (?:has|have|did) (?:already |ever )?${paid} (?:in|on|for|to|towards|through) (?:grants|grant payments|grant milestones|milestones|grantees)(?: (?:to|for|on) (${project}))?${allTime}$`),
  new RegExp(`^quanto (?:o |os |a )?(zcg|coinholders?) (?:ja )?${pago} (?:em|com|para) (?:grants|marcos|subsidios|grantees)(?: (?:ao|para|para a|para o|a|com) (${project}))?${todoTempo}$`),
  new RegExp(`^(?:total |all )?(zcg|coinholder) (?:grant payments|paid grants|grant spending|grant disbursements|grant payouts|payments in grants|spending on grants)(?: (?:to|for) (${project}))?(?: (?:in|for) (20[0-9]{2})| (all time|in total|overall|so far|to date))?$`),
  new RegExp(`^(?:what (?:is|are|was|were) )?(?:the )?total (?:grant )?(?:payments|spending|disbursements|payouts|amount paid) (?:by|from|of) (?:the )?(zcg|coinholders?)(?: (?:in|on|for) grants)?(?: (?:to|for) (${project}))?${allTime}$`),
  new RegExp(`^(?:qual (?:e |foi )?(?:o )?)?total (?:pago|gasto|desembolsado) (?:pelo|pela|pelos|do|da|de) (?:o )?(zcg|coinholders?)(?: em grants)?(?: (?:ao|para|a) (${project}))?${todoTempo}$`),
  // Spanish puts the verb before the subject ("cuánto pagó ZCG"); "en grants" is optional because the deterministic answer names the grant ledger and its exclusions itself.
  new RegExp(`^cuanto (?:dinero |usd )?(?:ha |han )?(?:ya )?${pagado} (?:el |los )?(zcg|coinholders?)(?: ya)?${enGrants}(?: (?:a|al|a la|para|para el|para la) (${project}))?${todoTiempo}$`),
  new RegExp(`^cuanto (?:dinero |usd )?(?:el |los )?(zcg|coinholders?) (?:ha |han )?(?:ya )?${pagado}${enGrants}(?: (?:a|al|a la|para|para el|para la) (${project}))?${todoTiempo}$`),
  new RegExp(`^(?:cual (?:es|fue) (?:el )?)?total (?:pagado|gastado|desembolsado) (?:por|de|del) (?:el |los )?(zcg|coinholders?)(?: en (?:grants|subvenciones))?(?: (?:a|al|para) (${project}))?${todoTiempo}$`),
];
const funds = (raw: string): "zcg" | "lockbox" | "both" | undefined => {
  const q = raw.replace(/\b(?:the|o|do|da|de|el|la|del) /g, "").replace(/^(?:treasury|tesouraria|tesouro|caixa|reservas?|tesoreria|fondos) /, "").replace(/ (?:treasury|treasuries|fund|funds|reserves?|tesouraria|tesouro|caixa|reservas?|tesoreria|fondos?)$/, "");
  return /^(?:zcg (?:and|e|y|\+) lockbox|lockbox (?:and|e|y|\+) zcg)$/.test(q) ? "both" : q === "zcg" || q === "lockbox" ? q : undefined;
};
const latest = "(?:the )?(?:(?:latest|current) )?";
/** Data-age clauses: the deterministic treasury answer already stamps report, import, estimate and quote times with their ages. */
const freshness = "(?:how (?:old|fresh|recent|current|up to date) (?:are|is) (?:(?:the|these|those|this) )?(?:data|figures|numbers|balances|information|they|it)|de quando (?:sao|e) (?:(?:os|esses|essas|essa) )?(?:dados|saldos|numeros|informacoes)|qual (?:e )?a idade d(?:os|esses|essas|as) (?:dados|saldos|numeros|informacoes)|quao (?:antigos|recentes|atuais) (?:sao|estao) (?:(?:os|esses) )?(?:dados|saldos|numeros)|que tan (?:actuales|recientes|antiguos|viejos|actualizados) (?:son|estan) (?:(?:los|estos|esos) )?(?:datos|saldos|numeros|cifras)|de cuando son (?:(?:los|estos|esos) )?(?:datos|saldos|numeros|cifras)|cual es la antiguedad de (?:(?:los|estos) )?(?:datos|saldos))";
const holdings = "(?:treasury|treasuries|treasury balances?|balances?|holdings|reserves)";
const treasuryPattern = new RegExp(`^(?:what (?:does|do) (.+) hold|what (?:is|are) ${latest}(.+?) ${holdings}|what ${latest}(.+?) ${holdings} (?:is|are)|what (?:is|are) ${latest}(?:balances?|holdings|treasury balances?) (?:of|in) (?:the )?(.+?)|how (?:big|large) (?:is|are) ${latest}(.+?) ${holdings}|what do ${latest}(.+?) (?:treasury )?balances (?:tell (?:us|me)|show|say)|how much(?: zec| money| cash| usd)? (?:does|do) (.+?) (?:hold|have|own)(?: in (?:its |their )?(?:treasury|reserves|treasuries))?|how much(?: zec| money| cash| usd)? (?:is|are) (?:there )?in (?:the )?(.+?)|how (?:old|fresh|recent|current) (?:is|are) ${latest}(.+?) (?:balances?|balance data|treasury data|data|figures)|qua(?:l|is) (?:e |sao )?(?:o saldo|os saldos)(?: atua(?:l|is)| mais recentes?)? (?:do |de |da )?(.+?)|qual (?:e )?(?:o )?(?:tamanho|valor) d[oa] (?:tesouraria|tesouro|reserva|saldo) d[oa] (.+?)|quais (?:sao )?(?:os |as )?(?:ativos|fundos|reservas) d[oa] (.+?)|o que (?:os )?saldos(?: atuais| mais recentes)? (?:do |de )?(.+?) (?:nos |me )?(?:dizem|mostram|indicam)|de quando (?:e|sao) (?:o saldo|os saldos|os dados)(?: atua(?:l|is)| mais recentes?)? (?:do |de )?(.+?)|quanto (?:zec |dinheiro )?(?:tem|ha|existe|esta) (?:no |na |em |do |de )(.+?)|quanto (?:o |a )?(.+?) (?:tem|possui|guarda|detem)(?: em (?:zec|caixa|tesouraria|reserva))?|o que (?:o |a )?(.+?) (?:possui|detem|guarda)(?: em (?:zec|caixa))?|cual(?:es)? (?:es|son) (?:el saldo|los saldos)(?: actual(?:es)?| mas recientes?)? (?:del |de |de la |de los )?(.+?)|cual (?:es )?(?:el )?(?:tamano|valor) de (?:la tesoreria|la reserva|el saldo) (?:del |de |de la )?(.+?)|cuales (?:son )?(?:los |las )?(?:activos|fondos|reservas) (?:del |de |de la )?(.+?)|que (?:nos |me )?(?:dicen|muestran|indican) (?:los )?saldos(?: actuales| mas recientes)? (?:del |de )?(.+?)|de cuando (?:es|son) (?:el saldo|los saldos|los datos)(?: actual(?:es)?| mas recientes?)? (?:del |de |de la )?(.+?)|cuanto (?:zec |dinero )?(?:tiene|hay|posee|guarda) (?:en )?(?:el |la )?(.+?)(?: en (?:su )?(?:zec|efectivo|tesoreria|reserva))?|que (?:tiene|posee|guarda) (?:el |la )?(.+?)(?: en (?:zec|efectivo))?)(?: (?:and|e|y) ${freshness})?$`);
const shortTreasuryPattern = new RegExp(`^(?:saldos? (?:do|de|da|del|de la) (.+)|(?:tesouraria|tesouro|reservas?|caixa|tesoreria|fondos) (?:do|de|da|del|de la) (.+)|${latest}(.+?) (?:balances?|holdings|treasury|reserves)|(.+?) balance sheet)$`);
const freshnessFollowUp = new RegExp(`^(?:(?:and|e|y) )?${freshness}$`);
const pricePattern = /^(?:(?:qual (?:e )?(?:o |a )?(?:preco|cotacao|valor) (?:atual )?d[oa] |quanto (?:esta|custa|vale|esta valendo|esta custando) (?:o |um |1 )?|(?:o |a )?(?:preco|cotacao|valor) (?:atual )?d[oa] )(?:zec|zcash)(?: (?:hoje|agora|em usd|em dolar|em dolares))?|(?:cual (?:es )?(?:el |la )?(?:precio|cotizacion|valor) (?:actual )?(?:del|de|de la) |(?:a )?cuanto (?:esta|cuesta|vale|esta valiendo|esta costando|se cotiza) (?:el |un |1 )?|(?:el |la )?(?:precio|cotizacion|valor) (?:actual )?(?:del|de|de la) )(?:zec|zcash)(?: (?:hoy|ahora|en usd|en dolares))?|(?:what is|what's|whats|how much is) (?:the )?(?:current |latest |today's )?(?:zec|zcash) (?:price|usd price|value|quote)(?: (?:today|now|in usd|in dollars))?|(?:what is|what's|whats) (?:the )?(?:current |latest |today's )?(?:price|value|quote) (?:of|for) (?:one |1 |a )?(?:zec|zcash)(?: (?:today|now|in usd|in dollars))?|(?:the )?(?:current |latest )?(?:zec|zcash) (?:price|preco|cotacao|usd price|price in usd|value)(?: (?:today|now|hoje|agora))?|(?:the )?(?:current |latest )?price of (?:zec|zcash)|(?:what is|what's|whats) (?:one |1 |a )?(?:zec|zcash) (?:worth|trading at|going for|selling for)(?: (?:today|now|in usd|in dollars))?|how much (?:is|does) (?:one |1 |a )?(?:zec|zcash) (?:worth|cost|trading at|going for|selling for)(?: (?:today|now|in usd|in dollars))?|how much is (?:one |1 |a )?(?:zec|zcash)(?: (?:in usd|in dollars|today|now))?|(?:zec|zcash) (?:to|in) usd)$/;
const miningPattern = /^(?:qual (?:e )?o (?:hashrate|solrate) (?:atual )?(?:da rede |do |de )?(?:zcash|zec)(?: (?:hoje|agora))?|cual (?:es )?(?:el )?(?:hashrate|solrate) (?:actual )?(?:de la red |del |de )?(?:zcash|zec)(?: (?:hoy|ahora))?|(?:what is|what's) (?:the )?(?:current )?(?:zcash|zec)(?: network)? (?:hashrate|solrate)(?: (?:today|now))?)(?: (?:cite (?:a fonte a data e a janela de medicao|a data e a janela)|cita (?:la fuente la fecha y la ventana de medicion|la fecha y la ventana)|include (?:the )?source (?:date|time) and (?:averaging )?window))?$/;
const arboristPattern = /^(?:(?:what|which|when) (?:is|was) the (?:latest|last|most recent|newest) arborist call|(?:the )?(?:latest|last|most recent|newest) arborist call|qual (?:foi |e |é )?(?:a |o )?(?:ultima|ultimo|mais recente) (?:arborist call|call (?:do|da) arborist|reuniao (?:do |da )?arborist)|(?:a )?ultima arborist call|cual (?:fue |es )?(?:la |el )?(?:ultima|ultimo|mas reciente) (?:arborist call|llamada (?:de |del )?arborist|reunion (?:de |del )?arborist|call (?:de |del )?arborist)|(?:la )?ultima (?:llamada|reunion) arborist)$/;
const zipPattern = /^(?:(?:what is|what's|whats|o que e|explique|explain|que es|explica|explicame) (?:o |el )?zip[ -]*([0-9]{1,6})|zip[ -]*([0-9]{1,6})|(?:what is (?:the )?(?:status|title|created date) of|qual (?:e )?(?:o status|o titulo|a data de criacao) (?:do|de)|cual (?:es )?(?:el estado|el status|el titulo|la fecha de creacion) (?:del|de)) zip[ -]*([0-9]{1,6})|when was zip[ -]*([0-9]{1,6}) created)$/;
const latestZipPattern = /^(?:qual (?:e )?(?:o )?(?:ultimo|mais recente) zip|cual (?:es )?(?:el )?(?:ultimo|mas reciente|mas nuevo) zip|cual (?:es )?el zip (?:mas reciente|mas nuevo)|(?:what is|what's|whats) (?:the )?(?:latest|newest|last) zip|latest zip|ultimo zip)$/;
const zipStatusFollowUp = /^(?:what is its status|and its status|when was it created|qual (?:e )?o status dele|e o status|quando foi criado|cual es su estado|y su estado|cuando fue creado|cuando se creo)$/;
const keyTopic = (intent?: DirectIntent) => intent?.type === "faq" && ["viewing", "incoming", "full", "outgoing", "key_spend", "key_sender"].includes(intent.id);

function resolve(q: string, previous?: DirectIntent): DirectIntent | undefined {
  const exact = resolveExact(q, previous);
  if (exact) return exact;
  const plain = relaxed(q);
  return plain && plain !== q ? resolveExact(plain, previous) : undefined;
}
function resolveExact(q: string, previous?: DirectIntent): DirectIntent | undefined {
  if (/^(?:hi|hello|hey|ola|oi|hola|buenas|hello zarvis|hi zarvis|ola zarvis|oi zarvis|hola zarvis|buenas zarvis)$/.test(q)) return { type: "courtesy", thanks: false };
  if (/^(?:thanks|thank you|obrigado|obrigada|valeu|gracias|muchas gracias)$/.test(q)) return { type: "courtesy", thanks: true };
  if (/^(?:(?:answer|reply|respond|responda|responde|respondeme|contesta|contestame)(?: to me|me)? (?:in|em|en) (?:english|ingles|portuguese|portugues|spanish|espanhol|espanol)|(?:use|usar|usa|mostre em|muestra en|show amounts in) (?:usd|dollars|dolares)|keep answers short|be brief|seja breve|respostas curtas|se breve|respuestas cortas)$/.test(q)) return { type: "preference" };
  if (pricePattern.test(q)) return { type: "price" };
  if (miningPattern.test(q)) return { type: "mining" };
  if (arboristPattern.test(q)) return { type: "arborist" };
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
  const zip = q.match(zipPattern);
  if (zip) return { type: "zip", number: Number(zip.slice(1).find(Boolean)), overview: !zip[3] && !zip[4] };
  if (latestZipPattern.test(q)) return { type: "latest_zip" };
  const faq = matchDirectFaq(q);
  if (faq) return { type: "faq", id: faq };
  const year = q.match(/^(?:(?:and|e|y|what about|how about)(?: (?:in|em|en))? )?(20[0-9]{2})$/);
  if (year && previous?.type === "ledger" && Number(year[1]) >= 2016 && Number(year[1]) <= 2100) return { ...previous, filters: { ...previous.filters, year: Number(year[1]) } };
  const nextFund = q.match(/^(?:and|e|y|what about|how about|que hay de|y que hay de) (?:the |o |el )?(zcg|lockbox)$/);
  if (nextFund && previous?.type === "treasury") return { type: "treasury", fund: nextFund[1] as "zcg" | "lockbox" };
  if (previous?.type === "treasury" && freshnessFollowUp.test(q)) return previous;
  const nextZip = q.match(/^(?:and|e|y|what about|how about) (?:o |el )?zip[ -]*([0-9]{1,6})$/);
  if (nextZip && (previous?.type === "zip" || previous?.type === "latest_zip")) return { type: "zip", number: Number(nextZip[1]), overview: previous.type === "zip" ? previous.overview : true };
  if (previous?.type === "zip" && zipStatusFollowUp.test(q)) return { ...previous, overview: false };
  if (previous?.type === "latest_zip" && zipStatusFollowUp.test(q)) return previous;
  if (previous?.type === "price" && /^(?:and now|e agora|y ahora|what about now)$/.test(q)) return previous;
  if (keyTopic(previous)) {
    if (/^(?:can it spend my zec|can it spend|ela pode gastar meus zec|pode gastar meus zec|puede gastar mis zec|puede gastar)$/.test(q)) return { type: "faq", id: "key_spend" };
    if (previous?.type === "faq" && ["incoming", "key_sender"].includes(previous.id) && /^(?:can it identify the sender|and the sender|e o remetente|y el remitente|puede identificar al remitente)$/.test(q)) return { type: "faq", id: "key_sender" };
    if (/^(?:and (?:the |a )?full viewing key|e (?:a |uma )?fvk|y (?:la |una )?fvk|y la full viewing key)$/.test(q)) return { type: "faq", id: "full" };
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
