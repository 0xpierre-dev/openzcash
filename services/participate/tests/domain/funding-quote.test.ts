import { describe, expect, it } from "vitest";
import { assertFreshFundingQuote, estimateFundingZat, formatUsdPerZec, fundingQuoteExpiresAt, parseUsdPerZecE8 } from "@/lib/domain/funding-quote";

describe("USD-funded ZEC estimates", () => {
  it("keeps provider decimal precision and formats the exact rate", () => {
    expect(parseUsdPerZecE8("1217.10500822")).toBe(121710500822n);
    expect(formatUsdPerZec(121710500822n)).toBe("$1,217.10500822");
    expect(formatUsdPerZec(10000000000n)).toBe("$100.00");
  });
  it.each(["0", "-1", "1e2", "1,000", "01.00", "1.000000001", "NaN", "10000001"])("rejects invalid rate %s", (value) => {
    expect(() => parseUsdPerZecE8(value)).toThrow();
  });
  it("divides exact USD cents and rounds up by at most one zatoshi", () => {
    expect(estimateFundingZat(180000n, parseUsdPerZecE8("100"))).toBe(1800000000n);
    expect(estimateFundingZat(100n, parseUsdPerZecE8("3"))).toBe(33333334n);
    const price = parseUsdPerZecE8("1217.10500822");
    const payment = estimateFundingZat(180001n, price);
    expect(payment * price).toBeGreaterThanOrEqual(180001n * 100_000_000_000_000n);
    expect((payment - 1n) * price).toBeLessThan(180001n * 100_000_000_000_000n);
    expect(estimateFundingZat(1n, parseUsdPerZecE8("10000000"))).toBe(1n);
  });
  it("does not overflow with bigint inputs or silently return an impossible ZEC amount", () => {
    expect(() => estimateFundingZat(9_223_372_036_854_775_807n, 1n)).toThrow("limit");
    expect(() => estimateFundingZat(0n, 1n)).toThrow();
    expect(() => estimateFundingZat(1n, 0n)).toThrow();
  });
  it("expires exactly five minutes after source time, and rejects future/missing timestamps", () => {
    const quotedAt = new Date("2026-10-09T12:00:00Z");
    expect(fundingQuoteExpiresAt(quotedAt).toISOString()).toBe("2026-10-09T12:05:00.000Z");
    expect(() => assertFreshFundingQuote(quotedAt, new Date("2026-10-09T12:04:59.999Z"))).not.toThrow();
    expect(() => assertFreshFundingQuote(quotedAt, new Date("2026-10-09T12:05:00Z"))).toThrow();
    expect(() => assertFreshFundingQuote(quotedAt, new Date("2026-10-09T11:59:59Z"))).toThrow();
    expect(() => assertFreshFundingQuote(new Date("invalid"), quotedAt)).toThrow();
  });
  it("never carries the same source quote into the next UTC day", () => {
    const quotedAt = new Date("2026-10-09T23:58:00Z");
    expect(fundingQuoteExpiresAt(quotedAt).toISOString()).toBe("2026-10-10T00:00:00.000Z");
    expect(() => assertFreshFundingQuote(quotedAt, new Date("2026-10-10T00:00:00Z"))).toThrow();
  });
});
