import { describe, expect, it } from "vitest";
import { COINHOLDER_ROUND, ROUND_BANDS, ROUND_PROPOSALS } from "./coinholder-round";

describe("Coinholder published aggregates", () => {
  it("reconciles requested cents, counts and band eligibility to every proposal", () => {
    const total = ROUND_PROPOSALS.reduce((sum, row) => sum + row.requestedUsdCents, 0);
    expect(total).toBe(COINHOLDER_ROUND.totalRequestedUsdCents);
    expect(ROUND_PROPOSALS.length).toBe(COINHOLDER_ROUND.proposalCount);
    expect(ROUND_BANDS.reduce((sum, band) => sum + band.totalUsdCents, 0)).toBe(total);
    for (const band of ROUND_BANDS) {
      const rows = ROUND_PROPOSALS.filter((p) => p.requestedUsdCents < 2_500_000 ? band.key === "under_25k"
        : p.requestedUsdCents <= 15_000_000 ? band.key === "mid_25k_150k" : band.key === "over_150k");
      expect(band.count).toBe(rows.length);
      expect(band.totalUsdCents).toBe(rows.reduce((sum, row) => sum + row.requestedUsdCents, 0));
    }
    expect(ROUND_BANDS.find((band) => band.key === "over_150k")?.totalUsdCents).toBe(803_699_200);
  });
});
