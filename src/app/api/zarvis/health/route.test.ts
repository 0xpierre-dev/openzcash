import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ latestCanary: vi.fn(), degraded: vi.fn(), config: vi.fn() }));
vi.mock("@/lib/zarvis/metrics-store", () => ({ latestCanary: mocks.latestCanary }));
vi.mock("@/lib/zarvis/alerts", () => ({ providerDegraded: mocks.degraded }));
vi.mock("@/lib/zarvis/config", () => ({ zarvisConfig: mocks.config }));
import { GET } from "./route";
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-28T12:00:00.000Z")); mocks.config.mockReturnValue({ enabled: true, apiKey: "secret-sentinel" }); mocks.degraded.mockReturnValue(false); mocks.latestCanary.mockResolvedValue(null); });
afterEach(() => vi.useRealTimers());
describe("Public Zarvis health", () => {
  it("reports ok with no canary yet and never exposes configuration", async () => {
    const response = await GET(); const data = await response.json();
    expect(data).toEqual({ ok: true, lastCanaryAt: null, lastCanaryOk: null, degraded: false });
    expect(JSON.stringify(data)).not.toContain("secret"); expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("is degraded after a recent canary failure or a provider failure streak, and stale failures expire", async () => {
    mocks.latestCanary.mockResolvedValue({ at: "2026-09-28T11:00:00.000Z", ok: false, passed: 3, failed: 1, ms: 800, failedCases: ["price"] });
    expect(await (await GET()).json()).toEqual({ ok: false, lastCanaryAt: "2026-09-28T11:00:00.000Z", lastCanaryOk: false, degraded: true });
    mocks.latestCanary.mockResolvedValue({ at: "2026-09-28T05:00:00.000Z", ok: false, passed: 3, failed: 1, ms: 800, failedCases: ["price"] });
    expect(await (await GET()).json()).toMatchObject({ ok: true, lastCanaryOk: false, degraded: false });
    mocks.degraded.mockReturnValue(true);
    expect(await (await GET()).json()).toMatchObject({ ok: false, degraded: true });
    mocks.degraded.mockReturnValue(false); mocks.config.mockReturnValue({ enabled: false });
    expect(await (await GET()).json()).toMatchObject({ ok: false, degraded: false });
  });
});
