import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
vi.mock("@/lib/zcg/disbursements-repo", () => ({
  recipientTotals: async () => state.rows,
}));
vi.mock("@/lib/cache/memo", () => ({
  LEDGER_TTL_MS: 1,
  cached: async (_key: string, _ttl: number, loader: () => Promise<unknown>) =>
    loader(),
}));

import { GET } from "./route";

beforeEach(() => {
  state.rows = [{
    recipientName: "Example",
    usdCents: 75500000n,
    zecZat: 200000000n,
    externalUsdCents: 75000000n,
    externalZecZat: 0n,
    paidUsdCents: 500000n,
    paidZecZat: 200000000n,
    externalPaidUsdCents: 0n,
    externalPaidZecZat: 0n,
    grantCount: 1,
    paymentCount: 1,
    externalPaymentCount: 0,
    lastPaid: "2026-08-01",
    externalLastPaid: null,
    isInternal: false,
    hasInternal: true,
  }];
});

describe("recipient API payment scope", () => {
  it("keeps legacy budgeted USD and exposes external paid amounts separately", async () => {
    const response = await GET(new Request("https://example.test/api/zcg/data/recipients"));
    const { data } = await response.json();
    expect(data[0]).toMatchObject({
      usd: 750000,
      usdPaid: 0,
      zecPaid: 0,
      payments: 0,
      lastPaid: "",
    });
  });

  it("includes internal payments only when explicitly requested", async () => {
    const response = await GET(new Request("https://example.test/api/zcg/data/recipients?internal=1"));
    const { data } = await response.json();
    expect(data[0]).toMatchObject({
      usd: 755000,
      usdPaid: 5000,
      zecPaid: 2,
      payments: 1,
      lastPaid: "2026-08-01",
    });
  });

  it("includes the same explicit paid fields in CSV", async () => {
    const response = await GET(new Request("https://example.test/api/zcg/data/recipients?format=csv"));
    const csv = await response.text();
    expect(csv.split("\n")[0]).toContain("usdPaid,zecPaid");
  });
});
