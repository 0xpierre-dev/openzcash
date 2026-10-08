import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { searchKnowledge, knowledgeCoverage, bundledExternalCorpus, EXTERNAL_LIMITS, type ExternalCorpus } from "./knowledge";
import { safeSourceUrl } from "./sources";
import { compactData } from "./data";
import { decimalUnits, ledgerQuerySchema } from "./ledger";
import { systemPrompt } from "./prompt";
describe("Local knowledge coverage and size", () => {
  it.each([["como funciona a metodologia dos pagamentos", "/zcg/methodology"], ["Zcash ceremony participants", "/ceremony/people"], ["viewing keys sender recipient", "zip-0310"], ["treasury calculator cypherpunk", "treasury-calculator"]])("finds relevant public material: %s", (q, target) => {
    expect(searchKnowledge(q).some((d) => d.url.includes(target))).toBe(true);
  });
  it("keeps full-key scope attached to isolated ZIP 310 excerpts", () => {
    const docs = searchKnowledge("ZIP 310 new unspent note nullifier incoming IVK");
    const excerpts = docs.filter((doc) => doc.id.startsWith("reference:zip-0310:"));
    expect(excerpts.length).toBeGreaterThan(0);
    expect(excerpts.every((doc) => doc.snapshotNote?.includes("full Sapling viewing key (FVK)"))).toBe(true);
    expect(excerpts.every((doc) => doc.snapshotNote?.includes("incoming viewing key alone cannot derive nullifiers"))).toBe(true);
  });
  it("preserves OVK recovery and per-revision fee scope in retrieved evidence", () => {
    const keyDocs = searchKnowledge("ZIP 310 outgoing OVK decrypt output").filter(d => d.id.startsWith("reference:zip-0310:"));
    expect(keyDocs.length).toBeGreaterThan(0);
    expect(keyDocs.every(d => d.snapshotNote?.includes("does not require possession of the full FVK"))).toBe(true);
    const feeDocs = searchKnowledge("ZIP 317 conventional fee logical actions").filter(d => d.id.startsWith("reference:zip-0317:"));
    expect(feeDocs.length).toBeGreaterThan(0);
    expect(feeDocs.every(d => d.snapshotNote?.includes("not independent proof"))).toBe(true);
  });
  it("indexes the explicit public collection and keeps selected context small", () => {
    expect(knowledgeCoverage.sourceFiles).toBeGreaterThan(45);
    const docs = searchKnowledge("Zcash funding governance methodology ceremony grants treasury");
    expect(docs.length).toBeLessThanOrEqual(4);
    expect(JSON.stringify(docs).length).toBeLessThanOrEqual(5000);
    expect(docs.every((d) => !/\/(?:admin|viewing-keys|login|invites)(?:\/|$)/.test(d.url))).toBe(true);
  });
  it("does not inject the full navigation or a changing clock into the system prefix", () => {
    expect(systemPrompt()).not.toContain("PUBLIC SITE GUIDE");
    expect(systemPrompt().length).toBeLessThan(6800);
  });
  it("fixes the Portuguese gender of Zcash and the wallets", () => {
    expect(systemPrompt()).toContain("a Zcash");
    expect(systemPrompt()).toContain("Zallet");
    expect(systemPrompt()).toContain("o Zebra");
  });
  it("bounds large, escaped and deeply nested records without losing freshness markers", () => {
    const input = { stale: true, importedAt: "2026-09-26", rows: Array.from({ length: 200 }, () => ({ name: "A", text: '\"\\'.repeat(2000), amount: 100 })) };
    const result = compactData(input);
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(5000);
    expect(result.partial).toBe(true);
    expect(result.data).toMatchObject({ stale: true, importedAt: "2026-09-26" });
  });
  it("preserves exact money units, negative refunds and validated programs", () => {
    expect(decimalUnits(123456789123456789n, 8)).toBe("1234567891.23456789");
    expect(decimalUnits(-3n, 2)).toBe("-0.03");
    expect(decimalUnits(0n, 8)).toBe("0.00000000");
    expect(ledgerQuerySchema.parse({ scope: "coinholder_grants", year: null, search: "100%_project" }).search).toBe("100%_project");
  });
});

