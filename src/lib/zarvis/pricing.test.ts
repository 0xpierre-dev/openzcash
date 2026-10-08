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
  it("prices the Claude models, with cache writes at the write rate and absent write counts as zero", () => {
    expect(MODEL_RATES["claude-sonnet-5-5"]).toEqual({ inputUsdPerMillion: 2, cachedInputUsdPerMillion: 0.1, cacheWriteUsdPerMillion: 2.5, outputUsdPerMillion: 10, webSearchUsdPerCall: 0.01 });
    expect(MODEL_RATES["claude-haiku-5-5"]).toEqual({ inputUsdPerMillion: 0.1, cachedInputUsdPerMillion: 0.01, cacheWriteUsdPerMillion: 0.125, outputUsdPerMillion: 0.5, webSearchUsdPerCall: 0.01 });
    expect(MODEL_RATES["claude-opus-5-5"]).toEqual({ inputUsdPerMillion: 4, cachedInputUsdPerMillion: 0.2, cacheWriteUsdPerMillion: 5, outputUsdPerMillion: 20, webSearchUsdPerCall: 0.01 });
    expect(MODEL_RATES["claude-haiku-4-5"]).toEqual({ inputUsdPerMillion: 1, cachedInputUsdPerMillion: 0.1, cacheWriteUsdPerMillion: 1.25, outputUsdPerMillion: 5, webSearchUsdPerCall: 0.01 });
    // 4,000 plain * $2 + 4,000 cached * $0.10 + 2,000 written * $2.50 + 1,000 output * $10, per million, plus one search.
    expect(estimateUsageUsd({ ...usage, model: "claude-sonnet-5-5", cacheWriteTokens: 2_000 })).toBeCloseTo((4_000 * 2 + 4_000 * 0.1 + 2_000 * 2.5 + 1_000 * 10) / 1e6 + 0.01, 9);
    expect(estimateUsageUsd({ ...usage, model: "claude-sonnet-5-5" })).toBeCloseTo((6_000 * 2 + 4_000 * 0.1 + 1_000 * 10) / 1e6 + 0.01, 9);
    expect(estimateUsageUsd({ ...usage, cacheWriteTokens: 0 })).toBe(estimateUsageUsd(usage));
    expect(estimateUsageUsd({ ...usage, cacheWriteTokens: 10 })).toBeNull();
    vi.stubEnv("ZARVIS_CACHE_WRITE_USD_PER_MILLION", "3");
    expect(modelRates("grok-4.7").cacheWriteUsdPerMillion).toBe(3);
    expect(estimateUsageUsd({ ...usage, cacheWriteTokens: 1_000 })).toBeCloseTo((5_000 * 2 + 4_000 * 0.5 + 1_000 * 3 + 1_000 * 6) / 1e6 + 0.005, 9);
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
