import { describe, expect, it } from "vitest";
import { matchProposalApplications } from "./match-proposals";

const app = { number: 900, title: "Shared project title" };
const proposal = {
  id: "proposal", program: "zcg", status: "under_review",
  title: app.title, platformLink: null as string | null,
};
const issueUrl = (number: number) =>
  `https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/${number}`;

describe("proposal identity matching", () => {
  it("prioritizes issue identity over a title match regardless of row order", () => {
    const matches = matchProposalApplications([
      proposal,
      { ...proposal, id: "exact", title: "Renamed application", status: "approved", platformLink: issueUrl(900) },
    ], [app]);
    expect([...matches]).toEqual([["exact", 900]]);
  });

  it("allows a unique title fallback only for an undecided ZCG row without an issue ID", () => {
    expect(matchProposalApplications([proposal], [app]).get("proposal")).toBe(900);
    for (const row of [
      { ...proposal, program: "coinholder" },
      { ...proposal, status: "rejected" },
      { ...proposal, platformLink: issueUrl(8) },
    ]) {
      expect(matchProposalApplications([row], [app]).size).toBe(0);
    }
  });

  it("does not guess when multiple proposals or applications share a title", () => {
    expect(matchProposalApplications([proposal, { ...proposal, id: "duplicate" }], [app]).size).toBe(0);
    expect(matchProposalApplications([proposal], [app, { ...app, number: 901 }]).size).toBe(0);
  });
});