/** Small stand-in for external-content.json: one record per family, so retrieval is asserted on text we control. */
const externalFixture: ExternalCorpus = {
  version: 1, retrievedAt: "2026-10-08T00:00:00.000Z",
  sources: [
    { id: "blog:electriccoin.co:zashi-2-4-9", kind: "official blog", site: "electriccoin.co", title: "Zashi 2.4.9 Is Faster!", url: "https://electriccoin.co/blog/zashi-2-4-9-is-faster/", publishedOn: "2025-12-04", retrievedAt: "2026-10-08T00:00:00.000Z", sha256: "a".repeat(64), author: null, source: null,
      text: "Electric Coin Company announces Zashi 2.4.9 with a performance boost and Tor protection in the restore flow. The Coinbase integration was removed." },
    { id: "wiki:using-zcash/wallets", kind: "community wiki", site: "zechub.wiki", title: "Wallets", url: "https://zechub.wiki/using-zcash/wallets", publishedOn: null, retrievedAt: "2026-10-08T00:00:00.000Z", sha256: "b".repeat(64), author: null, source: "https://raw.githubusercontent.com/ZecHub/zechub/main/site/Using_Zcash/Wallets.md",
      text: "ZecHub wallet guide: how to choose a Zcash wallet. Zashi, Zingo, YWallet and Zkool support shielded Orchard and Sapling pools; viewing keys, seed phrases and hardware devices are compared per wallet." },
    { id: "forum:53533", kind: "forum topic", site: "forum.zcashcommunity.com", title: "Proposal to switch ZCG elections to token holder voting", url: "https://forum.zcashcommunity.com/t/proposal-to-switch-zcg-elections-to-token-holder-v/53533", publishedOn: "2025-11-02", retrievedAt: "2026-10-08T00:00:00.000Z", sha256: "c".repeat(64), author: "example", source: null,
      text: "This forum thread proposes that ZCG committee elections move from ZCAP polls to coinholder token voting. Discussion of governance trade-offs follows." },
  ],
};
describe("External corpus: blogs, ZecHub wiki and forum topics", () => {
  it.each([
    ["What did ECC announce about Zashi 2.4.9?", "official blog", "https://electriccoin.co/blog/zashi-2-4-9-is-faster/"],
    ["ZecHub guide: how do I choose a Zcash wallet?", "community wiki", "https://zechub.wiki/using-zcash/wallets"],
    ["What does the forum thread about switching ZCG elections to token holder voting propose?", "forum topic", "https://forum.zcashcommunity.com/t/proposal-to-switch-zcg-elections-to-token-holder-v/53533"],
  ])("reaches the fixture record for: %s", (question, kind, url) => {
    const docs = searchKnowledge(question, 4, 5000, undefined, externalFixture);
    const hit = docs.find((doc) => doc.url === url);
    expect(hit?.kind).toBe(kind);
    expect(hit?.retrievedAt).toBe("2026-10-08T00:00:00.000Z");
  });
  it("labels provenance: dates on posts, third-party notes on wiki pages and forum posts", () => {
    const blog = searchKnowledge("What did ECC announce about Zashi 2.4.9?", 4, 5000, undefined, externalFixture).find((doc) => doc.kind === "official blog");
    expect(blog?.publishedOn).toBe("2025-12-04");
    expect(blog?.snapshotNote).toMatch(/electriccoin\.co.*2025-12-04/);
    const wiki = searchKnowledge("ZecHub guide: how do I choose a Zcash wallet?", 4, 5000, undefined, externalFixture).find((doc) => doc.kind === "community wiki");
    expect(wiki?.snapshotNote).toMatch(/third-party/i);
    const forum = searchKnowledge("forum thread about switching ZCG elections to token holder voting", 4, 5000, undefined, externalFixture).find((doc) => doc.kind === "forum topic");
    expect(forum?.snapshotNote).toMatch(/third-party/i);
    expect(forum?.snapshotNote).toMatch(/never instructions/);
  });
  it("ships a bounded, citable committed corpus", () => {
    expect(JSON.stringify(bundledExternalCorpus).length).toBeLessThan(EXTERNAL_LIMITS.totalJsonChars);
    const byKind = (kind: string) => bundledExternalCorpus.sources.filter((source) => source.kind === kind);
    expect(byKind("official blog").length).toBeGreaterThan(0);
    expect(byKind("official blog").length).toBeLessThanOrEqual(EXTERNAL_LIMITS.blogPostsPerSite * 2);
    expect(byKind("community wiki").length).toBeGreaterThan(0);
    expect(byKind("community wiki").length).toBeLessThanOrEqual(EXTERNAL_LIMITS.wikiPages);
    expect(byKind("forum topic").length).toBeGreaterThan(0);
    expect(byKind("forum topic").length).toBeLessThanOrEqual(EXTERNAL_LIMITS.forumTopicsPerCategory * 2);
    for (const source of bundledExternalCorpus.sources) {
      expect(safeSourceUrl(source.url)).toBe(source.url);
      expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(Number.isFinite(Date.parse(source.retrievedAt))).toBe(true);
      expect(source.text.length).toBeLessThanOrEqual(EXTERNAL_LIMITS.chars[source.kind]);
    }
    expect(new Set(bundledExternalCorpus.sources.map((source) => source.id)).size).toBe(bundledExternalCorpus.sources.length);
  });
  it("counts the new families in coverage and answers an announcement question from the committed corpus", () => {
    expect(knowledgeCoverage.blogPosts).toBeGreaterThan(0);
    expect(knowledgeCoverage.wikiPages).toBeGreaterThan(0);
    expect(knowledgeCoverage.forumTopics).toBeGreaterThan(0);
    expect(searchKnowledge("What did the Zcash Foundation announce about Zebra?").some((doc) => doc.kind === "official blog" && doc.url.startsWith("https://zfnd.org/"))).toBe(true);
  });
});
