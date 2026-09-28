import { describe, expect, it } from "vitest";
import { answerLanguage, questionLanguage } from "./language";
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
  it.each(["Saldo ZCG", "Saldo Lockbox", "Como esta o ZCG"])("breaks a Portuguese/Spanish tie toward Portuguese, which has direct templates: %s", (q) => expect(questionLanguage(q)).toBe("pt"));
  it.each(["Zashi on OS", "Zcash as money", "ZEC at ATH"])("never reads Portuguese from an English turn whose words happen to spell os/as: %s", (q) => expect(questionLanguage(q)).not.toBe("pt"));
  it.each(["What are the ZCG balances?", "ZEC price", "and the Lockbox?", "hi", "thanks", "yes", "Latest ZIP", "What is a viewing key?", "What do the balances show?", "a viewing key", "Zcash on iOS"])("reads English: %s", (q) => expect(questionLanguage(q)).toBe("en"));
  it.each(["¿Cuál es el precio actual de ZEC?", "¿Dónde encuentro billeteras de Zcash?", "¿Qué es ZIP 317?", "Quel est le prix actuel du ZEC ?", "Combien détient la Lockbox ?"])("never mistakes Spanish or French for Portuguese: %s", (q) => expect(questionLanguage(q)).toBe("other"));
  it.each(["2025", "ZIP 317", "ivk", "Lockbox"])("leaves wordless turns undecided: %s", (q) => expect(questionLanguage(q)).toBeUndefined());
  it("falls back to the previous user turn, then to English", () => {
    expect(answerLanguage([user("Quanto o ZCG pagou em grants em 2024?"), answer("Um total."), user("2025")])).toBe("pt");
    expect(answerLanguage([user("ZCG grant payments in 2024"), answer("A total."), user("2025")])).toBe("en");
    expect(answerLanguage([user("ZIP 317")])).toBe("en");
  });
  it("lets an explicit stored preference win over the question's own words", () => {
    expect(answerLanguage([user("What is Zcash?")], { language: "pt" })).toBe("pt");
    expect(answerLanguage([user("O que é Zcash?")], { language: "en" })).toBe("en");
    expect(answerLanguage([user("O que é Zcash?")], { language: "es" })).toBe("other");
  });
});
