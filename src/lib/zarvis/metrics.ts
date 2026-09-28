import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { GenerationMetrics } from "./openai";
import type { ErrorClass, PartialUsage } from "./errors";
import { dailyUsdCap, estimateUsageUsd } from "./pricing";
import { LATENCY_BOUNDS_MS, latencyBucket, percentile, queueDaily, storeState, type DailyDelta } from "./metrics-store";
import { noteOutcome, noteRejection, noteUnpriced } from "./alerts";
export { estimateUsageUsd } from "./pricing";

export const REJECTIONS = ["quota", "busy", "spendCap", "storage", "forbidden", "invalid"] as const;
export type Rejection = typeof REJECTIONS[number];
const empty = () => ({ since: new Date().toISOString(), completed: 0, failed: 0, aborted: 0, busy: 0, quota: 0, spendCap: 0, storage: 0, forbidden: 0, invalid: 0, local: 0, model: 0, modelCalls: 0, webSearchCalls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, unreportedUsage: 0, groundingFallbacks: 0, estimatedModelUsd: 0, unpricedRequests: 0, helpful: 0, unhelpful: 0, latency: LATENCY_BOUNDS_MS.map(() => 0) });
type MetricsState = { totals: ReturnType<typeof empty>; active: number; lastLog: number; usedFeedback: Map<string, number>; localKey: Buffer };
const globalState = globalThis as typeof globalThis & { __zarvisMetricsV1?: MetricsState };
const state = globalState.__zarvisMetricsV1 ??= { totals: empty(), active: 0, lastLog: Date.now(), usedFeedback: new Map(), localKey: randomBytes(32) };
const feedbackKey = () => process.env.OPENAI_API_KEY || process.env.XAI_API_KEY || state.localKey;
const mac = (payload: string) => createHmac("sha256", feedbackKey()).update(`zarvis-feedback:${payload}`).digest();
/** The ticket carries only a nonce, an expiry and the answer route (local/model) so votes can be attributed per route. */
export function feedbackTicket(now = Date.now(), route?: "local" | "model") {
  const payload = Buffer.from(JSON.stringify({ nonce: randomBytes(12).toString("hex"), expires: now + 3600000, ...(route ? { route } : {}) })).toString("base64url");
  return `${payload}.${mac(payload).toString("base64url")}`;
}
export function recordFeedback(ticket: string, helpful: boolean, now = Date.now()) {
  try {
    if (ticket.length > 400) return false;
    const parts = ticket.split("."); if (parts.length !== 2) return false;
    const signature = Buffer.from(parts[1], "base64url"), expected = mac(parts[0]);
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return false;
    const data = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    if (!/^[a-f0-9]{24}$/.test(data.nonce) || !Number.isSafeInteger(data.expires) || data.expires <= now || data.expires > now + 3600000) return false;
    for (const [nonce, expiry] of state.usedFeedback) if (expiry <= now) state.usedFeedback.delete(nonce);
    if (state.usedFeedback.has(data.nonce) || state.usedFeedback.size >= 10000) return false;
    state.usedFeedback.set(data.nonce, data.expires);
    if (helpful) state.totals.helpful++; else state.totals.unhelpful++;
    if (data.route === "local" || data.route === "model") queueDaily(data.route, helpful ? { helpful: 1 } : { unhelpful: 1 }, now);
    flushMetrics(); return true;
  } catch { return false; }
}
/** Pre-generation rejections: counted in process and, for capacity/quota/spend decisions, in the daily table and alert window. */
export function recordRejection(kind: Rejection, now = Date.now()) {
  state.totals[kind]++;
  if (kind === "quota" || kind === "busy" || kind === "spendCap") { queueDaily("rejected", { [kind]: 1 }, now); noteRejection(kind === "spendCap" ? "spend_cap" : kind, now); }
  flushMetrics();
}
export function acquireGeneration() {
  const configured = Number(process.env.ZARVIS_MAX_CONCURRENT ?? 8);
  const max = Number.isInteger(configured) && configured > 0 ? Math.min(configured, 32) : 8;
  if (state.active >= max) { recordRejection("busy"); return null; }
  state.active++; let released = false;
  return () => { if (!released) { state.active--; released = true; } };
}
/**
 * Records an outcome. A completed answer is priced exactly; a failed/aborted one is priced from the usage reported before the failure,
 * a lower bound that still moves the spend cap (the request stays counted as unpriced). Returns the estimate, or null when nothing could be priced.
 */
export function recordGeneration(outcome: "completed" | "failed" | "aborted", ms: number, metrics?: GenerationMetrics | PartialUsage, errorClass?: ErrorClass | null): number | null {
  state.totals[outcome]++;
  const delta: DailyDelta = { [outcome]: 1 };
  let estimated: number | null = null;
  if (outcome !== "completed") { state.totals.unpricedRequests++; delta.unpricedRequests = 1; }
  else { state.totals.latency[latencyBucket(ms)]++; delta.latencyMs = ms; }
  if (metrics) {
    if (outcome === "completed") state.totals[metrics.route]++;
    for (const key of ["modelCalls", "webSearchCalls", "inputTokens", "cachedInputTokens", "outputTokens"] as const) { state.totals[key] += metrics[key]; delta[key] = metrics[key]; }
    state.totals.groundingFallbacks += metrics.groundingFallbacks ?? 0; delta.groundingFallbacks = metrics.groundingFallbacks ?? 0;
    estimated = outcome === "completed" ? estimateUsageUsd(metrics) : estimateUsageUsd({ ...metrics, usageReported: true });
    if (estimated === null) {
      if (outcome === "completed") { state.totals.unpricedRequests++; delta.unpricedRequests = 1; }
      if (metrics.modelCalls && dailyUsdCap() !== null) noteUnpriced(metrics.model);
    } else { state.totals.estimatedModelUsd += estimated; delta.estimatedUsd = estimated; }
    if (outcome === "completed" && metrics.modelCalls && !metrics.usageReported) state.totals.unreportedUsage++;
  }
  queueDaily(metrics?.route ?? "model", delta);
  noteOutcome(outcome, errorClass);
  flushMetrics();
  return estimated;
}
export function metricsSnapshot() {
  return { ...state.totals, latency: [...state.totals.latency], active: state.active, scope: "this server process since restart", latencyBucketBoundsMs: LATENCY_BOUNDS_MS.map((b) => Number.isFinite(b) ? b : null), p50BucketUpperMs: percentile(state.totals.latency, 0.5), p95BucketUpperMs: percentile(state.totals.latency, 0.95), store: storeState(), note: "Counts only; no prompts, replies, raw IPs or visitor identifiers. Tokens and estimatedModelUsd include usage reported before a failure; failed/aborted provider calls may still be billed beyond what is reported. Feedback is deduplicated per process for one hour." };
}
function flushMetrics() {
  if (process.env.ZARVIS_AGGREGATE_METRICS !== "true" || Date.now() - state.lastLog < 60000) return;
  state.lastLog = Date.now();
  console.info("Zarvis aggregate metrics", JSON.stringify(metricsSnapshot()));
}
export function resetMetricsForTests() { state.totals = empty(); state.active = 0; state.usedFeedback.clear(); }
