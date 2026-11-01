import { getWorkspaceVotePreview } from "@/lib/domain/workspace-vote-preview";

describe("workspace vote preview fixtures", () => {
  it("does not expose simulated results when the preview is disabled", () => {
    for (const index of [0, 1, 2]) expect(getWorkspaceVotePreview(index, false)).toBeNull();
  });

  it("supplies only the three approved, rejected, and ongoing demonstration fixtures", () => {
    expect([0, 1, 2].map(index => getWorkspaceVotePreview(index, true))).toEqual([
      { outcome: "approved", yes: 10, no: 2, eligible: 12 },
      { outcome: "rejected", yes: 3, no: 9, eligible: 12 },
      { outcome: "ongoing", yes: 5, no: 2, eligible: 12 }
    ]);
    for (const index of [-1, 3, 10, 0.5, NaN, Infinity]) expect(getWorkspaceVotePreview(index, true)).toBeNull();
  });

  it("does not let a caller mutate the shared fixture", () => {
    const first = getWorkspaceVotePreview(0, true)!;
    first.yes = 0;
    expect(getWorkspaceVotePreview(0, true)?.yes).toBe(10);
  });
});
