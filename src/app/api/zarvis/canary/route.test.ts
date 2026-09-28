import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ run: vi.fn(), record: vi.fn(), alert: vi.fn(), config: vi.fn() }));
vi.mock("@/lib/zarvis/canary", () => ({ runCanary: mocks.run }));
vi.mock("@/lib/zarvis/metrics-store", () => ({ recordCanary: mocks.record }));
vi.mock("@/lib/zarvis/alerts", () => ({ sendAlert: mocks.alert }));
vi.mock("@/lib/zarvis/config", () => ({ zarvisConfig: mocks.config }));
import { GET } from "./route";
const request = (auth?: string) => new Request("https://openzcash.org/api/zarvis/canary", { headers: auth ? { authorization: auth } : {} });
const passed = { at: "2026-09-28T12:00:00.000Z", ok: true, ms: 700, passed: 4, failed: 0, failedCases: [], cases: [] };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("CRON_SECRET", "cron-secret-sentinel-value");
  vi.spyOn(console, "info").mockImplementation(() => {});
  mocks.config.mockReturnValue({ enabled: true, canaryModel: false }); mocks.run.mockResolvedValue(passed); mocks.record.mockResolvedValue(true);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("Zarvis canary route", () => {
  it("is gated by the shared cron secret", async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("Bearer wrong"))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request("Bearer cron-secret-sentinel-value"))).status).toBe(503);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("runs the zero-cost checks, stores the result and answers 200", async () => {
    const response = await GET(request("Bearer cron-secret-sentinel-value"));
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ ok: true, passed: 4, stored: true });
    expect(mocks.run.mock.calls[0][1]).toEqual({ model: false }); expect(mocks.record).toHaveBeenCalledWith(passed); expect(mocks.alert).not.toHaveBeenCalled();
  });
  it("adds the paid case only when explicitly enabled and the assistant is on", async () => {
    mocks.config.mockReturnValue({ enabled: true, canaryModel: true });
    await GET(request("Bearer cron-secret-sentinel-value")); expect(mocks.run.mock.calls[0][1]).toEqual({ model: true });
    mocks.config.mockReturnValue({ enabled: false, canaryModel: true });
    await GET(request("Bearer cron-secret-sentinel-value")); expect(mocks.run.mock.calls[1][1]).toEqual({ model: false });
  });
  it("answers 503 and alerts with labels only when a check fails", async () => {
    mocks.run.mockResolvedValue({ ...passed, ok: false, passed: 3, failed: 1, failedCases: ["treasuries"] }); mocks.record.mockResolvedValue(false);
    const response = await GET(request("Bearer cron-secret-sentinel-value"));
    expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ ok: false, failedCases: ["treasuries"], stored: false });
    expect(mocks.alert).toHaveBeenCalledWith("canary", "Zarvis canary failed: 1 of 4 checks (treasuries).");
  });
});
