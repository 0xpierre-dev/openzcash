import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ getDb: () => { throw new Error("no database in unit tests"); } }));
import { metricsSnapshot, recordGeneration, resetMetricsForTests } from "./metrics";
import { resetStoreForTests, spendTodayUsd } from "./metrics-store";
import { alertState, resetAlertsForTests } from "./alerts";
const fetchMock = vi.fn();
const usage = { route: "model" as const, model: "grok-4.7", modelCalls: 2, webSearchCalls: 1, inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 0, usageReported: false };
beforeEach(() => { resetMetricsForTests(); resetStoreForTests(); resetAlertsForTests(); fetchMock.mockReset().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetchMock); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("Spend accounting for failed answers", () => {
  it("prices the usage reported before a failure as a lower bound that moves the daily estimate", () => {
    expect(recordGeneration("failed", 8_000, usage, "provider_timeout")).toBe(2.005);
    expect(recordGeneration("aborted", 8_000, { ...usage, inputTokens: 0, webSearchCalls: 0 }, "aborted")).toBe(0);
    expect(recordGeneration("failed", 100, undefined, "unknown")).toBeNull();
    expect(metricsSnapshot()).toMatchObject({ failed: 2, aborted: 1, estimatedModelUsd: 2.005, unpricedRequests: 3, unreportedUsage: 0, modelCalls: 4 });
    expect(spendTodayUsd()).toBe(2.005);
  });
  it("alerts when a configured cap cannot count a model answer, and stays quiet without a cap", () => {
    vi.stubEnv("ZARVIS_ALERT_WEBHOOK_URL", "https://hooks.example/abc");
    const unlisted = { ...usage, model: "custom-model", usageReported: true };
    expect(recordGeneration("completed", 5_000, { ...unlisted, provider: "openai", localLookups: 0 })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv("ZARVIS_DAILY_USD_CAP", "25");
    expect(recordGeneration("completed", 5_000, { ...unlisted, provider: "openai", localLookups: 0 })).toBeNull();
    expect(recordGeneration("completed", 5_000, { ...usage, provider: "xai", localLookups: 0 })).toBeNull();
    expect(recordGeneration("completed", 50, { ...usage, route: "local", modelCalls: 0, provider: "xai", localLookups: 1 })).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const message = JSON.parse(fetchMock.mock.calls[0][1].body).content;
    expect(message).toContain("model custom-model"); expect(message).not.toMatch(/\d{5,}/);
    expect(alertState().sent).toBe(1);
    expect(metricsSnapshot()).toMatchObject({ completed: 4, unpricedRequests: 3, unreportedUsage: 1, local: 1, model: 3 });
  });
});
