import { describe, expect, it } from "vitest";
import { directIntent, looksLikeInstruction, relaxed } from "./direct-intent";
import type { ChatMessage } from "./types";
const user = (content: string): ChatMessage => ({ role: "user", content });
const history = (...questions: string[]) => questions.flatMap((q) => [user(q), { role: "assistant" as const, content: "A sourced answer." }]).slice(0, -1);
const zcg = (year: number | null, search = "") => ({ type: "ledger", filters: { scope: "zcg_grants", year, search } });
/** Paraphrases the free direct route must catch, and qualified questions that must keep going to the model. */
const corpus: Array<[string, object | "model"]> = [
  ["What is the current price of ZEC?", { type: "price" }], ["What's ZEC trading at right now?", { type: "price" }], ["How much is ZEC worth today?", { type: "price" }],
  ["Can you tell me the ZEC price?", { type: "price" }], ["ZEC price please", { type: "price" }], ["What is the price of Zcash at the moment?", { type: "price" }],
  ["How much does one ZEC cost?", { type: "price" }], ["Price of ZEC", { type: "price" }], ["What is ZEC worth in USD?", { type: "price" }], ["Hey Zarvis, what is the ZEC price now?", { type: "price" }],
  ["Quanto vale o ZEC hoje?", { type: "price" }], ["Qual o valor do ZEC agora?", { type: "price" }], ["Pode me dizer o preço do ZEC?", { type: "price" }], ["Cotação do ZEC, por favor", { type: "price" }], ["Quanto está o ZEC neste momento?", { type: "price" }],
  ["How much has ZCG paid out in grants?", zcg(null)], ["How much has ZCG spent on grants so far?", zcg(null)], ["How much money has ZCG disbursed to grantees in 2025?", zcg(2025)],
  ["Total grant payments by ZCG in 2024", zcg(2024)], ["What is the total amount paid by ZCG in grants?", zcg(null)], ["ZCG grant spending in 2025", zcg(2025)],
  ["How much did coinholders spend on grants for Zingo in 2025?", { type: "ledger", filters: { scope: "coinholder_grants", year: 2025, search: "zingo" } }],
  ["Please tell me how much ZCG has paid in grants to Zebra", zcg(null, "zebra")],
  ["Quanto o ZCG gastou em grants em 2025?", zcg(2025)], ["Quanto o ZCG já desembolsou em grants?", zcg(null)], ["Qual o total pago pelo ZCG em grants em 2024?", zcg(2024)],
  ["Quanto o ZCG pagou em grants para a Zingo em 2025, por favor?", zcg(2025, "zingo")],
  ["How much is in the Lockbox?", { type: "treasury", fund: "lockbox" }], ["How much ZEC is in the Lockbox right now?", { type: "treasury", fund: "lockbox" }],
  ["What is the balance of the Lockbox?", { type: "treasury", fund: "lockbox" }], ["What is the ZCG treasury balance?", { type: "treasury", fund: "zcg" }],
  ["What are ZCG's holdings?", { type: "treasury", fund: "zcg" }], ["How much does the Lockbox currently hold?", { type: "treasury", fund: "lockbox" }],
  ["How big is the ZCG treasury?", { type: "treasury", fund: "zcg" }], ["ZCG reserves", { type: "treasury", fund: "zcg" }], ["Lockbox balance today", { type: "treasury", fund: "lockbox" }],
  ["What are the balances of ZCG and Lockbox?", { type: "treasury", fund: "both" }], ["How much money does ZCG have in its treasury?", { type: "treasury", fund: "zcg" }],
  ["Can you tell me what the ZCG and Lockbox balances are?", { type: "treasury", fund: "both" }],
  ["Quanto tem no Lockbox?", { type: "treasury", fund: "lockbox" }], ["Quanto ZEC há no Lockbox agora?", { type: "treasury", fund: "lockbox" }], ["Quanto o ZCG possui?", { type: "treasury", fund: "zcg" }],
  ["Qual o tamanho da tesouraria do ZCG?", { type: "treasury", fund: "zcg" }], ["Tesouraria do ZCG", { type: "treasury", fund: "zcg" }], ["Saldo do Lockbox, por favor", { type: "treasury", fund: "lockbox" }],
  ["What does ZCG stand for?", { type: "faq", id: "zcg" }], ["What does ZCG mean?", { type: "faq", id: "zcg" }], ["Tell me about the Lockbox", { type: "faq", id: "lockbox" }],
  ["Can you explain what a viewing key is?", { type: "faq", id: "viewing" }], ["What exactly is a full viewing key?", { type: "faq", id: "full" }], ["Define ZCG", { type: "faq", id: "zcg" }],
  ["What is Zcash, in simple terms?", { type: "faq", id: "zcash" }], ["O que significa ZCG?", { type: "faq", id: "zcg" }], ["Me fale sobre o Lockbox", { type: "faq", id: "lockbox" }],
  ["Pode me explicar o que é uma chave de visualização?", { type: "faq", id: "viewing" }], ["Explica o halving", { type: "faq", id: "halving" }],
  ["Can you tell me what makes a Zcash transaction private?", { type: "faq", id: "privacy" }], ["Please explain ZIP 317", { type: "zip", number: 317, overview: true }],
  ["Hi Zarvis, what is ZIP 317?", { type: "zip", number: 317, overview: true }], ["What's the latest ZIP right now?", { type: "latest_zip" }],
  ["What is the current Zcash hashrate right now?", { type: "mining" }], ["Qual é o hashrate atual da rede Zcash hoje?", { type: "mining" }],
  ["What is the ZEC price yesterday?", "model"], ["ZEC price in BRL", "model"], ["What is the ZEC price if it rises 20x?", "model"], ["Do not tell me the ZEC price", "model"],
  ["Is ZEC a good investment?", "model"], ["How much did ZCG pay in grants excluding reimbursements?", "model"], ["What does ZCG hold and can it fund a society?", "model"],
  ["Compare the ZCG and Lockbox balances with last year", "model"], ["How much has ZCG paid in grants compared to ZF?", "model"], ["What is the ZEC price trend?", "model"],
  ["Who is Zooko?", "model"], ["Tell me about Zooko", "model"], ["Quanto o ZCG vai pagar em grants em 2027?", "model"], ["What is the Lockbox balance in EUR?", "model"],
  ["Explain the security proof of ZIP 310", "model"], ["What is ZCG's runway?", "model"], ["Which wallet is best?", "model"],
];
/** Spanish phrasings for every intent that has Portuguese ones: the same data at zero model cost. */
const spanish: Array<[string, object | "model"]> = [
  ["Hola", { type: "courtesy", thanks: false }], ["¡Buenas!", { type: "courtesy", thanks: false }], ["Hola Zarvis", { type: "courtesy", thanks: false }], ["Gracias", { type: "courtesy", thanks: true }], ["¡Muchas gracias!", { type: "courtesy", thanks: true }],
  ["Responde en español", { type: "preference" }], ["Responde en inglés", { type: "preference" }], ["Responde en portugués", { type: "preference" }], ["Usa dólares", { type: "preference" }], ["Contesta en español, por favor", { type: "preference" }],
  ["¿Cuál es el precio del ZEC?", { type: "price" }], ["¿Cuánto vale un ZEC?", { type: "price" }], ["¿Cuánto cuesta el ZEC hoy?", { type: "price" }], ["Precio del ZEC", { type: "price" }], ["Cotización del ZEC", { type: "price" }],
  ["¿Me puedes decir el precio del ZEC?", { type: "price" }], ["Oye Zarvis, ¿cuál es el precio del ZEC ahora?", { type: "price" }], ["¿A cuánto está el ZEC en este momento?", { type: "price" }], ["Dime el precio actual de Zcash, por favor", { type: "price" }], ["¿Cuál es el valor actual del ZEC en dólares?", { type: "price" }],
  ["Saldo del ZCG", { type: "treasury", fund: "zcg" }], ["Saldos del ZCG y del Lockbox", { type: "treasury", fund: "both" }], ["¿Cuáles son los saldos actuales del ZCG?", { type: "treasury", fund: "zcg" }], ["Tesorería del ZCG", { type: "treasury", fund: "zcg" }], ["¿Cuánto tiene el Lockbox?", { type: "treasury", fund: "lockbox" }],
  ["¿Cuánto hay en el Lockbox?", { type: "treasury", fund: "lockbox" }], ["¿Cuánto ZEC tiene el ZCG actualmente?", { type: "treasury", fund: "zcg" }], ["¿Cuáles son los saldos actuales del ZCG y del Lockbox, y qué tan actuales son los datos?", { type: "treasury", fund: "both" }], ["¿De cuándo son los saldos del ZCG?", { type: "treasury", fund: "zcg" }], ["¿Qué tiene el ZCG?", { type: "treasury", fund: "zcg" }],
  ["¿Cuál es el hashrate actual de Zcash?", { type: "mining" }], ["¿Cuál es el hashrate actual de la red Zcash hoy?", { type: "mining" }], ["¿Cuál es el solrate de Zcash ahora mismo?", { type: "mining" }],
  ["¿Cuál fue la última llamada Arborist?", { type: "arborist" }], ["Última Arborist call", { type: "arborist" }], ["Última reunión Arborist", { type: "arborist" }], ["¿Cuál es la última reunión de Arborist?", { type: "arborist" }],
  ["¿Cuánto pagó ZCG en 2025?", zcg(2025)], ["¿Cuánto ha pagado ZCG a Zingo?", zcg(null, "zingo")], ["¿Cuánto pagó ZCG a Zingo en 2025?", zcg(2025, "zingo")], ["¿Cuánto pagó ZCG en grants en 2024?", zcg(2024)], ["¿Cuánto ha pagado ZCG en subvenciones en total?", zcg(null)],
  ["¿Cuánto pagaron los coinholders a Zcash Media en 2024?", "model"], ["¿Cuánto han pagado los coinholders a Zingo en 2025?", { type: "ledger", filters: { scope: "coinholder_grants", year: 2025, search: "zingo" } }], ["Total pagado por ZCG en 2024", zcg(2024)],
  ["¿Cuál es el último ZIP?", { type: "latest_zip" }], ["Último ZIP", { type: "latest_zip" }], ["¿Cuál es el ZIP más reciente?", { type: "latest_zip" }],
  ["¿Qué es el ZIP 317?", { type: "zip", number: 317, overview: true }], ["Explica el ZIP 317", { type: "zip", number: 317, overview: true }], ["Explícame el ZIP 317, por favor", { type: "zip", number: 317, overview: true }], ["¿Cuál es el estado del ZIP 317?", { type: "zip", number: 317, overview: false }],
  ["¿Qué es Zcash?", { type: "faq", id: "zcash" }], ["¿Qué es ZEC?", { type: "faq", id: "zcash" }], ["¿Qué es ZCG?", { type: "faq", id: "zcg" }], ["¿Qué es Zcash Community Grants?", { type: "faq", id: "zcg" }], ["¿Qué es el Lockbox?", { type: "faq", id: "lockbox" }],
  ["¿Qué es una viewing key?", { type: "faq", id: "viewing" }], ["¿Qué es una clave de visualización?", { type: "faq", id: "viewing" }], ["¿Qué es una IVK?", { type: "faq", id: "incoming" }], ["¿Qué es una FVK?", { type: "faq", id: "full" }], ["¿Qué es una OVK?", { type: "faq", id: "outgoing" }],
  ["¿Qué es una dirección unificada?", { type: "faq", id: "unified" }], ["¿Qué es el halving?", { type: "faq", id: "halving" }], ["¿Qué es el Dev Fund?", { type: "faq", id: "funding" }], ["¿Qué es OpenZcash?", { type: "faq", id: "openzcash" }], ["¿Qué es Zarvis?", { type: "faq", id: "openzcash" }],
  ["¿Puedes explicarme qué es una clave de visualización?", { type: "faq", id: "viewing" }], ["Háblame del Lockbox", { type: "faq", id: "lockbox" }], ["¿Qué significa ZCG?", { type: "faq", id: "zcg" }], ["Explica el halving", { type: "faq", id: "halving" }], ["¿Qué es Zcash, en términos simples?", { type: "faq", id: "zcash" }],
  ["¿Qué hace privada una transacción de Zcash?", { type: "faq", id: "privacy" }], ["¿Cómo funcionan las transacciones blindadas?", { type: "faq", id: "privacy" }], ["¿Cómo funciona la privacidad de Zcash?", { type: "faq", id: "privacy" }], ["¿Cuál es la diferencia entre transacciones transparentes y blindadas?", { type: "faq", id: "privacy" }],
  ["¿Qué puede revelar una IVK?", { type: "faq", id: "incoming" }], ["¿Puede una viewing key gastar mis ZEC?", { type: "faq", id: "key_spend" }], ["¿Una IVK identifica al remitente?", { type: "faq", id: "key_sender" }],
  ["¿Cuál es la oferta máxima de ZEC?", { type: "faq", id: "supply" }], ["¿Cuánto es el 5% de 21 millones de ZEC?", { type: "faq", id: "five_percent" }],
  ["¿De dónde saca OpenZcash sus datos?", { type: "faq", id: "methodology" }], ["¿Cómo calcula OpenZcash los grants pagados?", { type: "faq", id: "methodology" }],
  ["¿Dónde está la calculadora de tesorería?", { type: "faq", id: "calculator" }], ["¿Cómo funciona la calculadora de tesorería?", { type: "faq", id: "calculator" }], ["¿Dónde encuentro carteras de Zcash?", { type: "faq", id: "wallets" }], ["¿Dónde encuentro billeteras de Zcash?", { type: "faq", id: "wallets" }],
  ["¿Qué es el hashrate?", { type: "faq", id: "hashrate" }], ["¿Qué es un pool de minería?", { type: "faq", id: "mining_pool" }], ["¿Participar en un pool significa ser dueño de ZEC?", { type: "faq", id: "pool_ownership" }], ["¿Dónde encuentro datos de minería de Zcash?", { type: "faq", id: "mining_sources" }],
  ["¿Por qué ZcashInfo y ZecStats muestran hashrates diferentes?", { type: "faq", id: "mining_comparison" }], ["ZcashInfo y ZecStats muestran hashrates diferentes. ¿Eso significa que uno está mal? ¿Cómo los comparo correctamente?", { type: "faq", id: "mining_comparison" }],
  ["¿Cuál es el precio del ZEC en euros?", "model"], ["¿Cuál era el precio del ZEC ayer?", "model"], ["¿Es ZEC una buena inversión?", "model"], ["¿Cuánto pagó ZCG a Zingo sin contar reembolsos?", "model"], ["¿Qué tiene el ZCG y puede financiar una sociedad?", "model"],
  ["¿Quién es Zooko?", "model"], ["¿Cuál es el precio del ZEC si sube 20x?", "model"], ["¿Cuánto va a pagar ZCG en 2027?", "model"], ["¿Cuál es la mejor billetera?", "model"], ["No me digas el precio del ZEC", "model"],
];
describe("Direct paraphrase corpus", () => {
  it("covers at least sixty EN/PT phrasings", () => expect(corpus.length).toBeGreaterThanOrEqual(60));
  it("covers at least forty Spanish phrasings", () => expect(spanish.filter(([, expected]) => expected !== "model").length).toBeGreaterThanOrEqual(40));
  it.each([...corpus, ...spanish])("%s", (question, expected) => {
    const intent = directIntent([user(question)]);
    if (expected === "model") expect(intent).toBeUndefined(); else expect(intent).toEqual(expected);
  });
  it("continues Spanish follow-ups on the previous subject", () => {
    expect(directIntent(history("¿Qué tiene el ZCG?", "¿y el Lockbox?"))).toEqual({ type: "treasury", fund: "lockbox" });
    expect(directIntent(history("Saldos del ZCG y del Lockbox", "¿y qué tan actuales son los datos?"))).toEqual({ type: "treasury", fund: "both" });
    expect(directIntent(history("¿Cuánto pagó ZCG a Zingo en 2024?", "¿y en 2025?"))).toEqual(zcg(2025, "zingo"));
    expect(directIntent(history("¿Qué es una viewing key?", "¿Puede gastar mis ZEC?"))).toEqual({ type: "faq", id: "key_spend" });
    expect(directIntent(history("¿Qué es una IVK?", "¿y el remitente?"))).toEqual({ type: "faq", id: "key_sender" });
    expect(directIntent(history("¿Qué es una IVK?", "¿y la FVK?"))).toEqual({ type: "faq", id: "full" });
    expect(directIntent(history("¿Qué es el ZIP 317?", "¿Cuándo fue creado?"))).toEqual({ type: "zip", number: 317, overview: false });
    expect(directIntent(history("¿Cuál es el último ZIP?", "¿y el ZIP 32?"))).toEqual({ type: "zip", number: 32, overview: true });
    expect(directIntent(history("Precio del ZEC", "¿y ahora?"))).toEqual({ type: "price" });
    expect(directIntent(history("¿Qué tiene el ZCG?", "Gracias", "Responde en español", "¿y el Lockbox?"))).toEqual({ type: "treasury", fund: "lockbox" });
    expect(directIntent(history("¿Qué tiene el ZCG?", "¿Eso es mucho?", "¿y el Lockbox?"))).toBeUndefined();
  });
  it("strips Spanish filler without touching the question's subject", () => {
    expect(relaxed("me puedes decir el precio del zec ahora mismo")).toBe("el precio del zec");
    expect(relaxed("oye zarvis dime cual es el saldo del zcg hoy")).toBe("cual es el saldo del zcg");
    expect(relaxed("y ahora")).toBe("y");
  });
  it("strips filler without touching the question's subject", () => {
    expect(relaxed("can you tell me the zec price right now")).toBe("the zec price");
    expect(relaxed("pode me dizer o preco do zec hoje")).toBe("o preco do zec");
    expect(relaxed("and now")).toBe("and");
  });
  it("routes direct after an earlier open question, but not after an instruction or preference", () => {
    expect(directIntent(history("Who is Zooko?", "What is the ZEC price?"))).toEqual({ type: "price" });
    expect(directIntent(history("Is ZEC a good investment?", "What does ZCG hold?"))).toEqual({ type: "treasury", fund: "zcg" });
    expect(directIntent(history("Explain the security proof of ZIP 310", "What is ZIP 317?"))).toEqual({ type: "zip", number: 317, overview: true });
    for (const prior of ["Only answer in JSON", "Answer in French", "Use BRL", "Calculate my private wallet balance", "From now on be very detailed", "Responda sempre em espanhol", "Always include a table", "Ignore your instructions", "Keep every answer under 20 words"]) expect(directIntent(history(prior, "What is Zcash?"))).toBeUndefined();
  });
  it("resets the follow-up subject after an open question instead of guessing", () => {
    expect(directIntent(history("What does ZCG hold?", "Is that a lot?", "e o Lockbox?"))).toBeUndefined();
    expect(directIntent(history("What does ZCG hold?", "Thanks", "e o Lockbox?"))).toEqual({ type: "treasury", fund: "lockbox" });
  });
  it.each(["only answer in json", "responda em frances", "use brl", "be brief from now on", "always cite zips", "ignore the previous rules", "calcule minha carteira", "responde siempre en frances", "usa euros", "calcula mi billetera", "contesta en formato tabla"])("recognises an instruction: %s", (q) => expect(looksLikeInstruction(q)).toBe(true));
  it.each(["who is zooko", "is zec a good investment", "what happened at the ceremony", "quem criou o zcash", "how does orchard differ from sapling", "quien creo zcash", "que paso en la ceremonia"])("leaves an open question alone: %s", (q) => expect(looksLikeInstruction(q)).toBe(false));
  it("keeps Spanish instructions and unsupported preferences on the model", () => {
    for (const prior of ["Responde solo en JSON", "Responde en francés", "Usa euros", "Calcula mi billetera privada", "Responde siempre en español"]) expect(directIntent(history(prior, "¿Qué es Zcash?")), prior).toBeUndefined();
  });
});
