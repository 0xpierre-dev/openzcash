import { describe, expect, it } from "vitest";
import { conversationTopic, TOPICS, topicOf, type Topic } from "./topics";
import type { AnswerLanguage } from "./language";

/** Labelled questions in the three template languages, including the ones that trip a naive keyword match: "cotação" is a price word, a bare ZIP number is a protocol question, a calculator phrasing is not a treasury balance, a forum link is the forum, a wallet name is a wallet, a ceremony name is history. */
const LABELLED: Array<[string, Topic, AnswerLanguage?]> = [
  // price
  ["What is the ZEC price today?", "price", "en"],
  ["How much is one ZEC worth in dollars?", "price", "en"],
  ["Qual é a cotação do ZEC hoje?", "price", "pt"],
  ["Quanto está valendo o Zcash agora?", "price", "pt"],
  ["¿Cuál es el precio del ZEC en este momento?", "price", "es"],
  ["¿A cuánto se cotiza el ZEC?", "price", "es"],
  ["What was the ZEC market cap at the end of 2025?", "price", "en"],
  // treasuries
  ["What does ZCG hold right now?", "treasuries", "en"],
  ["How big is the Lockbox treasury?", "treasuries", "en"],
  ["Quais são os saldos atuais do ZCG?", "treasuries", "pt"],
  ["Quanto ZEC tem no Lockbox?", "treasuries", "pt"],
  ["¿Cuál es el saldo de la tesorería del ZCG?", "treasuries", "es"],
  ["¿Cuánto ZEC guarda el Lockbox?", "treasuries", "es"],
  // grants ledger (ZCG program: payments, proposals, grantees)
  ["How much did ZCG pay in grants to Zingo in 2025?", "grants-ledger", "en"],
  ["Which grant proposals are under review?", "grants-ledger", "en"],
  ["Quanto o ZCG já pagou em grants ao todo?", "grants-ledger", "pt"],
  ["Quais propostas de grant foram aprovadas este ano?", "grants-ledger", "pt"],
  ["¿Cuánto pagó ZCG a Zingo en subvenciones?", "grants-ledger", "es"],
  ["¿Qué propuestas de grant están en revisión?", "grants-ledger", "es"],
  // coinholder grants
  ["How much have the coinholders paid out so far?", "coinholder-grants", "en"],
  ["How did the coinholder vote on the Q3 2026 round go?", "coinholder-grants", "en"],
  ["O que é o programa Coinholder Grants da FPF?", "coinholder-grants", "pt"],
  ["¿Cómo funciona la votación de los coinholders?", "coinholder-grants", "es"],
  // governance
  ["Who sits on the ZCG committee this term?", "governance", "en"],
  ["When is the next ZCG election?", "governance", "en"],
  ["How is the Dev Fund split between ECC, ZF and ZCG?", "governance", "en"],
  ["Quando foi a última reunião do comitê do ZCG?", "governance", "pt"],
  ["¿Cuándo es la próxima elección del comité ZCG?", "governance", "es"],
  // ZIPs and protocol
  ["What is ZIP 317?", "zips-protocol", "en"],
  ["zip 32", "zips-protocol", "en"],
  ["When is the next halving and what happens to the block subsidy?", "zips-protocol", "en"],
  ["Qual é o último ZIP?", "zips-protocol", "pt"],
  ["O que muda no NU6?", "zips-protocol", "pt"],
  ["¿Cuál es el estado del ZIP 1015?", "zips-protocol", "es"],
  ["¿Qué es la actualización de red Orchard?", "zips-protocol", "es"],
  ["What was discussed in the latest Arborist call?", "zips-protocol", "en"],
  // wallets
  ["Does Zashi support hardware wallets?", "wallets", "en"],
  ["Is there a Zcash app for the Ledger Nano?", "wallets", "en"],
  ["Where can I find Zcash wallets?", "wallets", "en"],
  ["O Zingo funciona no Android?", "wallets", "pt"],
  ["Qual carteira devo usar para ZEC blindado?", "wallets", "pt"],
  ["¿Qué billetera recomiendan para Zcash en iOS?", "wallets", "es"],
  ["¿Ywallet sigue recibiendo mantenimiento?", "wallets", "es"],
  // privacy and keys
  ["What makes a Zcash transaction private? Explain it simply.", "privacy-keys", "en"],
  ["Can an incoming viewing key identify the sender?", "privacy-keys", "en"],
  ["Como funciona uma chave de visualização?", "privacy-keys", "pt"],
  ["Transações transparentes são rastreáveis?", "privacy-keys", "pt"],
  ["¿Qué es una dirección unificada?", "privacy-keys", "es"],
  ["¿Puede una clave de visualización gastar mis ZEC?", "privacy-keys", "es"],
  // mining and network
  ["What is the current Zcash hashrate?", "mining-network", "en"],
  ["What is the block height right now?", "mining-network", "en"],
  ["Qual é a dificuldade de mineração do Zcash?", "mining-network", "pt"],
  ["Quanto ZEC está na pool blindada?", "mining-network", "pt"],
  ["¿Cuánto es el hashrate actual de la red?", "mining-network", "es"],
  // communities
  ["Is there a Zcash community in Brazil?", "communities", "en"],
  ["Quem são os embaixadores da Zcash no Brasil?", "communities", "pt"],
  ["¿Hay una comunidad de Zcash en Argentina?", "communities", "es"],
  // news and forum
  ["What is the latest news about Zcash?", "news-forum", "en"],
  ["https://forum.zcashcommunity.com/t/zcg-funding-discussion/51030", "news-forum", "en"],
  ["Quais são as últimas notícias da ECC?", "news-forum", "pt"],
  ["¿Qué se discute en el foro sobre el Dev Fund?", "news-forum", "es"],
  // calculator and scenarios
  ["If the price goes 20x, how many years of coverage does ZCG have?", "calculator-scenario", "en"],
  ["What does mine then buy mean?", "calculator-scenario", "en"],
  ["Quantos anos de cobertura o ZCG teria com o preço 10 vezes maior?", "calculator-scenario", "pt"],
  ["¿Cómo funciona la calculadora de tesorería?", "calculator-scenario", "es"],
  // history and people
  ["Who is Zooko Wilcox?", "history-people", "en"],
  ["What did Hal Finney have to do with Zcash?", "history-people", "en"],
  ["Quem é Daira-Emma Hopwood?", "history-people", "pt"],
  ["Como foi a cerimônia de lançamento do Zcash em 2016?", "history-people", "pt"],
  ["¿Quién fue Satoshi Nakamoto y qué relación tiene con Zcash?", "history-people", "es"],
  // site help
  ["Where does OpenZcash get its data?", "site-help", "en"],
  ["Can you see my wallet balance?", "site-help", "en"],
  ["De onde vêm os dados do OpenZcash?", "site-help", "pt"],
  ["¿Qué puedes hacer, Zarvis?", "site-help", "es"],
  // other
  ["thanks", "other", "en"],
  ["What is the weather in Lisbon?", "other", "en"],
  ["Me conta uma piada", "other", "pt"],
];

