import type { ErrorClass } from "./errors";
import type { DirectLanguage } from "./language";
import type { Topic } from "./topics";
export type ChatOutcome = "completed" | "failed" | "aborted" | "quota" | "busy" | "spend_cap" | "storage" | "forbidden" | "invalid" | "disabled";
export type ChatLogEntry = { at: string; route: "local" | "model" | "rejected"; outcome: ChatOutcome; depth: "quick" | "deep" | null; ms: number; modelCalls: number; webSearchCalls: number; webFetchCalls: number; inputTokens: number; cachedInputTokens: number; outputTokens: number; groundingFallbacks: number; repairRounds: number; estimatedUsd: number | null; errorClass: ErrorClass | null; topic: Topic | null; lang: DirectLanguage | null };
export const REJECTION_LOG_WINDOW_MS = 10_000;
type ObserveState = { rejections: Map<ChatOutcome, { count: number; ms: number }>; timer: ReturnType<typeof setTimeout> | null };
const globalState = globalThis as typeof globalThis & { __zarvisObserveV1?: ObserveState };
const state: ObserveState = globalState.__zarvisObserveV1 ??= { rejections: new Map(), timer: null };
/** One single-line JSON record per chat request: counts, labels, durations and money only. Never questions, answers, prompts, IPs or identifiers; `topic` is one label from the fixed taxonomy in topics.ts and `lang` the answer language, both null for a request that never reached generation. */
export function logChatRequest(entry: ChatLogEntry) { console.info(JSON.stringify({ event: "zarvis.chat", ...entry })); }
export const rejectionEntry = (outcome: ChatOutcome, ms: number, at = new Date()): ChatLogEntry => ({ at: at.toISOString(), route: "rejected", outcome, depth: null, ms: Math.round(ms), modelCalls: 0, webSearchCalls: 0, webFetchCalls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, groundingFallbacks: 0, repairRounds: 0, estimatedUsd: null, errorClass: null, topic: null, lang: null });
/** The first rejection per outcome in a ten-second window is logged in full; the rest fold into one `zarvis.rejections` summary, so a flood cannot crowd the answer lines out of the hosting log. */
export function logRejection(outcome: ChatOutcome, ms: number, now = Date.now()) {
  const pending = state.rejections.get(outcome);
  if (pending) { pending.count++; pending.ms += ms; return; }
  state.rejections.set(outcome, { count: 0, ms: 0 });
  logChatRequest(rejectionEntry(outcome, ms, new Date(now)));
  if (!state.timer) { state.timer = setTimeout(flushRejectionLog, REJECTION_LOG_WINDOW_MS); state.timer.unref?.(); }
}
export function flushRejectionLog(now = Date.now()) {
  if (state.timer) { clearTimeout(state.timer); state.timer = null; }
  for (const [outcome, { count, ms }] of state.rejections) if (count) console.info(JSON.stringify({ event: "zarvis.rejections", at: new Date(now).toISOString(), outcome, count, windowMs: REJECTION_LOG_WINDOW_MS, avgMs: Math.round(ms / count) }));
  state.rejections.clear();
}
export function resetObserveForTests() { if (state.timer) clearTimeout(state.timer); state.timer = null; state.rejections.clear(); }
