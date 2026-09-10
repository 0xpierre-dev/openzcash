import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ZecUsdQuote } from "@/lib/pricing/live-price";

const state = vi.hoisted(() => ({ snapshot: {} as Record<string, unknown> | null, quote: null as ZecUsdQuote | null }));
vi.mock("@/lib/zechub/treasury-repo", () => ({
  latestTreasurySnapshot: async () => state.snapshot,
  treasuryAllocations: async () => [],
  treasuryPayouts: async () => [{ title: "Recorded grant", paidUsdCents: 2175000n, pendingUsdCents: 847000n }],
}));
vi.mock("@/lib/pricing/live-price", () => ({ currentZecUsdQuote: async () => state.quote }));
import { GET } from "./route";

beforeEach(() => {
  state.snapshot = {
    id: "snapshot", capturedOn: "2026-08-05", zecPriceCents: 52100n,
    donationsZat: 41478000000n, donationsUsdCents: 21610038n,
    fpfZat: 4500000000n, fpfUsdCents: 2344500n,
    incZat: 5435400000n, incUsdCents: 2831843n,
    fpfUnreservedZat: 2874000000n, fpfReservedUsdCents: 847000n,
    totalPaidOutUsdCents: 1655000n, toBePaidOutUsdCents: 847000n,
  };
  state.quote = {
    cents: 113274, source: "CoinGecko", sourceUrl: "https://api.coingecko.com/",
    quotedAt: "2026-09-10T21:21:30Z", fetchedAt: "2026-09-10T21:23:08Z", stale: false,
  };
});

describe("treasury API market valuation", () => {
  it("adds dated market valuation while preserving historical USD, ZEC, payouts and commitments", async () => {
    const response = await GET();
    const body = await response.json();
    expect(body).toMatchObject({
      capturedOn: "2026-08-05", zecPriceUsd: 521,
      treasuries: {
        donations: { zec: 414.78, usd: 216100.38 },
        fpf: { zec: 45, usd: 23445, spendableZec: 28.74, reservedUsd: 8470 },
        zechubInc: { zec: 54.354, usd: 28318.43 },
      },
      totals: { zec: 514.134, paidOutUsd: 21750, paidOutUsdSheet: 16550, committedUsd: 8470 },
      valuation: {
        basis: "snapshot-balances-at-market-price", balanceAsOf: "2026-08-05",
        zecPriceUsd: 1132.74, quoteAsOf: "2026-09-10T21:21:30Z", stale: false,
        donationsUsd: 469837.9, fpfUsd: 50973.3, zechubIncUsd: 61568.95, totalUsd: 582380.15,
      },
      payouts: [{ title: "Recorded grant", paidUsd: 21750, pendingUsd: 8470 }],
    });
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
  });
  it("explicitly falls back to sheet valuation when the quote is unavailable", async () => {
    state.quote = null;
    expect((await (await GET()).json()).valuation).toMatchObject({
      basis: "sheet-recorded-values", quoteAsOf: null, stale: null,
      zecPriceUsd: 521, totalUsd: 267863.81,
    });
  });
  it("exposes stale cached quote dates without relabeling them", async () => {
    state.quote!.stale = true;
    expect((await (await GET()).json()).valuation).toMatchObject({
      stale: true, quoteAsOf: "2026-09-10T21:21:30Z", totalUsd: 582380.15,
    });
  });
  it("retains the unavailable response before the source has been imported", async () => {
    state.snapshot = null;
    expect((await GET()).status).toBe(503);
  });
  it("does not invent a provider quote time from the retrieval time", async () => {
    state.quote!.quotedAt = null;
    expect((await (await GET()).json()).valuation).toMatchObject({
      quoteAsOf: null, fetchedAt: "2026-09-10T21:23:08Z", totalUsd: 582380.15,
    });
  });
});
