// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseZecUsdPrice } from "@/lib/market/zec-usd";

const now = new Date("2026-10-09T12:00:00Z");
const timestamp = +now / 1000;
const raw = (usd = "1217.10500822", at = timestamp) => `{"zcash":{"usd":${usd},"last_updated_at":${at}}}`;
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("CoinGecko ZEC/USD source", () => {
  it("preserves the original decimal and source time", () => {
    expect(parseZecUsdPrice(raw(), now)).toEqual({ rateUsdPerZecE8: 121710500822n, quotedAt: now, retrievedAt: now });
  });
  it.each([
    raw("0"), raw("-1"), raw("1e3"), raw("1.000000001"), raw("10000001"), raw("null"),
    raw("100", timestamp - 300), raw("100", timestamp + 1),
    '{"bitcoin":{"usd":100}}', '{"zcash":{"usd":100}}',
    `{"zcash":{"usd":100,"usd":200,"last_updated_at":${timestamp}}}`,
    `{"zcash":{"usd":100,"last_updated_at":${timestamp},"last_updated_at":${timestamp}}}`,
    raw() + " ".repeat(2048), "<html>Error</html>"
  ])("rejects malformed, ambiguous, out-of-range or stale responses", (value) => {
    expect(() => parseZecUsdPrice(value, now)).toThrow("unavailable");
  });
  it("coalesces concurrent requests and reuses fresh prices without extending source time", async () => {
    vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(now);
    const fetcher = vi.fn().mockResolvedValue(new Response(raw())); vi.stubGlobal("fetch", fetcher);
    vi.stubEnv("COINGECKO_DEMO_API_KEY", "test-only-key");
    const { getZecUsdPrice } = await import("@/lib/market/zec-usd");
    const [first, second] = await Promise.all([getZecUsdPrice(), getZecUsdPrice()]);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(first).toEqual(second);
    expect(fetcher.mock.calls[0][0]).toContain("ids=zcash&vs_currencies=usd&include_last_updated_at=true&precision=8");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: "error", cache: "no-store", headers: { "x-cg-demo-api-key": "test-only-key" } });
    vi.setSystemTime(+now + 59_000);
    expect((await getZecUsdPrice()).quotedAt).toEqual(now);
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.setSystemTime(+now + 61_000); fetcher.mockResolvedValueOnce(new Response("unavailable", { status: 429 }));
    await expect(getZecUsdPrice()).rejects.toThrow("unavailable");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not use an old cache after a provider failure or accept oversized streams", async () => {
    vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(now);
    const fetcher = vi.fn().mockResolvedValue(new Response(" ".repeat(2049))); vi.stubGlobal("fetch", fetcher);
    const { getZecUsdPrice } = await import("@/lib/market/zec-usd");
    await expect(getZecUsdPrice()).rejects.toThrow("unavailable");
    fetcher.mockRejectedValueOnce(new Error("secret-provider-details"));
    await expect(getZecUsdPrice()).rejects.toThrow("A current ZEC price is unavailable");
  });
});

describe("public display price resilience", () => {
  it("coalesces public requests and preserves the exact source and retrieval times", async () => {
    vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(now);
    const fetcher = vi.fn().mockResolvedValue(new Response(raw())); vi.stubGlobal("fetch", fetcher);
    const { getPublicZecUsdPrice } = await import("@/lib/market/zec-usd");
    const [first, second] = await Promise.all([getPublicZecUsdPrice(), getPublicZecUsdPrice()]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(first).toEqual({ rateUsdPerZecE8: 121710500822n, quotedAt: now, retrievedAt: now });
  });

  it("serves a still-valid cached price after a failed refresh without relaxing funding refreshes", async () => {
    vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(now);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetcher = vi.fn().mockResolvedValue(new Response(raw())); vi.stubGlobal("fetch", fetcher);
    const { getPublicZecUsdPrice, getZecUsdPrice } = await import("@/lib/market/zec-usd");
    const original = await getPublicZecUsdPrice();
    vi.setSystemTime(+now + 61_000);
    fetcher.mockImplementation(async () => new Response("unavailable", { status: 429 }));
    expect(await getPublicZecUsdPrice()).toBe(original);
    expect(await getPublicZecUsdPrice()).toBe(original);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(original.quotedAt).toEqual(now);
    expect(original.retrievedAt).toEqual(now);
    // A funding quote still refreshes and fails, even while public reads are in cooldown.
    await expect(getZecUsdPrice()).rejects.toThrow("unavailable");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("backs off with an empty cache, throttles sanitized warnings and recovers after 15 seconds", async () => {
    vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(now);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetcher = vi.fn().mockRejectedValue(new Error("secret-provider-body-and-key"));
    vi.stubGlobal("fetch", fetcher);
    const { getPublicZecUsdPrice } = await import("@/lib/market/zec-usd");
    const failures = await Promise.allSettled([getPublicZecUsdPrice(), getPublicZecUsdPrice()]);
    expect(failures.map(result => result.status)).toEqual(["rejected", "rejected"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenLastCalledWith("[participate-zec-price] provider_unavailable", { source: "COINGECKO", retryAfterSeconds: 15 });
    vi.setSystemTime(+now + 14_999);
    await expect(getPublicZecUsdPrice()).rejects.toThrow("unavailable");
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.setSystemTime(+now + 15_000);
    await expect(getPublicZecUsdPrice()).rejects.toThrow("unavailable");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(warning).toHaveBeenCalledTimes(1);
    vi.setSystemTime(+now + 60_000);
    await expect(getPublicZecUsdPrice()).rejects.toThrow("unavailable");
    expect(warning).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(warning.mock.calls)).not.toContain("secret");
    vi.setSystemTime(+now + 75_000);
    fetcher.mockResolvedValueOnce(new Response(raw("1200", timestamp + 75)));
    expect(await getPublicZecUsdPrice()).toEqual({ rateUsdPerZecE8: 120000000000n, quotedAt: new Date(+now + 75_000), retrievedAt: new Date(+now + 75_000) });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it.each([
    ["five-minute expiry", "2026-10-09T12:00:00Z", "2026-10-09T11:56:01Z"],
    ["UTC midnight", "2026-10-09T23:58:59Z", "2026-10-09T23:58:59Z"]
  ])("drops fallback at %s even during the provider cooldown", async (_label, startAt, sourceAt) => {
    vi.resetModules(); vi.useFakeTimers();
    const start = new Date(startAt);
    const source = new Date(sourceAt);
    vi.setSystemTime(start);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetcher = vi.fn().mockResolvedValue(new Response(raw("1200", +source / 1000)));
    vi.stubGlobal("fetch", fetcher);
    const { getPublicZecUsdPrice } = await import("@/lib/market/zec-usd");
    const original = await getPublicZecUsdPrice();
    vi.setSystemTime(+start + 60_000);
    fetcher.mockRejectedValue(new Error("provider unavailable"));
    expect(await getPublicZecUsdPrice()).toBe(original);
    expect(original.quotedAt).toEqual(source);
    expect(original.retrievedAt).toEqual(start);
    vi.setSystemTime(+start + 61_000);
    await expect(getPublicZecUsdPrice()).rejects.toThrow("unavailable");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
