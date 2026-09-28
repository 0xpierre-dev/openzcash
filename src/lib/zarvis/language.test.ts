import { describe, expect, it } from "vitest";
import { answerLanguage, directLanguage, locale, normalizeQuestion, pick, questionLanguage } from "./language";
import type { ChatMessage } from "./types";
const user = (content: string): ChatMessage => ({ role: "user", content });
const answer = (content: string): ChatMessage => ({ role: "assistant", content });

describe("Answer language", () => {
  it.each([
    "Quais são os saldos do ZCG?", "Uma IVK identifica o remetente?", "Como funciona a privacidade do Zcash?", "Onde encontro carteiras Zcash?",
    "Saldo do Lockbox", "De onde vem os dados do OpenZcash?", "Explique ZIP 317", "Olá", "Obrigado", "sim", "e o Lockbox?", "e em 2025?",
    "Analise as limitações dessa tesouraria comunitária se o ZEC subir 20 vezes.",
  ])("reads Portuguese from function words, not a keyword shortlist: %s", (q) => expect(questionLanguage(q)).toBe("pt"));
  it.each(["Como funciona a viewing key?", "Como funciona uma viewing key", "Qual o treasury balance da ZCG?", "Quanto o ZCG pagou em grants em 2024?"])("lets Portuguese function words outweigh English domain nouns: %s", (q) => expect(questionLanguage(q)).toBe("pt"));
  it.each(["Saldo ZCG", "Saldo Lockbox", "Como esta o ZCG", "Último ZIP", "Última Arborist call"])("breaks a Portuguese/Spanish tie toward Portuguese, which has direct templates: %s", (q) => expect(questionLanguage(q)).toBe("pt"));
  it.each(["¿Último ZIP?", "¿Saldo ZCG?", "¡Saldo Lockbox!", "¿Última Arborist call?"])("breaks the same tie toward Spanish when the raw text carries ¿, ¡ or ñ, which Portuguese never writes: %s", (q) => expect(questionLanguage(q)).toBe("es"));
  it.each([
    "Vale a pena minerar Zcash?", "Vale a pena usar Zashi?", "Como se usa uma viewing key?", "Ela usa dólares?", "Pago em ZEC ou dólares?", "Use dólares", "Usar dólares",
    "O que significa ZCG?", "Me fale sobre o Lockbox", "Por que o ZEC caiu?", "Explique sobre ZIP 317",
  ])("keeps Portuguese whose everyday words are also Spanish (se, vale, usa, pago, use, usar, sobre, por, dólares): %s", (q) => expect(questionLanguage(q)).toBe("pt"));
  it.each(["Use USD", "Use the calculator", "Use the latest data"])("never reads Portuguese from an English turn that starts with \"use\": %s", (q) => expect(questionLanguage(q)).not.toBe("pt"));
  it.each(["Zashi on OS", "Zcash as money", "ZEC at ATH"])("never reads Portuguese from an English turn whose words happen to spell os/as: %s", (q) => expect(questionLanguage(q)).not.toBe("pt"));
  it.each(["What are the ZCG balances?", "ZEC price", "and the Lockbox?", "hi", "thanks", "yes", "Latest ZIP", "What is a viewing key?", "What do the balances show?", "a viewing key", "Zcash on iOS"])("reads English: %s", (q) => expect(questionLanguage(q)).toBe("en"));
  it.each([
    "¿Cuál es el precio actual de ZEC?", "¿Dónde encuentro billeteras de Zcash?", "¿Qué es ZIP 317?", "¿Cuánto vale un ZEC?", "Precio del ZEC", "Cotización del ZEC",
    "¿Cuáles son los saldos actuales del ZCG?", "Saldos del ZCG y del Lockbox", "Tesorería del ZCG", "¿Cuánto tiene el Lockbox?", "¿Qué tan actuales son los datos?",
    "¿Cuál es el hashrate actual de Zcash?", "¿Cuál fue la última llamada Arborist?", "Última reunión Arborist", "¿Cuánto pagó ZCG a Zingo en 2025?",
    "¿Qué es una clave de visualización?", "¿Una IVK identifica al remitente?", "¿Dónde encuentro carteras de Zcash?", "Hola", "Gracias", "Muchas gracias", "¿Y el Lockbox?", "Responde en español",
    "¿Qué significa ZCG?", "¿Qué significa hashrate?", "¿Qué quiere decir ZCG?", "Háblame de Zcash", "Cuéntame sobre ZCG", "Total pagado por ZCG", "Usa dólares", "¿Cuánto tiene el ZCG en ZEC?", "¿Cuál es la cotización del ZEC?",
  ])("reads Spanish from function words, with or without accents and ¿?: %s", (q) => expect(questionLanguage(q)).toBe("es"));
  it.each(["Cual es el precio del ZEC", "Cuanto vale un ZEC hoy", "Que es el Lockbox", "Donde encuentro billeteras de Zcash"])("reads Spanish typed without accents or punctuation: %s", (q) => expect(questionLanguage(q)).toBe("es"));
  it.each(["Quel est le prix actuel du ZEC ?", "Combien détient la Lockbox ?"])("never mistakes French for Portuguese or Spanish: %s", (q) => expect(questionLanguage(q)).toBe("other"));
  it.each(["What is the price of ZEC?", "ZEC price today", "Explain the Lockbox"])("never reads Spanish from an English turn: %s", (q) => expect(questionLanguage(q)).toBe("en"));
  it.each(["2025", "ZIP 317", "ivk", "Lockbox"])("leaves wordless turns undecided: %s", (q) => expect(questionLanguage(q)).toBeUndefined());
  it("falls back to the previous user turn, then to English", () => {
    expect(answerLanguage([user("Quanto o ZCG pagou em grants em 2024?"), answer("Um total."), user("2025")])).toBe("pt");
    expect(answerLanguage([user("ZCG grant payments in 2024"), answer("A total."), user("2025")])).toBe("en");
    expect(answerLanguage([user("ZIP 317")])).toBe("en");
  });
  it("lets an explicit stored preference win over the question's own words", () => {
    expect(answerLanguage([user("What is Zcash?")], { language: "pt" })).toBe("pt");
    expect(answerLanguage([user("O que é Zcash?")], { language: "en" })).toBe("en");
    expect(answerLanguage([user("O que é Zcash?")], { language: "es" })).toBe("es");
    expect(answerLanguage([user("What is Zcash?")], { language: "es" })).toBe("es");
    expect(answerLanguage([user("¿Qué es Zcash?")], { language: "fr" })).toBe("other");
  });
  it("keeps a Spanish conversation in Spanish across wordless follow-ups", () => {
    expect(answerLanguage([user("¿Cuánto pagó ZCG a Zingo en 2024?"), answer("Un total."), user("2025")])).toBe("es");
    expect(answerLanguage([user("¿Cuál es el último ZIP?"), answer("Uno."), user("ZIP 317")])).toBe("es");
  });
  it("maps every answer language to a direct template language, English for the rest", () => {
    expect(directLanguage("es")).toBe("es"); expect(directLanguage("pt")).toBe("pt"); expect(directLanguage("en")).toBe("en"); expect(directLanguage("other")).toBe("en");
    expect(pick("es", { en: "a", pt: "b", es: "c" })).toBe("c"); expect(pick("es", { en: "a" })).toBe("a"); expect(pick("pt", { en: "a", pt: "b" })).toBe("b");
    expect(locale("es")).toBe("es-419"); expect(locale("pt")).toBe("pt-BR"); expect(locale("en")).toBe("en-US");
    expect(normalizeQuestion("¿Cuál es el precio del ZEC?")).toBe("cual es el precio del zec");
    expect(normalizeQuestion("¡Hola!")).toBe("hola");
  });
});
