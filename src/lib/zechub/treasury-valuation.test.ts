import { describe, expect, it } from "vitest";
import { valueTreasurySnapshot } from "./treasury-valuation";
import type { ZecUsdQuote } from "@/lib/pricing/live-price";

const snapshot = {
  capturedOn: "2026-08-05", zecPriceCents: 52100n,
  donationsZat: 41478000000n, donationsUsdCents: 21610038n,
  fpfZat: 4500000000n, fpfUsdCents: 2344500n,
  incZat: 5435400000n, incUsdCents: 2831843n,
};
const quote: ZecUsdQuote = {
  cents: 113274, source: "CoinGecko", sourceUrl: "https://api.coingecko.com/",
  quotedAt: "2026-09-10T21:21:30Z", fetchedAt: "2026-09-10T21:23:08Z", stale: false,
};

describe("dated treasury valuation", () => {
  it("values the public August holdings at the September quote and reconciles displayed rows", () => {
    const original = { ...snapshot };
    expect(valueTreasurySnapshot(snapshot, quote)).toMatchObject({
      basis: "snapshot-balances-at-market-price", balanceAsOf: "2026-08-05",
      priceCents: 113274n, donationsUsdCents: 46983790n, fpfUsdCents: 5097330n,
      incUsdCents: 6156895n, totalUsdCents: 58238015n,
    });
    expect(snapshot).toEqual(original);
  });
  it("falls back to the recorded USD amounts without a market quote", () => {
    expect(valueTreasurySnapshot(snapshot, null)).toMatchObject({
      basis: "sheet-recorded-values", priceCents: 52100n,
      totalUsdCents: 26786381n, quote: null,
    });
  });
  it("keeps unknown holdings unknown, including the aggregate", () => {
    expect(valueTreasurySnapshot({ ...snapshot, incZat: null }, quote)).toMatchObject({
      incUsdCents: null, totalUsdCents: null,
    });
    expect(valueTreasurySnapshot({ ...snapshot, incUsdCents: null }, null).totalUsdCents).toBeNull();
  });
  it("distinguishes a zero balance from an unknown balance", () => {
    expect(valueTreasurySnapshot({ ...snapshot, incZat: 0n }, quote)).toMatchObject({
      incUsdCents: 0n, totalUsdCents: 52081120n,
    });
  });
});
