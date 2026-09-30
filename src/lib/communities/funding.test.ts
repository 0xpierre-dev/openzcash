import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const recipientTotals = vi.fn();
vi.mock("@/lib/zcg/disbursements-repo", () => ({
  recipientTotals: () => recipientTotals(),
}));
const treasuryPayouts = vi.fn();
vi.mock("@/lib/zechub/treasury-repo", () => ({
  treasuryPayouts: () => treasuryPayouts(),
}));

const { cached, invalidate, LEDGER_TTL_MS } = await import("@/lib/cache/memo");
const {
  FALLBACK_RETRY_MS,
  LEDGER_TIMEOUT_MS,
  getCommunitiesFunding,
  resetCommunitiesFunding,
} = await import("./funding");
const { COMMUNITIES } = await import("./data");
const { DAO_SHEET_FALLBACK_AS_OF, ZECHUB_DAO_PROPOSALS } = await import(
  "./dao-proposals"
);
type Communities = Awaited<ReturnType<typeof getCommunitiesFunding>>["communities"];

const brazil = (cs: Communities) =>
  cs.find((c) => c.id === "zcash-brazil")?.zcg;
const mexico = (cs: Communities) =>
  cs.find((c) => c.id === "zcash-club-queretaro")?.zcg.zechubDao?.grants?.[0];

const MEXICO_ROW = {
  title: ZECHUB_DAO_PROPOSALS.A178.sheet!.title,
  paidUsdCents: 290_000n,
  pendingUsdCents: 290_000n,
  m1: "Complete",
  m2: "Incomplete",
  m3: null,
  capturedOn: "2026-10-05",
};

const BRAZIL_TOTAL = {
  recipientName: "Zcash Brazil",
  externalUsdCents: 65_595_543n,
  externalPaidUsdCents: 55_662_043n,
  grantCount: 7,
  externalPaymentCount: 62,
  externalLastPaid: "2026-09-01",
};

beforeEach(() => {
  invalidate();
  resetCommunitiesFunding();
  recipientTotals.mockReset();
  treasuryPayouts.mockReset();
  treasuryPayouts.mockResolvedValue([MEXICO_ROW]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("getCommunitiesFunding", () => {
  it("reads the very memo entry /zcg/recipients fills, so both pages agree", async () => {
    // What src/app/zcg/recipients/page.tsx does on its own request.
    await cached("recipientTotals", LEDGER_TTL_MS, async () => [BRAZIL_TOTAL]);
    const result = await getCommunitiesFunding();
    expect(recipientTotals).not.toHaveBeenCalled();
    expect(result.source).toBe("ledger");
    expect(brazil(result.communities)).toMatchObject({
      funded: true,
      budgetedUsd: 655955.43,
      lastPaid: "2026-09-01",
    });
  });

  it("reads the ledger once per TTL", async () => {
    recipientTotals.mockResolvedValue([BRAZIL_TOTAL]);
    await getCommunitiesFunding();
    await getCommunitiesFunding();
    expect(recipientTotals).toHaveBeenCalledTimes(1);
  });

  it("keeps the page up with the dated fallback figures when the ledger is unreachable", async () => {
    recipientTotals.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const result = await getCommunitiesFunding();
    expect(result.source).toBe("fallback");
    expect(result.communities.map((c) => c.zcg.budgetedUsd)).toEqual(
      COMMUNITIES.map((c) => c.zcg.budgetedUsd),
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("fallback"),
      "connect ECONNREFUSED",
    );
  });

  it("stops waiting on a ledger read that never settles, like the forum fetches", async () => {
    vi.useFakeTimers();
    recipientTotals.mockReturnValue(new Promise(() => {}));
    const pending = getCommunitiesFunding();
    await vi.advanceTimersByTimeAsync(LEDGER_TIMEOUT_MS);
    const result = await pending;
    expect(LEDGER_TIMEOUT_MS).toBeLessThanOrEqual(5_000);
    expect(result.source).toBe("fallback");
    expect(brazil(result.communities)).toMatchObject({
      budgetedUsd: 655955.43,
      lastPaid: "2026-08-03",
    });
  });

  it("serves the fallback for a short while after a failure instead of retrying on every request", async () => {
    vi.useFakeTimers();
    recipientTotals.mockRejectedValue(new Error("connect ECONNREFUSED"));
    await getCommunitiesFunding();
    await getCommunitiesFunding();
    expect(recipientTotals).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);

    recipientTotals.mockResolvedValue([BRAZIL_TOTAL]);
    await vi.advanceTimersByTimeAsync(FALLBACK_RETRY_MS);
    const recovered = await getCommunitiesFunding();
    expect(recipientTotals).toHaveBeenCalledTimes(2);
    expect(recovered.source).toBe("ledger");
  });
});

describe("ZecHub DAO payouts", () => {
  it("overlays the imported treasury sheet, independently of the ledger", async () => {
    recipientTotals.mockRejectedValue(new Error("ledger down"));
    const result = await getCommunitiesFunding();
    expect(result.source).toBe("fallback");
    expect(result.dao).toEqual({ source: "sheet", sheetAsOf: "2026-10-05" });
    expect(mexico(result.communities)).toMatchObject({
      ref: "A178",
      payout: "sheet",
      paidUsd: 2900,
      outstandingUsd: 2900,
    });
  });

  it("reads the sheet once per TTL", async () => {
    recipientTotals.mockResolvedValue([BRAZIL_TOTAL]);
    await getCommunitiesFunding();
    await getCommunitiesFunding();
    expect(treasuryPayouts).toHaveBeenCalledTimes(1);
  });

  it("falls back to the dated curated figures when the sheet mirror is unreachable", async () => {
    recipientTotals.mockResolvedValue([BRAZIL_TOTAL]);
    treasuryPayouts.mockRejectedValue(new Error("relation does not exist"));
    const result = await getCommunitiesFunding();
    expect(result.source).toBe("ledger");
    expect(result.dao).toEqual({
      source: "fallback",
      sheetAsOf: DAO_SHEET_FALLBACK_AS_OF,
    });
    expect(mexico(result.communities)).toMatchObject({
      payout: "fallback",
      paidUsd: 1500,
      outstandingUsd: 4300,
    });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("ZecHub treasury sheet unavailable"),
      "relation does not exist",
    );
  });

  it("does not wait on a sheet read that never settles", async () => {
    vi.useFakeTimers();
    recipientTotals.mockResolvedValue([BRAZIL_TOTAL]);
    treasuryPayouts.mockReturnValue(new Promise(() => {}));
    const pending = getCommunitiesFunding();
    await vi.advanceTimersByTimeAsync(LEDGER_TIMEOUT_MS);
    const result = await pending;
    expect(result.source).toBe("ledger");
    expect(result.dao?.source).toBe("fallback");
  });
});
