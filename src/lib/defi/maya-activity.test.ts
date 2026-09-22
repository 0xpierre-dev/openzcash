import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const summary = {
  startTime: "1746057600",
  endTime: "1790039428",
  totalVolumeUSD: "27390369218",
  totalCount: "924489",
};
const mockFetch = vi.fn(async (url: string) => {
  const data = url.includes("/health")
    ? { inSync: true }
    : url.includes("/pool/ZEC.ZEC")
      ? {
          asset: "ZEC.ZEC",
          assetDepth: "100000000",
          runeDepth: "10000000000",
          status: "available",
        }
      : url.includes("interval=month")
        ? { intervals: [summary] }
        : { meta: summary };
  return { ok: true, json: async () => data };
});

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-22T04:00:00Z"));
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Maya feed resilience", () => {
  it("shares in-flight requests and caches each source for five minutes", async () => {
    const { getMayaActivity } = await import("./maya-activity");
    const [a, b] = await Promise.all([getMayaActivity(), getMayaActivity()]);
    expect(mockFetch).toHaveBeenCalledTimes(5);
    expect(a).toEqual(b);
    expect(a.allTime?.data.volumeUsd).toBe(273903692.18);
    await getMayaActivity();
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });
  it("keeps a dated stale snapshot on failure instead of replacing it with zero", async () => {
    const { getMayaActivity } = await import("./maya-activity");
    const first = await getMayaActivity();
    vi.advanceTimersByTime(5 * 60_000 + 1);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const stale = await getMayaActivity();
    expect(stale.allTime).toEqual({ ...first.allTime, stale: true });
    expect(stale.allTime?.fetchedAt).toBe("2026-09-22T04:00:00.000Z");
    expect(stale.allTime?.data.volumeUsd).toBe(273903692.18);
  });
  it("isolates failed sources while retaining the working pool and health feeds", async () => {
    vi.stubGlobal("fetch", async (url: string) =>
      url.includes("history/")
        ? { ok: true, json: async () => ({ error: "unavailable" }) }
        : mockFetch(url),
    );
    const { getMayaActivity } = await import("./maya-activity");
    const result = await getMayaActivity();
    expect(result.allTime).toBeNull();
    expect(result.monthly).toBeNull();
    expect(result.last30d).toBeNull();
    expect(result.liquidity?.data.zec).toBe(1);
    expect(result.sync?.data.inSync).toBe(true);
  });
});
