import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const fetchMock = vi.fn();
const start = new Date("2026-09-10T21:23:08Z");
const payload = (usd = 1132.74, last_updated_at: number | undefined = 1789075290) =>
  ({ ok: true, json: async () => ({ zcash: { usd, last_updated_at } }) });

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(start);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("ZEC market quote lifecycle", () => {
  it("preserves provider time and the cents API while reusing a fresh quote", async () => {
    fetchMock.mockResolvedValue(payload());
    const { currentZecUsdQuote, currentZecUsdCents } = await import("./live-price");
    expect(await currentZecUsdQuote()).toMatchObject({
      cents: 113274, quotedAt: "2026-09-10T21:21:30.000Z",
      fetchedAt: start.toISOString(), source: "CoinGecko", stale: false,
    });
    expect(await currentZecUsdCents()).toBe(113274);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("include_last_updated_at=true");
  });

  it("refreshes an expired quote, then exposes stale cache with its original dates on failure", async () => {
    fetchMock.mockResolvedValueOnce(payload()).mockResolvedValueOnce(payload(1200, 1789076048));
    const { currentZecUsdQuote } = await import("./live-price");
    await currentZecUsdQuote();
    vi.setSystemTime(new Date(start.getTime() + 11 * 60_000));
    const refreshed = await currentZecUsdQuote();
    expect(refreshed).toMatchObject({ cents: 120000, stale: false });
    fetchMock.mockRejectedValue(new Error("feed unavailable"));
    vi.setSystemTime(new Date(start.getTime() + 22 * 60_000));
    expect(await currentZecUsdQuote()).toEqual({ ...refreshed, stale: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not label an old provider quote fresh just because it was fetched now", async () => {
    fetchMock.mockResolvedValue(payload(521, 1786050000));
    const { currentZecUsdQuote } = await import("./live-price");
    expect(await currentZecUsdQuote()).toMatchObject({ cents: 52100, stale: true });
  });

  it("shares one feed request across concurrent page and API renders", async () => {
    let resolve!: (value: ReturnType<typeof payload>) => void;
    fetchMock.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { currentZecUsdQuote, currentZecUsdCents } = await import("./live-price");
    const requests = [currentZecUsdQuote(), currentZecUsdQuote(), currentZecUsdCents()];
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(payload());
    const results = await Promise.all(requests);
    expect(results[0]).toEqual(results[1]);
    expect(results[2]).toBe(113274);
  });

  it("backs off briefly after an outage and recovers without restarting the server", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(payload());
    const { currentZecUsdQuote } = await import("./live-price");
    expect(await currentZecUsdQuote()).toBeNull();
    vi.setSystemTime(new Date(start.getTime() + 29_999));
    expect(await currentZecUsdQuote()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date(start.getTime() + 30_000));
    expect(await currentZecUsdQuote()).toMatchObject({ cents: 113274, stale: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses retrieval time without inventing a provider timestamp when it is absent", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ zcash: { usd: 1132.74 } }) });
    const { currentZecUsdQuote } = await import("./live-price");
    expect(await currentZecUsdQuote()).toMatchObject({ quotedAt: null, fetchedAt: start.toISOString(), stale: false });
  });

  it.each([0, -1, NaN, Infinity, Number.MAX_VALUE])("rejects invalid price %s", async (price) => {
    fetchMock.mockResolvedValue(payload(price));
    const { currentZecUsdQuote } = await import("./live-price");
    expect(await currentZecUsdQuote()).toBeNull();
  });

  it("returns null with no cache and an unavailable feed", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const { currentZecUsdCents } = await import("./live-price");
    expect(await currentZecUsdCents()).toBeNull();
  });
});
