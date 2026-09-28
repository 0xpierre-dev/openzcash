import { afterEach, describe, expect, it, vi } from "vitest";
import { dailyUsdCap, estimateUsageUsd, modelRates, MODEL_RATES } from "./pricing";
afterEach(() => vi.unstubAllEnvs());
const usage = { model: "grok-4.7", modelCalls: 2, usageReported: true, webSearchCalls: 1, inputTokens: 10_000, cachedInputTokens: 4_000, outputTokens: 1_000 };
describe("Model pricing", () => {
  it("prices the documented models without any environment variable", () => {
    expect(MODEL_RATES["grok-4.7"]).toEqual({ inputUsdPerMillion: 2, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 6, webSearchUsdPerCall: 0.005 });
    // 6,000 uncached * $2 + 4,000 cached * $0.50 + 1,000 output * $6, per million, plus one search.
    expect(estimateUsageUsd(usage)).toBeCloseTo((6_000 * 2 + 4_000 * 0.5 + 1_000 * 6) / 1e6 + 0.005, 9);
    expect(estimateUsageUsd({ ...usage, model: "GPT-5-mini " })).toBeCloseTo((6_000 * 0.25 + 4_000 * 0.025 + 1_000 * 2) / 1e6 + 0.01, 9);
    expect(estimateUsageUsd({ ...usage, model: "gpt-6-astra" })).toBeCloseTo((6_000 * 10 + 4_000 * 1 + 1_000 * 50) / 1e6 + 0.01, 9);
  });
  it("returns unknown, never zero, for an unlisted model or unreported usage, and zero for local answers", () => {
    expect(estimateUsageUsd({ ...usage, model: "future-model" })).toBeNull();
    expect(estimateUsageUsd({ ...usage, usageReported: false })).toBeNull();
    expect(estimateUsageUsd({ ...usage, modelCalls: 0 })).toBe(0);
  });
  it("lets environment rates override individual table fields", () => {
    vi.stubEnv("ZARVIS_OUTPUT_USD_PER_MILLION", "60"); vi.stubEnv("ZARVIS_SEARCH_USD_PER_CALL", "");
    expect(modelRates("grok-4.7")).toEqual({ inputUsdPerMillion: 2, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 60, webSearchUsdPerCall: 0.005 });
    vi.stubEnv("ZARVIS_INPUT_USD_PER_MILLION", "5"); vi.stubEnv("ZARVIS_CACHED_INPUT_USD_PER_MILLION", "1"); vi.stubEnv("ZARVIS_OUTPUT_USD_PER_MILLION", "20"); vi.stubEnv("ZARVIS_SEARCH_USD_PER_CALL", "0.1");
    expect(modelRates("future-model")).toEqual({ inputUsdPerMillion: 5, cachedInputUsdPerMillion: 1, outputUsdPerMillion: 20, webSearchUsdPerCall: 0.1 });
    vi.stubEnv("ZARVIS_INPUT_USD_PER_MILLION", "not-a-number");
    expect(modelRates("future-model").inputUsdPerMillion).toBeUndefined();
  });
  it("parses the optional daily spend ceiling strictly", () => {
    expect(dailyUsdCap()).toBeNull();
    vi.stubEnv("ZARVIS_DAILY_USD_CAP", "25"); expect(dailyUsdCap()).toBe(25);
    for (const raw of ["0", "-1", "abc", " "]) { vi.stubEnv("ZARVIS_DAILY_USD_CAP", raw); expect(dailyUsdCap()).toBeNull(); }
  });
});
