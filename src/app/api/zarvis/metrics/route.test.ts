import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const admin = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/admin", () => ({ getIsAdmin: admin }));
const store = vi.hoisted(() => ({ dailyMetrics: vi.fn(), spendTodayUsd: vi.fn(() => 0.5) }));
vi.mock("@/lib/zarvis/metrics-store", async (original) => ({ ...await original<object>(), dailyMetrics: store.dailyMetrics, spendTodayUsd: store.spendTodayUsd }));
import { GET } from "./route";
beforeEach(() => { store.dailyMetrics.mockResolvedValue([]); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
describe("Zarvis aggregate metrics", () => {
  it("requires an authenticated admin", async () => { admin.mockResolvedValue(false); expect((await GET()).status).toBe(403); });
  it("reports the live quota policy and expiry only to an authenticated admin", async () => {
    vi.stubEnv("ZARVIS_QUOTA_PAUSE_UNTIL", "2026-09-29T03:00:00.000Z");
    vi.stubEnv("ZARVIS_DAILY_REQUEST_LIMIT", "100");
    vi.stubEnv("ZARVIS_HOURLY_REQUEST_LIMIT", "30");
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-28T14:00:00.000Z"));
    admin.mockResolvedValue(false);
    expect((await GET()).status).toBe(403);
    admin.mockResolvedValue(true);
    expect((await (await GET()).json()).quota).toEqual({
      paused: true, resumesAt: "2026-09-29T03:00:00.000Z", dailyLimit: 100, hourlyLimit: 30, networkDailyLimit: 20, networkWindowLimit: 5, dailyUsdCap: null, estimatedSpendTodayUsd: 0.5,
    });
    vi.setSystemTime(new Date("2026-09-29T03:00:00.000Z"));
    expect((await (await GET()).json()).quota.paused).toBe(false);
  });
  it("returns process counters, the last fourteen durable days and alert state without identifiers", async () => {
    admin.mockResolvedValue(true);
    store.dailyMetrics.mockResolvedValue([{ day: "2026-09-28", route: "model", completed: 3, quota: 0, estimatedUsd: 0.4, latency: [0, 0, 3, 0, 0, 0, 0, 0, 0], p50BucketUpperMs: 3000, p95BucketUpperMs: 3000 }]);
    const response = await GET(); const data = await response.json();
    expect(data.process).toHaveProperty("modelCalls"); expect(data.process).toHaveProperty("quota"); expect(data.process).toHaveProperty("spendCap"); expect(data.process).toHaveProperty("busy");
    expect(data.daily).toEqual([expect.objectContaining({ day: "2026-09-28", route: "model", completed: 3, p95BucketUpperMs: 3000 })]);
    expect(data.alerts).toMatchObject({ configured: false, providerDegraded: false });
    expect(data.quota).toMatchObject({ dailyUsdCap: null, estimatedSpendTodayUsd: 0.5 });
    expect(store.dailyMetrics).toHaveBeenCalledWith(14);
    expect(JSON.stringify(data)).not.toMatch(/messages|apiKey|webhook/i); expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("keeps the process counters when the durable table is unavailable", async () => {
    admin.mockResolvedValue(true); store.dailyMetrics.mockRejectedValue(new Error("relation missing"));
    const data = await (await GET()).json();
    expect(data.daily).toBeNull(); expect(data.process).toHaveProperty("completed");
  });
});
