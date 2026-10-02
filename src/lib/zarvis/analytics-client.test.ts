import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { NOW, supplyFixture, chainFixture, zecblockFixture, monthlyFixture } from "./fixtures/analytics";
const json = (value: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(value), { ...init, headers: { "content-type": "application/json", ...init.headers } });
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const signal = () => new AbortController().signal;
describe("Bounded public HTTP adapters", () => {
  it("uses fixed GETs without private headers, coalesces reads and retains the retrieval date", async () => {
    const fetch = vi.fn().mockImplementation(async () => json(supplyFixture()));
    vi.stubGlobal("fetch", fetch);
    const { readAnalytics } = await import("./analytics-client");
    const results = await Promise.all([readAnalytics("shieldedSupply", signal()), readAnalytics("shieldedSupply", signal())]);
    await readAnalytics("shieldedSupply", signal());
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe("https://api.shieldedscan.xyz/v1/supply");
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "GET", redirect: "error", cache: "no-store", headers: { Accept: "application/json" } });
    expect(Object.keys(fetch.mock.calls[0][1].headers).sort()).toEqual(["Accept", "User-Agent"]);
    expect(results[0].retrievedAt).toBe(new Date(NOW).toISOString());
    vi.setSystemTime(NOW + 61000);
    await readAnalytics("shieldedSupply", signal());
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each(["html", "huge", "json", "500"])("rejects unusable responses and does not retry automatically: %s", async kind => {
    const response = kind === "html" ? new Response("<html>challenge</html>")
      : kind === "huge" ? new Response("x".repeat(128 * 1024 + 1), { headers: { "content-type": "application/json" } })
      : kind === "json" ? new Response("{", { headers: { "content-type": "application/json" } })
      : json({}, { status: 500 });
    const fetch = vi.fn().mockResolvedValue(response); vi.stubGlobal("fetch", fetch);
    const { readAnalytics } = await import("./analytics-client");
    await expect(readAnalytics("shieldedSupply", signal())).rejects.toThrow();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("honors Retry-After across endpoints on the same provider", async () => {
    const fetch = vi.fn().mockImplementationOnce(async () => json({}, { status: 429, headers: { "retry-after": "120" } })).mockImplementation(async () => json({}));
    vi.stubGlobal("fetch", fetch);
    const { readAnalytics } = await import("./analytics-client");
    await expect(readAnalytics("shieldedSupply", signal())).rejects.toThrow("RATE_LIMIT");
    await expect(readAnalytics("shieldedChain", signal())).rejects.toThrow("RATE_LIMIT");
    expect(fetch).toHaveBeenCalledOnce();
    await readAnalytics("zecblockSupply", signal());
    vi.setSystemTime(NOW + 121000);
    await readAnalytics("shieldedChain", signal());
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("aborts a subscriber immediately while preserving another subscriber's public read", async () => {
    let resolve!: (r: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>(done => { resolve = done; })); vi.stubGlobal("fetch", fetch);
    const { readAnalytics } = await import("./analytics-client");
    const controller = new AbortController();
    const first = readAnalytics("shieldedSupply", controller.signal);
    const rejection = expect(first).rejects.toThrow("REQUEST_ABORTED");
    const second = readAnalytics("shieldedSupply", signal());
    controller.abort(); await rejection;
    resolve(json(supplyFixture()));
    await expect(second).resolves.toHaveProperty("value");
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("does not request after cancellation or accept an arbitrary date interval", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const { readAnalytics } = await import("./analytics-client");
    const controller = new AbortController(); controller.abort();
    await expect(readAnalytics("shieldedSupply", controller.signal)).rejects.toThrow();
    await expect(readAnalytics("shieldedSupply", signal(), { from: 1, to: 2 })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
describe("Explorer integration boundary", () => {
  function liveMock(missing?: string) {
    const fetch = vi.fn().mockImplementation(async (url: string) => {
      if (missing && url.includes(missing)) return json({}, { status: 503 });
      if (url.includes("/analytics/monthly")) return json(monthlyFixture());
      if (url.endsWith("/v1/supply")) return json(supplyFixture());
      if (url.endsWith("/v1/chain")) return json(chainFixture());
      return json(zecblockFixture());
    });
    vi.stubGlobal("fetch", fetch); return fetch;
  }
  it("reconciles both APIs and returns all source links", async () => {
    liveMock();
    const { lookupChainAnalytics } = await import("./chain-analytics");
    const evidence = await lookupChainAnalytics({ metric: "supply", month: null }, signal());
    expect(JSON.parse(evidence.content).data).toMatchObject({ status: "matched", selected: { provider: "ShieldedScan" }, unavailable: [] });
    expect(evidence.sources).toHaveLength(3);
  });
  it.each([["shieldedscan.xyz", "ZecBlock"], ["zecblock.com", "ShieldedScan"]])("degrades explicitly when %s fails", async (host, available) => {
    liveMock(host);
    const { lookupChainAnalytics } = await import("./chain-analytics");
    const evidence = await lookupChainAnalytics({ metric: "supply", month: null }, signal());
    expect(JSON.parse(evidence.content).data).toMatchObject({ status: "single_source", selected: { provider: available }, unavailable: [available === "ZecBlock" ? "ShieldedScan" : "ZecBlock"] });
  });
  it("builds an inclusive UTC request without treating upstream bucket-range metadata as custom-period coverage", async () => {
    const fetch = liveMock();
    const { lookupChainAnalytics } = await import("./chain-analytics");
    const evidence = await lookupChainAnalytics({ metric: "monthly_activity", month: "2026-09" }, signal());
    expect(fetch.mock.calls[0][0]).toBe("https://api.shieldedscan.xyz/v1/analytics/monthly?from=1788220800&to=1790812799");
    expect(JSON.parse(evidence.content).data.monthly).toMatchObject({ month: "2026-09", periodStatus: "closed", totalTransactions: 200 });
    expect(evidence.sources).toHaveLength(1);
  });
  it("neither falls back to another period nor reads for an invalid tool call", async () => {
    const fetch = liveMock();
    const { lookupChainAnalytics } = await import("./chain-analytics");
    const evidence = await lookupChainAnalytics({ metric: "monthly_activity", month: "2026-13" }, signal());
    expect(JSON.parse(evidence.content)).toHaveProperty("error");
    expect(fetch).not.toHaveBeenCalled();
  });
});
