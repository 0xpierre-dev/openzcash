import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));
const { snapshot, lockbox, price } = vi.hoisted(() => ({
  snapshot: vi.fn(),
  lockbox: vi.fn(),
  price: vi.fn(),
}));
vi.mock("@/lib/zcg/snapshots-repo", () => ({ latestSnapshot: snapshot }));
vi.mock("@/lib/zcash/lockbox-live", () => ({ currentLockboxZec: lockbox }));
vi.mock("@/lib/pricing/live-price", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pricing/live-price")>()),
  currentZecUsdCents: price,
}));
// Pass-through memo so every test computes from its own mocks.
vi.mock("@/lib/cache/memo", () => ({
  cached: (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn(),
}));

import {
  getTreasurySummary,
  SHEET_STALE_AFTER_MS,
  sheetFreshnessNote,
} from "./treasury-summary";

const HOUR = 3_600_000;
// ZCG's own sheet tab, as last filled and flagged in production.
const CAPTURED = new Date("2026-09-23T20:16:58Z");

describe("sheetFreshnessNote", () => {
  it("stays silent for a recent snapshot marked OK", () => {
    const now = new Date(CAPTURED.getTime() + 10 * HOUR);
    expect(
      sheetFreshnessNote({ blockTime: CAPTURED, status: "ok" }, now),
    ).toBeNull();
    expect(
      sheetFreshnessNote({ blockTime: CAPTURED, status: null }, now),
    ).toBeNull();
  });

  it("treats exactly 48 hours as still fresh", () => {
    expect(SHEET_STALE_AFTER_MS).toBe(48 * HOUR);
    const now = new Date(CAPTURED.getTime() + SHEET_STALE_AFTER_MS);
    expect(
      sheetFreshnessNote({ blockTime: CAPTURED, status: "ok" }, now),
    ).toBeNull();
  });

  it("dates a snapshot older than 48 hours even when the sheet says OK", () => {
    const now = new Date(CAPTURED.getTime() + SHEET_STALE_AFTER_MS + 60_000);
    expect(
      sheetFreshnessNote({ blockTime: CAPTURED, status: "ok" }, now),
    ).toEqual({
      date: "Sep 23",
      title: "ZCG's sheet · captured 2026-09-23 20:16 UTC",
    });
  });

  it("dates a fresh snapshot the sheet itself flags as needing updates", () => {
    const now = new Date(CAPTURED.getTime() + HOUR);
    expect(
      sheetFreshnessNote(
        { blockTime: CAPTURED, status: "updates_required" },
        now,
      ),
    ).toEqual({
      date: "Sep 23",
      title: "ZCG's sheet: updates required · captured 2026-09-23 20:16 UTC",
    });
  });

  it("describes the production case: flagged and a week old", () => {
    const now = new Date("2026-09-30T12:00:00Z");
    expect(
      sheetFreshnessNote(
        { blockTime: CAPTURED, status: "updates_required" },
        now,
      ),
    ).toEqual({
      date: "Sep 23",
      title: "ZCG's sheet: updates required · captured 2026-09-23 20:16 UTC",
    });
  });

  it("adds the year when the snapshot is from an earlier year", () => {
    const old = new Date("2025-12-30T08:05:00Z");
    const now = new Date("2026-01-05T00:00:00Z");
    expect(sheetFreshnessNote({ blockTime: old, status: null }, now)).toEqual({
      date: "Dec 30, 2025",
      title: "ZCG's sheet · captured 2025-12-30 08:05 UTC",
    });
  });

  it("stays silent for a timestamp ahead of the clock that is not flagged", () => {
    const now = new Date(CAPTURED.getTime() - 5 * HOUR);
    expect(
      sheetFreshnessNote({ blockTime: CAPTURED, status: "ok" }, now),
    ).toBeNull();
  });

  it("gives an unreadable block time no date, and never calls it fresh", () => {
    const now = new Date("2026-09-30T00:00:00Z");
    expect(
      sheetFreshnessNote(
        { blockTime: new Date(Number.NaN), status: "updates_required" },
        now,
      ),
    ).toEqual({
      date: null,
      title: "ZCG's sheet: updates required · capture time unknown",
    });
  });

  it("never calls a sheet with no block time fresh: its age is unknown", () => {
    const now = new Date("2026-09-30T00:00:00Z");
    expect(sheetFreshnessNote({ blockTime: null, status: "ok" }, now)).toEqual({
      date: null,
      title: "ZCG's sheet · capture time unknown",
    });
    expect(
      sheetFreshnessNote({ blockTime: null, status: "updates_required" }, now),
    ).toEqual({
      date: null,
      title: "ZCG's sheet: updates required · capture time unknown",
    });
  });
});

// The rule must use the UTC calendar day whatever the server's zone; pin
// zones on both sides of UTC so a local-date regression fails on any machine.
describe.each([
  ["America/Sao_Paulo", "2026-09-24T01:30:00Z", "Sep 24"],
  ["Pacific/Kiritimati", "2026-09-23T22:30:00Z", "Sep 23"],
  ["UTC", "2026-09-24T01:30:00Z", "Sep 24"],
])("sheetFreshnessNote in %s", (zone, blockTime, day) => {
  let saved: string | undefined;
  beforeAll(() => {
    saved = process.env.TZ;
    process.env.TZ = zone;
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  });

  it("uses the UTC calendar day, not the server's local one", () => {
    const at = new Date(blockTime);
    // The zone is really in effect: the local day differs from the UTC one.
    if (zone !== "UTC") expect(at.getDate()).not.toBe(at.getUTCDate());
    const now = new Date("2026-09-30T00:00:00Z");
    expect(sheetFreshnessNote({ blockTime: at, status: "ok" }, now)?.date).toBe(
      day,
    );
  });
});

describe("getTreasurySummary · ZCG operating freshness", () => {
  // Imported (capturedAt) hours after ZCG's own block time.
  const operating = {
    capturedAt: new Date(CAPTURED.getTime() + 5 * HOUR),
    blockTime: CAPTURED,
    status: "updates_required",
    blockHeight: 3_493_796n,
    zecBalanceZat: 8_843_500_000_000n,
    usdCashBalanceCents: 881_695_000n,
    zecusdPriceCents: 150_000n,
    usdTotalHoldingsCents: null,
  };
  const lock = {
    zat: 14_468_685_000_000n,
    height: 3_501_084,
    baselineHeight: 3_493_796,
    snap: {
      capturedAt: CAPTURED,
      status: "updates_required",
      zecusdPriceCents: 150_000n,
      usdTotalHoldingsCents: null,
    },
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    snapshot.mockReset().mockResolvedValue(operating);
    lockbox.mockReset().mockResolvedValue(lock);
    price.mockReset().mockResolvedValue(140_804);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("threads the sheet's block time and flag, and dates a stale figure", async () => {
    vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
    const t = await getTreasurySummary();
    expect(t?.operating).toMatchObject({
      blockTime: "2026-09-23T20:16:58.000Z",
      updatesRequired: true,
      asOf: {
        date: "Sep 23",
        title: "ZCG's sheet: updates required · captured 2026-09-23 20:16 UTC",
      },
    });
    // The pool's own tooltip carries the same provenance on a second line.
    expect(t?.operating?.exact).toBe(
      "88,435 ZEC ≈ $133,336,967.40 · $8,816,950 cash\nZCG's sheet: updates required · captured 2026-09-23 20:16 UTC",
    );
  });

  it("adds nothing when the sheet is fresh and OK", async () => {
    snapshot.mockResolvedValue({ ...operating, status: "ok" });
    vi.setSystemTime(new Date(CAPTURED.getTime() + 6 * HOUR));
    const t = await getTreasurySummary();
    expect(t?.operating?.asOf).toBeUndefined();
    expect(t?.operating?.updatesRequired).toBe(false);
    expect(t?.operating?.exact).toBe(
      "88,435 ZEC ≈ $133,336,967.40 · $8,816,950 cash",
    );
  });

  it("does not take a fresh import for a fresh sheet when the block time is missing", async () => {
    const now = new Date("2026-09-30T12:00:00Z");
    snapshot.mockResolvedValue({
      ...operating,
      status: "ok",
      capturedAt: now,
      blockTime: null,
    });
    vi.setSystemTime(now);
    const t = await getTreasurySummary();
    expect(t?.operating?.blockTime).toBeUndefined();
    expect(t?.operating?.asOf).toEqual({
      date: null,
      title: "ZCG's sheet · capture time unknown",
    });
  });

  it("leaves the live lockbox figure undated", async () => {
    vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
    const t = await getTreasurySummary();
    expect(t?.lockbox?.asOf).toBeUndefined();
  });
});
