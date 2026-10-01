import { afterEach, describe, expect, it, vi } from "vitest";
import { cachedFeed, nextRefreshDelay } from "./cache";

afterEach(() => vi.useRealTimers());
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe("failure backoff", () => {
  it("keeps the TTL for a live source and doubles from one minute to one hour for a failing one", () => {
    expect(nextRefreshDelay(5 * MINUTE, "ok", 0)).toBe(5 * MINUTE);
    expect(nextRefreshDelay(HOUR, "ok", 0)).toBe(HOUR);
    expect(
      [1, 2, 3, 4, 5, 6, 7, 8, 20].map((n) =>
        nextRefreshDelay(HOUR, "failed", n),
      ),
    ).toEqual([1, 2, 4, 8, 16, 32, 60, 60, 60].map((m) => m * MINUTE));
    // A daily registry still recovers within the hour after an outage.
    expect(nextRefreshDelay(24 * HOUR, "failed", 30)).toBe(HOUR);
  });

  it("backs off partial coverage the same way, but never later than the normal TTL", () => {
    expect(
      [1, 2, 3, 4, 9].map((n) => nextRefreshDelay(5 * MINUTE, "partial", n)),
    ).toEqual([1, 2, 4, 5, 5].map((m) => m * MINUTE));
  });

  it("stops hammering a permanently blocked source and resets to the TTL once it answers", async () => {
    vi.useFakeTimers();
    let blocked = true;
    const loader = vi.fn(async () => {
      if (blocked) throw new Error("HTTP 429");
      return { zec: 464514.8551 };
    });
    const read = cachedFeed(loader, HOUR);
    const calls = () => loader.mock.calls.length;
    await read();
    for (const minutes of [1, 2, 4, 8, 16, 32, 60, 60]) {
      vi.advanceTimersByTime(minutes * MINUTE - 1);
      await read();
      const before = calls();
      vi.advanceTimersByTime(1);
      const feed = await read();
      expect(calls()).toBe(before + 1);
      expect(feed).toMatchObject({ data: null, stale: true });
    }
    expect(calls()).toBe(9);
    blocked = false;
    vi.advanceTimersByTime(HOUR);
    expect(await read()).toMatchObject({
      data: { zec: 464514.8551 },
      stale: false,
    });
    blocked = true;
    // Success resets the streak: the next failure retries after the TTL, then after one minute.
    vi.advanceTimersByTime(HOUR);
    await read();
    const afterReset = calls();
    vi.advanceTimersByTime(MINUTE);
    await read();
    expect(calls()).toBe(afterReset + 1);
  });

  it("publishes the backed-off retry time on snapshots", async () => {
    vi.useFakeTimers();
    const loader = vi.fn().mockRejectedValue(new Error("offline"));
    const read = cachedFeed(loader, HOUR, undefined, {
      staleWhileRevalidate: true,
    });
    await read();
    vi.advanceTimersByTime(MINUTE);
    const second = await read({ waitForRefresh: true });
    expect(Date.parse(second.refreshAfter!) - Date.now()).toBe(2 * MINUTE);
  });
});
describe("public-source cache", () => {
  it("retries failed partial coverage early without discarding its valid pools", async () => {
    vi.useFakeTimers();
    const loader = vi
      .fn<() => Promise<{ pools: number[]; failed: boolean }>>()
      .mockResolvedValueOnce({ pools: [1], failed: true })
      .mockResolvedValueOnce({ pools: [1, 2], failed: false });
    const read = cachedFeed(loader, 300_000, (data) => data.failed);
    expect((await read()).data?.pools).toEqual([1]);
    vi.advanceTimersByTime(59_999);
    await read();
    expect(loader).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect((await read()).data?.pools).toEqual([1, 2]);
    expect(loader).toHaveBeenCalledTimes(2);
  });
  it("deduplicates concurrent loads and respects the TTL", async () => {
    vi.useFakeTimers();
    const loader = vi.fn().mockResolvedValue({ volume: 100 });
    const read = cachedFeed(loader, 300000);
    const [a, b] = await Promise.all([read(), read()]);
    expect(a).toEqual(b);
    expect(loader).toHaveBeenCalledTimes(1);
    await read();
    expect(loader).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(300001);
    await read();
    expect(loader).toHaveBeenCalledTimes(2);
  });
  it("preserves the last successful timestamp on failure and backs off", async () => {
    vi.useFakeTimers();
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ volume: 100 })
      .mockRejectedValue(new Error("offline"));
    const read = cachedFeed(loader, 100);
    const first = await read();
    vi.advanceTimersByTime(101);
    const saved = await read();
    expect(saved).toMatchObject({
      data: { volume: 100 },
      fetchedAt: first.fetchedAt,
      stale: true,
    });
    await read();
    expect(loader).toHaveBeenCalledTimes(2);
  });
  it("returns missing data instead of fabricating zero activity", async () => {
    const read = cachedFeed(async () => {
      throw new Error("unavailable");
    });
    expect(await read()).toMatchObject({
      data: null,
      fetchedAt: null,
      stale: true,
    });
  });
});

