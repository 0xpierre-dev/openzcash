import { describe, expect, it } from "vitest";
import { normalizeProposalTags, PROPOSAL_TAGS, proposalTagsSchema } from "@/lib/domain/proposal-tags";

describe("proposal topic tags", () => {
  it("accepts every catalog topic and gives a set a deterministic order", () => {
    for (const { id } of PROPOSAL_TAGS) expect(proposalTagsSchema.parse([id])).toEqual([id]);
    expect(normalizeProposalTags(["wallets", "education", "community"])).toEqual(["community", "education", "wallets"]);
    expect(normalizeProposalTags([])).toEqual([]);
  });

  it.each([
    ["approved"], ["rejected"], ["OPEN"], ["<script>"], ["Education"],
    ["education", "education"], ["community", "wallets", "education", "research"], [null], "education", null
  ].map((input) => ({ input })))("rejects invalid or misleading topics %j", ({ input }) => {
    expect(proposalTagsSchema.safeParse(input).success).toBe(false);
  });
});