describe("topicOf", () => {
  it("labels every question in the labelled set", () => {
    const misses = LABELLED.filter(([question, expected, language]) => topicOf(question, language) !== expected).map(([question, expected, language]) => `${question} → ${topicOf(question, language)} (expected ${expected})`);
    expect(misses).toEqual([]);
    expect(LABELLED.length).toBeGreaterThanOrEqual(45);
  });
  it("only returns labels from the fixed taxonomy and never the question", () => {
    for (const [question] of LABELLED) expect(TOPICS).toContain(topicOf(question));
    expect(topicOf("Alice sent 12 ZEC to t1abc on 2026-10-01")).not.toContain("Alice");
    expect(TOPICS).toHaveLength(15);
  });
  it("is deterministic, cheap and unfazed by case, accents, padding or length", () => {
    expect(topicOf("  QUAL É A COTAÇÃO DO ZEC?  ")).toBe("price");
    expect(topicOf("qual e a cotacao do zec")).toBe("price");
    expect(topicOf("")).toBe("other");
    expect(topicOf("x".repeat(2000))).toBe("other");
    const started = performance.now();
    for (let i = 0; i < 500; i++) topicOf(LABELLED[i % LABELLED.length][0], "pt");
    expect(performance.now() - started).toBeLessThan(500);
  });
  it("prefers the matching language's words on a tie", () => {
    expect(topicOf("pago", "es")).toBe(topicOf("pago", "pt"));
    expect(topicOf("saldo", "pt")).toBe("treasuries");
  });
});
describe("conversationTopic", () => {
  it("keeps a direct follow-up on the subject of the question it continues", () => {
    expect(conversationTopic([{ role: "user", content: "What does ZCG hold?" }, { role: "assistant", content: "…" }, { role: "user", content: "and the lockbox" }], "en")).toBe("treasuries");
    expect(conversationTopic([{ role: "user", content: "How much did ZCG pay in grants?" }, { role: "assistant", content: "…" }, { role: "user", content: "and in 2024" }], "en")).toBe("grants-ledger");
    expect(conversationTopic([{ role: "user", content: "What is ZIP 317?" }, { role: "assistant", content: "…" }, { role: "user", content: "when was it created" }], "en")).toBe("zips-protocol");
  });
  it("classifies the latest user turn on its own words otherwise", () => {
    expect(conversationTopic([{ role: "user", content: "What is the ZEC price?" }, { role: "assistant", content: "…" }, { role: "user", content: "Which wallet should I use?" }], "en")).toBe("wallets");
    expect(conversationTopic([], "en")).toBe("other");
    expect(conversationTopic([{ role: "assistant", content: "Hello" }], "en")).toBe("other");
  });
});