describe("dashboard snapshots shared by page and API bundles", () => {
  it("uses one snapshot and one in-flight request across separately loaded modules", async () => {
    const pageLoader = vi.fn(async () => ({ dexPct: 3.46 }));
    const page = cachedFeed(pageLoader, 300_000, undefined, {
      key: "test:dashboard:bundles",
      staleWhileRevalidate: true,
    });
    vi.resetModules();
    const apiModule = await import("./cache");
    const apiLoader = vi.fn(async () => ({ dexPct: 4.21 }));
    const api = apiModule.cachedFeed(apiLoader, 300_000, undefined, {
      key: "test:dashboard:bundles",
      staleWhileRevalidate: true,
    });
    const [pageSnapshot, apiSnapshot] = await Promise.all([page(), api()]);
    expect(apiSnapshot).toEqual(pageSnapshot);
    expect(pageLoader).toHaveBeenCalledTimes(1);
    expect(apiLoader).not.toHaveBeenCalled();
  });

  it("does not roll back after an API refresh followed by a full page reload", async () => {
    vi.useFakeTimers();
    const loader = vi
      .fn()
      .mockResolvedValue({ dexPct: 3.46 })
      .mockResolvedValueOnce({ dexPct: 3.46 })
      .mockResolvedValueOnce({ dexPct: 4.21 });
    const options = {
      key: "test:dashboard:reload",
      staleWhileRevalidate: true,
    };
    const page = cachedFeed(loader, 300_000, undefined, options);
    const api = cachedFeed(loader, 300_000, undefined, options);
    const initial = await page();
    vi.advanceTimersByTime(300_001);
    const refreshed = await api({ waitForRefresh: true });
    const reloaded = await page();
    expect(initial.data).toEqual({ dexPct: 3.46 });
    expect(refreshed.data).toEqual({ dexPct: 4.21 });
    expect(reloaded).toEqual(refreshed);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("renders the dated snapshot immediately while one background refresh runs", async () => {
    vi.useFakeTimers();
    let complete!: (data: { dexPct: number }) => void;
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ dexPct: 3.46 })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      );
    const read = cachedFeed(loader, 100, undefined, {
      staleWhileRevalidate: true,
    });
    const initial = await read();
    vi.advanceTimersByTime(101);
    const loading = await read();
    expect(loading).toMatchObject({
      data: initial.data,
      fetchedAt: initial.fetchedAt,
      stale: true,
      refreshing: true,
    });
    const manual = read({ waitForRefresh: true });
    const anotherPage = await read();
    expect(anotherPage.data).toEqual(initial.data);
    expect(loader).toHaveBeenCalledTimes(2);
    complete({ dexPct: 4.21 });
    expect(await manual).toMatchObject({
      data: { dexPct: 4.21 },
      stale: false,
      refreshing: false,
    });
  });

  it("keeps the original snapshot date and backs off if background collection fails", async () => {
    vi.useFakeTimers();
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ dexPct: 3.46 })
      .mockRejectedValue(new Error("offline"));
    const read = cachedFeed(loader, 100, undefined, {
      staleWhileRevalidate: true,
    });
    const initial = await read();
    vi.advanceTimersByTime(101);
    await read();
    const failed = await read({ waitForRefresh: true });
    expect(failed).toMatchObject({
      data: initial.data,
      fetchedAt: initial.fetchedAt,
      stale: true,
      refreshing: false,
      error: "Source could not be refreshed",
    });
    await read();
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
