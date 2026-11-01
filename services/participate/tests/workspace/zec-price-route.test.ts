// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { getPrice } = vi.hoisted(() => ({ getPrice: vi.fn() }));
vi.mock("@/lib/market/zec-usd", () => ({ getPublicZecUsdPrice: getPrice }));
import { GET } from "@/app/api/participate/zec-price/route";

const now = new Date("2026-10-10T12:00:00Z");
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); getPrice.mockReset(); });
afterEach(() => vi.useRealTimers());

describe("read-only public ZEC price API", () => {
  it("serves guests the exact rate and original freshness window without a session, account or wallet", async () => {
    getPrice.mockResolvedValue({ rateUsdPerZecE8: 33333000000n, quotedAt: now, retrievedAt: now });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ rateUsdPerZecE8: "33333000000", quotedAt: now.toISOString(), retrievedAt: now.toISOString(), expiresAt: "2026-10-10T12:05:00.000Z" });
  });
  it("fails closed if the provider is unavailable and does not leak details", async () => {
    getPrice.mockRejectedValue(new Error("private provider details"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("15");
    expect(await response.json()).toEqual({ error: "ZEC_PRICE_UNAVAILABLE" });
  });
  it("does not revalidate an expired source price just because it was fetched now", async () => {
    getPrice.mockResolvedValue({ rateUsdPerZecE8: 33333000000n, quotedAt: new Date(+now - 300_000), retrievedAt: now });
    expect((await GET()).status).toBe(503);
  });
  it("keeps a fallback's original timestamps and remaining validity", async () => {
    const original = new Date(+now - 90_000);
    getPrice.mockResolvedValue({ rateUsdPerZecE8: 33333000000n, quotedAt: original, retrievedAt: original });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ rateUsdPerZecE8: "33333000000", quotedAt: original.toISOString(), retrievedAt: original.toISOString(), expiresAt: "2026-10-10T12:03:30.000Z" });
  });
});
