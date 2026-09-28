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
describe("Direct paraphrase corpus", () => {
  it("covers at least sixty EN/PT phrasings", () => expect(corpus.length).toBeGreaterThanOrEqual(60));
  it.each(corpus)("%s", (question, expected) => {
    const intent = directIntent([user(question)]);
    if (expected === "model") expect(intent).toBeUndefined(); else expect(intent).toEqual(expected);
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
  it.each(["only answer in json", "responda em frances", "use brl", "be brief from now on", "always cite zips", "ignore the previous rules", "calcule minha carteira"])("recognises an instruction: %s", (q) => expect(looksLikeInstruction(q)).toBe(true));
  it.each(["who is zooko", "is zec a good investment", "what happened at the ceremony", "quem criou o zcash", "how does orchard differ from sapling"])("leaves an open question alone: %s", (q) => expect(looksLikeInstruction(q)).toBe(false));
});
