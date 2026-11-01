import { describe, expect, it } from "vitest";
import {
  formatTreasuryZec,
  parseTreasuryAmountZat,
  treasuryAllocationInputSchema,
  treasuryFundingInputSchema
} from "@/lib/domain/treasury";

describe("exact treasury amounts", () => {
  it("round trips the smallest unit and large decimal amounts without floating point arithmetic", () => {
    expect(parseTreasuryAmountZat("0.00000001")).toBe(1n);
    expect(parseTreasuryAmountZat("12345678.12345678")).toBe(1_234_567_812_345_678n);
    expect(formatTreasuryZec(1n)).toBe("0.00000001");
    expect(formatTreasuryZec("1234567812345678")).toBe("12345678.12345678");
    expect(formatTreasuryZec(100_000_000n)).toBe("1");
  });

  it.each(["0", "-1", "1e3", "NaN", "1.000000001", "01", "21000000.00000001", "Infinity"])(
    "rejects inexact or unsupported amount %s", (amount) => {
      expect(() => parseTreasuryAmountZat(amount)).toThrow();
    }
  );

  it("rejects actor/community overrides, numeric amounts and allocation within one fund", () => {
    const common = { amountZec: "1", reason: "Reserve for continuity", idempotencyKey: "00000000-0000-4000-8000-000000000001" };
    const funding = { ...common, treasuryKind: "COMMUNITY", fundingSource: "Opening recorded balance" };
    expect(treasuryFundingInputSchema.safeParse({ ...funding, actorUserId: "other" }).success).toBe(false);
    expect(treasuryFundingInputSchema.safeParse({ ...funding, communityId: "other" }).success).toBe(false);
    expect(treasuryFundingInputSchema.safeParse({ ...funding, amountZec: 1 }).success).toBe(false);
    expect(treasuryAllocationInputSchema.safeParse({ ...common, fromTreasuryKind: "COMMUNITY", toTreasuryKind: "COMMUNITY" }).success).toBe(false);
  });
});
