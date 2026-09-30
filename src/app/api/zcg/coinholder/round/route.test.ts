import { describe, expect, it, vi } from "vitest";
import { ROUNDS } from "@/lib/coinholder/rounds";
import { GET } from "./route";

describe("Coinholder round API", () => {
  it("serves the latest round with each proposal's outcome and ZEC tally, and names FPF as administrator", async () => {
    const body = await (await GET()).json();
    expect(body.programName).toBe("Coinholder-Directed Retroactive Grants Program");
    expect(body.administrator).toMatch(/^Financial Privacy Foundation/);
    expect(body.page).toBe("https://openzcash.org/coinholders");
    expect(body.round).toMatchObject({ label: "Q3 2026", status: "results", proposalCount: 37 });
    expect(body.proposals).toHaveLength(37);
    const outcomes = body.proposals.map((p: { outcome?: string }) => p.outcome);
    expect(outcomes.filter((o: string) => o === "Funded")).toHaveLength(17);
    expect(outcomes.filter((o: string) => o === "Rejected")).toHaveLength(20);
    for (const p of body.proposals) expect(p.tallyZec, p.project).toMatchObject({ approve: expect.any(Number), reject: expect.any(Number), rejectLower: expect.any(Number), abstain: expect.any(Number) });
    expect(body.round.nextRound.label).toBe("Q4 2026");
  });

  it("takes status and outcomes from the round it describes, not from whichever round is newest", async () => {
    const q3 = ROUNDS.find((r) => r.id === "q3-2026")!;
    const q4 = { ...q3, id: "q4-2026", label: "Q4 2026", proposals: [], sources: [], talliesSource: null, turnout: null };
    vi.resetModules();
    vi.doMock("@/lib/coinholder/rounds", () => ({ ROUNDS: [q4, ...ROUNDS] }));
    try {
      const { GET: get } = await import("./route");
      const body = await (await get()).json();
      expect(body.round).toMatchObject({ label: "Q3 2026", status: "results", resultsUrl: q3.sources[0].href });
      expect(body.proposals.filter((p: { outcome?: string }) => p.outcome === "Funded")).toHaveLength(17);
    } finally {
      vi.doUnmock("@/lib/coinholder/rounds");
      vi.resetModules();
    }
  });
});
