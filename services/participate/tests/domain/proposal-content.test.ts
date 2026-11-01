import { describe, expect, it } from "vitest";
import { hasValidProposalContentHash, LEGACY_PROPOSAL_CONTENT_HASH_VERSION, TAGGED_PROPOSAL_CONTENT_HASH_VERSION, proposalContentHash, PROPOSAL_CONTENT_HASH_VERSION } from "@/lib/domain/proposal-content";

const content = { communityId: "alpha", title: "Community project", body: "Specific deliverables and a budget", optionLabels: ["Approve", "Reject", "Abstain"], treasuryId: "fund-a", requestedAmountZat: 100000001n };

describe("proposal content commitment", () => {
  it("preserves the V2 digest byte-for-byte and rejects adding an uncommitted USD amount", () => {
    const tagged = { ...content, tags: ["community", "education"] };
    const hash = "4c4031da30488788f4a81c14d3e9e85780e3546ee947aa63064f1b8d0ee8fe0c";
    expect(proposalContentHash(tagged, TAGGED_PROPOSAL_CONTENT_HASH_VERSION)).toBe(hash);
    expect(hasValidProposalContentHash(tagged, TAGGED_PROPOSAL_CONTENT_HASH_VERSION, hash)).toBe(true);
    expect(hasValidProposalContentHash({ ...tagged, requestedAmountUsdCents: 1n }, TAGGED_PROPOSAL_CONTENT_HASH_VERSION, hash)).toBe(false);
  });
  it("commits to the USD cents and cannot confuse a USD budget with a ZEC amount", () => {
    const usd = { ...content, requestedAmountZat: null, requestedAmountUsdCents: 123456n };
    const hash = proposalContentHash(usd);
    expect(hasValidProposalContentHash(usd, PROPOSAL_CONTENT_HASH_VERSION, hash)).toBe(true);
    expect(hasValidProposalContentHash({ ...usd, requestedAmountUsdCents: 123457n }, PROPOSAL_CONTENT_HASH_VERSION, hash)).toBe(false);
    expect(hasValidProposalContentHash({ ...usd, requestedAmountUsdCents: null, requestedAmountZat: 123456n }, PROPOSAL_CONTENT_HASH_VERSION, hash)).toBe(false);
    for (const version of [LEGACY_PROPOSAL_CONTENT_HASH_VERSION, TAGGED_PROPOSAL_CONTENT_HASH_VERSION] as const) {
      expect(() => proposalContentHash(usd, version)).toThrow();
    }
    expect(() => proposalContentHash({ ...usd, requestedAmountZat: 1n })).toThrow();
    expect(() => proposalContentHash({ ...usd, treasuryId: null })).toThrow();
  });
  it("is deterministic and normalizes surrounding text whitespace", () => {
    expect(proposalContentHash(content)).toMatch(/^[a-f0-9]{64}$/);
    expect(proposalContentHash({ ...content, title: ` ${content.title} `, body: `\n${content.body}\n` })).toBe(proposalContentHash(content));
  });
  it.each([
    { communityId: "beta" }, { title: "Different project" }, { body: "Different deliverables" },
    { optionLabels: ["Reject", "Approve", "Abstain"] }, { treasuryId: "fund-b" }, { requestedAmountZat: 100000002n }, { tags: ["education"] }
  ])("commits to each material field %#", (change) => {
    expect(proposalContentHash({ ...content, ...change })).not.toBe(proposalContentHash(content));
  });

  it("retains the exact pre-upgrade V1 digest while new content uses V3", () => {
    const legacyHash = "47985c3bca00e3cb9032a18f492bc6e00b9eb448db3e081cd5a468a8763172ce";
    expect(proposalContentHash(content, LEGACY_PROPOSAL_CONTENT_HASH_VERSION)).toBe(legacyHash);
    expect(hasValidProposalContentHash(content, LEGACY_PROPOSAL_CONTENT_HASH_VERSION, legacyHash)).toBe(true);
    expect(hasValidProposalContentHash(content, PROPOSAL_CONTENT_HASH_VERSION, legacyHash)).toBe(false);
    expect(proposalContentHash(content)).not.toBe(legacyHash);
  });

  it("commits to a topic set independent of selection order", () => {
    const hash = proposalContentHash({ ...content, tags: ["education", "community"] });
    expect(proposalContentHash({ ...content, tags: ["community", "education"] })).toBe(hash);
    expect(hasValidProposalContentHash({ ...content, tags: ["education"] }, PROPOSAL_CONTENT_HASH_VERSION, hash)).toBe(false);
  });

  it("fails closed on unsupported versions and tags outside their version or catalog", () => {
    const legacyHash = proposalContentHash(content, LEGACY_PROPOSAL_CONTENT_HASH_VERSION);
    expect(hasValidProposalContentHash({ ...content, tags: ["education"] }, LEGACY_PROPOSAL_CONTENT_HASH_VERSION, legacyHash)).toBe(false);
    expect(() => proposalContentHash({ ...content, tags: ["education"] }, LEGACY_PROPOSAL_CONTENT_HASH_VERSION)).toThrow();
    for (const version of [null, undefined, "PROPOSAL_CONTENT_V4", ""]) {
      expect(hasValidProposalContentHash(content, version, legacyHash)).toBe(false);
    }
    expect(hasValidProposalContentHash({ ...content, tags: ["approved"] }, PROPOSAL_CONTENT_HASH_VERSION, legacyHash)).toBe(false);
  });
});
