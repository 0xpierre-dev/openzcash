import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { numericFacts, unsupportedAmounts } from "./grounding";
import { BLOCK_SUBSIDY_ALLOCATION, compactData, derivedTreasuryFacts, treasuryContext } from "./data";
import { valueReportedDevFund } from "@/lib/treasury/dev-fund";

// Shape of the live "treasuries" lookup on 2026-09-28; the Lockbox estimate accrues per block, so figures are fixtures, not live values.
const funds = {
  zcg: { paidMilestonesUsd: 21507071, zec: 88435, cashUsd: 8816950, snapshotAt: "2026-09-23T20:16:00Z", importedAt: "2026-09-27T03:00:00Z", updatesRequired: true, sourceUrl: "https://docs.google.com/spreadsheets/d/zcg" },
  lockbox: { zec: 144333.7875, height: 3499201, baselineHeight: 3493796, snapshotAt: "2026-09-23T20:16:00Z", importedAt: "2026-09-27T03:00:00Z", updatesRequired: false, sourceUrl: "https://docs.google.com/spreadsheets/d/lockbox" },
};
const price = { cents: 159280, quotedAt: "2026-09-28T11:30:00Z", fetchedAt: "2026-09-28T11:30:00Z", stale: false };
const supply = { zec: 16945106, quotedAt: "2026-09-28T11:30:00Z", fetchedAt: "2026-09-28T11:30:00Z", stale: false };
const treasuriesEvidence = () => [{ content: JSON.stringify({ sourceUrl: "https://openzcash.org/zcg/treasury-calculator", retrievedAt: "2026-09-28T11:36:00Z", ...compactData({ funds: treasuryContext(funds), derived: derivedTreasuryFacts(funds, price, supply), allocation: BLOCK_SUBSIDY_ALLOCATION, price, supply }) }) }];

describe("Derived treasury facts", () => {
  it("reproduces the footer's per-pool cent rounding, ZEC totals and shares", () => {
    const d = derivedTreasuryFacts(funds, price, supply);
    expect(d).toMatchObject({ zcgValueUsd: 140859268, zcgTotalUsd: 149676218, lockboxValueUsd: 229894856.73, combinedZec: 232768.7875, combinedZecValueUsd: 370754124.73, zcgShareOfCombinedPercent: 37.99, lockboxShareOfCombinedPercent: 62.01, lockboxShareOfGrossValuePercent: 60.57, zcgShareOfSupplyPercent: 0.52, combinedShareOfSupplyPercent: 1.37 });
    expect(d.combinedGrossValueUsd).toBe(valueReportedDevFund(funds, 1592.8));
    expect(BLOCK_SUBSIDY_ALLOCATION).toMatchObject({ zcgPercent: 8, lockboxPercent: 12, devFundPercent: 20, minerPercent: 80, lockboxPerBlockZec: 0.1875 });
  });
  it("never turns a missing price, supply or pool into zero", () => {
    const noPrice = derivedTreasuryFacts(funds, null, supply);
    expect(noPrice).toMatchObject({ zcgValueUsd: null, combinedGrossValueUsd: null, combinedZec: 232768.7875, combinedShareOfSupplyPercent: 1.37 });
    const noZcg = derivedTreasuryFacts({ zcg: null, lockbox: funds.lockbox }, price, null);
    expect(noZcg).toMatchObject({ lockboxValueUsd: 229894856.73, zcgValueUsd: null, combinedZec: null, combinedGrossValueUsd: null, lockboxShareOfSupplyPercent: null });
    expect(JSON.stringify([noPrice, noZcg])).not.toMatch(/NaN|:0[,}]/);
    expect(derivedTreasuryFacts(funds, { cents: 0 }, supply).zcgValueUsd).toBeNull();
  });
  it("maps every derived key to the unit the guard expects", () => {
    const units = numericFacts([{ content: JSON.stringify({ data: { derived: derivedTreasuryFacts(funds, price, supply), allocation: BLOCK_SUBSIDY_ALLOCATION } }) }]).map((f) => f.unit);
    expect(units.filter((u) => u === "USD")).toHaveLength(5); expect(units.filter((u) => u === "ZEC")).toHaveLength(5); expect(units.filter((u) => u === "%")).toHaveLength(11);
  });
});

describe("Treasury arithmetic in model answers", () => {
  const evidence = treasuriesEvidence();
  it.each([
    "$140.9 million", "$140,859,268", "about $229.9 million", "$149.7 million", "$371 million", "$379.6 million", "232,769 ZEC", "232.8K ZEC",
    "62%", "38%", "60.6%", "1.37%", "0.52%", "8%", "12%", "20%", "80%", "0.1875 ZEC", "1.5625 ZEC", "0.125 ZEC", "0,125 ZEC", "1.25 ZEC", "1 ZEC = $1,592.80",
  ])("supports the site's own derived figure: %s", (text) => expect(unsupportedAmounts(text, evidence)).toEqual([]));
  it.each(["$500 million", "150,000 ZEC", "99%", "R$ 140,9 milhões", "$10 million", "$999 billion", "0.3 ZEC per block", "0.135 ZEC"])("still rejects figures that are not the site's arithmetic: %s", (text) => expect(unsupportedAmounts(text, evidence)).not.toEqual([]));
  it.each([
    "ZCG holds $8,816,950.00.", "The quote is $1,592.80, as of 11:30 UTC.", "**$1,592.80**.", "US$ 1.592,80.", "US$ 1.592,80, obtida hoje.",
    "Estimate through block 3,499,201. ZEC is quoted at $1,592.80.", "Report dated September 23, 2026. USD cash is $8,816,950.", "Imported September 27, 2026, ZEC balance 88,435 ZEC.",
  ])("does not read sentence punctuation as a separator or a unit across sentences: %s", (text) => expect(unsupportedAmounts(text, evidence)).toEqual([]));
  it("keeps the fallback's guarantee: an evidence stub without figures supports nothing", () => {
    expect(unsupportedAmounts("$140.9 million", [{ content: JSON.stringify({ sourceUrl: "https://openzcash.org/zcg/treasury-calculator", error: "unavailable" }) }])).toEqual(["$140.9 million"]);
  });
});

