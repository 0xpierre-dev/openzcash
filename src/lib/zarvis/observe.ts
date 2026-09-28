import type { ErrorClass } from "./errors";
export type ChatOutcome = "completed" | "failed" | "aborted" | "quota" | "busy" | "spend_cap" | "storage" | "forbidden" | "invalid" | "disabled";
export type ChatLogEntry = { at: string; route: "local" | "model" | "rejected"; outcome: ChatOutcome; depth: "quick" | "deep" | null; ms: number; modelCalls: number; webSearchCalls: number; inputTokens: number; cachedInputTokens: number; outputTokens: number; groundingFallbacks: number; estimatedUsd: number | null; errorClass: ErrorClass | null };
/** One single-line JSON record per chat request: counts, labels, durations and money only. Never questions, answers, prompts, IPs or identifiers. */
export function logChatRequest(entry: ChatLogEntry) { console.info(JSON.stringify({ event: "zarvis.chat", ...entry })); }
export const rejectionEntry = (outcome: ChatOutcome, ms: number, at = new Date()): ChatLogEntry => ({ at: at.toISOString(), route: "rejected", outcome, depth: null, ms: Math.round(ms), modelCalls: 0, webSearchCalls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, groundingFallbacks: 0, estimatedUsd: null, errorClass: null });
