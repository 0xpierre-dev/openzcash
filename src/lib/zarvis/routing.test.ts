import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("./data", async (original) => ({ ...await original<object>(), lookupPublicData: mocks.lookup }));
vi.mock("./zips", async () => { const { bundledZipCorpus } = await import("./knowledge"); return { getZipCorpus: vi.fn().mockResolvedValue({ corpus: bundledZipCorpus, stale: false }) }; });
import { directIntent, prepareLocal, relevantTopics } from "./local";
import type { ChatMessage } from "./types";
const user = (content: string): ChatMessage => ({ role: "user", content });
const signal = () => new AbortController().signal;
beforeEach(() => { vi.clearAllMocks(); mocks.lookup.mockResolvedValue({ content: JSON.stringify({ data: {} }) }); });

describe("Topic routing for the site's datasets", () => {
  it.each([
    ["What was discussed in the latest Arborist call?", "arborist"], ["arborist call #131", "arborist"], ["What happened in call #131?", "arborist"], ["When is the next engineering call?", "arborist"], ["Sobre o que foi a última reunião arborist?", "arborist"],
    ["Which wallets support shielded transactions?", "wallets"], ["Quais carteiras suportam transações blindadas?", "wallets"], ["Is Zashi available on Android?", "wallets"], ["Does Keystone support Orchard?", "wallets"],
    ["Tell me about Zcash Brasil", "communities"], ["Is there a Zcash community in Nigeria?", "communities"], ["Quais comunidades existem na América Latina?", "communities"], ["Who are the Zcash ambassadors?", "communities"],
    ["Which proposals were approved this year?", "decisions"], ["Quais propostas foram rejeitadas em 2026?", "decisions"], ["What did the ZCG committee decide about Zebra?", "decisions"],
    ["Which proposals are under review?", "proposals"], ["Which ZCG proposals are under review right now and how much do they ask?", "proposals"], ["Quais candidaturas estão em análise?", "proposals"],
    ["What is the current block height?", "chain"], ["When is the next halving?", "chain"], ["Quando é o próximo halving?", "chain"], ["How much ZEC is in the shielded pools?", "chain"], ["What is the circulating supply of ZEC?", "chain"],
    ["What was the ZEC price in January 2026?", "price_history"], ["Qual era o preço do ZEC em janeiro de 2026?", "price_history"], ["ZEC price history 2025", "price_history"], ["quanto era o zec em janeiro de 2026", "price_history"], ["How much was ZEC worth in January 2026?", "price_history"],
  ])("routes %s to %s", (question, topic) => expect(relevantTopics(question)).toContain(topic));
  it("routes community venues: forum threads and ZecHub DAO proposals, apart from the ZecHub treasury and the community directory", () => {
    for (const q of ["What did the forum say about the Zashi 2.0 release?", "Summarize https://forum.zcashcommunity.com/t/they-grow-up-so-fast-zashi-2-0/51030", "What is the community saying about NU7?", "O que a comunidade disse sobre o Zebra?", "Is there a forum thread on Tachyon?", "O que o fórum discutiu sobre o halving?"]) expect(relevantTopics(q)).toContain("forum");
    for (const q of ["What is the latest ZecHub DAO proposal?", "Which DAO proposals passed this month?", "Quais propostas da ZecHub DAO foram aprovadas?", "How did the ZecHub DAO vote on A161?"]) expect(relevantTopics(q)).toContain("zechub_dao");
    expect(relevantTopics("What is the latest ZecHub DAO proposal?")).not.toContain("zechub");
    expect(relevantTopics("What is in the ZecHub treasury?")).toContain("zechub");
    expect(relevantTopics("Is there a Zcash community in Nigeria?")).not.toContain("forum");
  });
  it("keeps the current quote, ZIPs and ledger sums on their existing paths", () => {
    expect(relevantTopics("What is the ZEC price today?")).toEqual(["price"]); expect(relevantTopics("What was the ZEC price in January 2026?")).not.toContain("price");
    expect(relevantTopics("What are Zcash Improvement Proposals?")).not.toContain("proposals"); expect(relevantTopics("Explain ZIP 317 proposals")).not.toContain("proposals");
    expect(relevantTopics("How much has ZCG paid in grants to Zingo in 2025?")).toEqual([]); expect(relevantTopics("Latest news about Zebra")).toEqual(["news", "ecosystem"]);
    expect(relevantTopics("What is the ZCG payment ledger?")).not.toContain("wallets");
  });
  it("keeps a current-price question on the live quote when a month-like word is not a date", () => {
    for (const q of ["What is the ZEC price and market cap?", "How is the ZEC price on the market?", "What may affect the ZEC price?", "ZEC price on decentralized exchanges", "Compare the ZEC price with a separate august report"]) expect(relevantTopics(q), q).toEqual(["price"]);
    expect(relevantTopics("How much ZEC is in the shielded pools?")).toEqual(["chain"]);
  });
  it("does not read ZCG's own name, a bare community, a mobile application or a ZIP verdict as a directory or grant lookup", () => {
    expect(relevantTopics("How much does Zcash Community Grants fund per year?")).toEqual(["grants"]);
    expect(relevantTopics("Who sits on the Zcash Community Grants committee?")).not.toContain("communities");
    expect(relevantTopics("what did the community decide about the lockbox")).toEqual(["treasuries", "decisions"]);
    expect(relevantTopics("Tell me about the Zcash community")).toEqual(["communities"]);
    expect(relevantTopics("which mobile application supports Orchard")).not.toContain("proposals");
    expect(relevantTopics("How many grant applications did ZCG receive?")).toContain("proposals");
    for (const q of ["Was ZIP 1015 approved?", "Which ZIPs were rejected?"]) expect(relevantTopics(q), q).not.toContain("decisions");
    expect(relevantTopics("Sobre o que foi a última reunião arborist?")).toEqual(["arborist"]);
  });
  it("passes the question to readers that filter by number, name, outcome or period, and nothing to the others", async () => {
    await prepareLocal([user("What happened in Arborist call #131?")], signal());
    expect(mocks.lookup).toHaveBeenCalledWith({ topic: "arborist", query: "what happened in arborist call #131" }, expect.any(AbortSignal));
    await prepareLocal([user("Qual era o preço do ZEC em janeiro de 2026?")], signal());
    expect(mocks.lookup).toHaveBeenCalledWith({ topic: "price_history", query: "qual era o preco do zec em janeiro de 2026" }, expect.any(AbortSignal));
    await prepareLocal([user("What is the current block height?")], signal());
    expect(mocks.lookup).toHaveBeenCalledWith({ topic: "chain", query: "" }, expect.any(AbortSignal));
    const long = `Which wallets ${"really ".repeat(30)}support shielded?`;
    await prepareLocal([user(long)], signal());
    expect((mocks.lookup.mock.calls.at(-1)?.[0] as { query: string }).query.length).toBeLessThanOrEqual(120);
  });
  it("answers the latest Arborist call directly, in the question's language, without a model", async () => {
    for (const q of ["What was the latest Arborist call?", "latest arborist call", "Qual foi a última reunião arborist?", "Qual é a última Arborist call?"]) expect(directIntent([user(q)]), q).toEqual({ type: "arborist" });
    expect(directIntent([user("What was discussed in the latest Arborist call about Zaino?")])).toBeUndefined();
    mocks.lookup.mockResolvedValue({ content: JSON.stringify({ data: { calls: { totalRows: 1, shown: [{ number: 131, date: "2026-09-10", moderator: "Dodger", agenda: { totalRows: 1, shown: ["Zaino"] }, notes: "https://github.com/ZcashCommunityGrants/arboretum-notes/blob/main/x.md", recording: null, source: "published notes" }] } } }) });
    const en = await prepareLocal([user("What was the latest Arborist call?")], signal());
    expect(en.direct).toContain("**Arborist Call #131**, held on September 10, 2026"); expect(en.external).toBe(false); expect(mocks.lookup).toHaveBeenCalledWith({ topic: "arborist", query: "" }, expect.any(AbortSignal));
    const pt = await prepareLocal([user("Qual foi a última reunião arborist?")], signal());
    expect(pt.direct).toContain("realizada em 10 de setembro de 2026");
    mocks.lookup.mockResolvedValue({ content: JSON.stringify({ error: "Public data temporarily unavailable." }) });
    expect((await prepareLocal([user("latest arborist call")], signal())).direct).toContain("could not be read");
  });
});
