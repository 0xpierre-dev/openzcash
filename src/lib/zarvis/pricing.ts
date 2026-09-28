export type ModelRates = { inputUsdPerMillion: number; cachedInputUsdPerMillion: number; outputUsdPerMillion: number; webSearchUsdPerCall: number };
/**
 * Public list prices (standard tier, prompts under the long-context threshold), checked 2026-09-28.
 * Sources and dates are recorded in docs/zarvis.md; ZARVIS_*_USD_PER_MILLION / ZARVIS_SEARCH_USD_PER_CALL override each field.
 */
export const MODEL_RATES: Record<string, ModelRates> = {
  "grok-4.7": { inputUsdPerMillion: 2, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 6, webSearchUsdPerCall: 0.005 },
  "grok-4.6": { inputUsdPerMillion: 2, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 6, webSearchUsdPerCall: 0.005 },
  "gpt-5-mini": { inputUsdPerMillion: 0.25, cachedInputUsdPerMillion: 0.025, outputUsdPerMillion: 2, webSearchUsdPerCall: 0.01 },
  "gpt-5": { inputUsdPerMillion: 1.25, cachedInputUsdPerMillion: 0.125, outputUsdPerMillion: 10, webSearchUsdPerCall: 0.01 },
  "gpt-6-astra": { inputUsdPerMillion: 10, cachedInputUsdPerMillion: 1, outputUsdPerMillion: 50, webSearchUsdPerCall: 0.01 },
};
const overrides: Record<keyof ModelRates, string> = { inputUsdPerMillion: "ZARVIS_INPUT_USD_PER_MILLION", cachedInputUsdPerMillion: "ZARVIS_CACHED_INPUT_USD_PER_MILLION", outputUsdPerMillion: "ZARVIS_OUTPUT_USD_PER_MILLION", webSearchUsdPerCall: "ZARVIS_SEARCH_USD_PER_CALL" };
function envRate(name: string): number | null {
  const raw = process.env[name]; if (raw === undefined || raw.trim() === "") return null;
  const value = Number(raw); return Number.isFinite(value) && value >= 0 && value <= 1e6 ? value : null;
}
/** Table rates for the model with per-field environment overrides; a missing field means unknown cost, never free. */
export function modelRates(model: string): Partial<ModelRates> {
  const table = MODEL_RATES[model.trim().toLowerCase()];
  const rates: Partial<ModelRates> = {};
  for (const field of Object.keys(overrides) as Array<keyof ModelRates>) {
    const value = envRate(overrides[field]) ?? table?.[field];
    if (value !== undefined) rates[field] = value;
  }
  return rates;
}
export type UsageForPricing = { model: string; modelCalls: number; usageReported: boolean; webSearchCalls: number; inputTokens: number; cachedInputTokens: number; outputTokens: number };
export function estimateUsageUsd(metrics: UsageForPricing): number | null {
  if (!metrics.modelCalls) return 0;
  if (!metrics.usageReported) return null;
  const { inputUsdPerMillion: input, cachedInputUsdPerMillion: cached, outputUsdPerMillion: output, webSearchUsdPerCall: search } = modelRates(metrics.model);
  if (input === undefined || output === undefined || (metrics.cachedInputTokens > 0 && cached === undefined) || (metrics.webSearchCalls > 0 && search === undefined)) return null;
  return ((metrics.inputTokens - metrics.cachedInputTokens) * input + metrics.cachedInputTokens * (cached ?? 0) + metrics.outputTokens * output) / 1e6 + metrics.webSearchCalls * (search ?? 0);
}
/** Optional application-level daily estimated-spend ceiling in USD; unset or invalid means no ceiling. */
export function dailyUsdCap(): number | null {
  const raw = process.env.ZARVIS_DAILY_USD_CAP?.trim(); if (!raw) return null;
  const value = Number(raw); return Number.isFinite(value) && value > 0 ? value : null;
}
