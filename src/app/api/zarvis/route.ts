import { answerPlan } from "@/lib/zarvis/depth";
import { zarvisConfig } from "@/lib/zarvis/config";
import { readChatRequest, sameOrigin } from "@/lib/zarvis/validation";
import { reserveZarvisRequest } from "@/lib/zarvis/usage";
import { generateAnswer } from "@/lib/zarvis/openai";
import { acquireGeneration, recordGeneration, recordRejection, feedbackTicket } from "@/lib/zarvis/metrics";
import { GenerationFailure, classifyError, type ErrorClass } from "@/lib/zarvis/errors";
import { logChatRequest, rejectionEntry, type ChatOutcome } from "@/lib/zarvis/observe";
import { secondsUntilUtcMidnight, spendTodayUsd } from "@/lib/zarvis/metrics-store";
import type { ZarvisEvent } from "@/lib/zarvis/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const fail = (error: string, status: number, extra = {}) => Response.json({ error }, { status, headers: { ...headers, ...extra } });
const USAGE_LIMIT = "Zarvis has reached a usage limit. Please try again later; the public sources remain available.";

export function GET() {
  const config = zarvisConfig();
  return Response.json({ available: config.enabled, provider: config.providerLabel, webSearch: config.webSearch }, { headers });
}

export async function POST(request: Request) {
  const started = performance.now();
  const reject = (outcome: ChatOutcome, error: string, status: number, extra = {}) => { logChatRequest(rejectionEntry(outcome, performance.now() - started)); return fail(error, status, extra); };
  if (!sameOrigin(request)) { recordRejection("forbidden"); return reject("forbidden", "Please open Zarvis on OpenZcash to ask a question.", 403); }
  const config = zarvisConfig();
  if (!config.enabled) return reject("disabled", "Zarvis is being connected. Please explore the sources or try again later.", 503);
  let input;
  try { input = await readChatRequest(request); }
  catch { recordRejection("invalid"); return reject("invalid", "Send a question of up to 2,000 characters. Start a new chat if this conversation is too long.", 400); }
  // The estimated-spend ceiling applies before any reservation, including during a quota pause.
  if (typeof config.dailyUsdCap === "number" && spendTodayUsd() >= config.dailyUsdCap) { recordRejection("spendCap"); return reject("spend_cap", USAGE_LIMIT, 429, { "Retry-After": String(secondsUntilUtcMidnight()) }); }
  const release = acquireGeneration();
  if (!release) return reject("busy", "Zarvis is busy. Please try again shortly.", 429, { "Retry-After": "5" });
  try {
    const allowance = await reserveZarvisRequest(request.headers);
    if (!allowance.allowed) { release(); recordRejection("quota"); return reject("quota", USAGE_LIMIT, 429, { "Retry-After": String(allowance.retryAfter) }); }
  } catch { release(); recordRejection("storage"); return reject("storage", "Zarvis is temporarily unavailable. Please try again shortly.", 503); }
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) controller.abort();
  const plan = answerPlan(input.messages, input.depth);
  const timeout = setTimeout(abort, plan.timeoutMs);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(out) {
      const emit = (event: ZarvisEvent) => { if (!controller.signal.aborted) out.enqueue(encoder.encode(`${JSON.stringify(event.type === "done" ? { ...event, feedbackToken: feedbackTicket(Date.now(), event.route) } : event)}\n`)); };
      try {
        emit({ type: "status", message: "Finding the right sources…" });
        const metrics = await generateAnswer(input.messages, controller.signal, emit, input.session, input.depth);
        const ms = performance.now() - started;
        const estimatedUsd = recordGeneration("completed", ms, metrics);
        logChatRequest({ at: new Date().toISOString(), route: metrics.route, outcome: "completed", depth: metrics.depth ?? plan.depth, ms: Math.round(ms), modelCalls: metrics.modelCalls, webSearchCalls: metrics.webSearchCalls, inputTokens: metrics.inputTokens, cachedInputTokens: metrics.cachedInputTokens, outputTokens: metrics.outputTokens, groundingFallbacks: metrics.groundingFallbacks ?? 0, estimatedUsd, errorClass: null });
      } catch (error) {
        const ms = performance.now() - started;
        const outcome = request.signal.aborted ? "aborted" : "failed";
        // A fixed class only: the provider message, body and stack never reach the log or the client.
        const errorClass: ErrorClass = request.signal.aborted ? "aborted" : controller.signal.aborted ? "deadline" : classifyError(error);
        const usage = error instanceof GenerationFailure ? error.usage : undefined;
        recordGeneration(outcome, ms, usage, errorClass);
        logChatRequest({ at: new Date().toISOString(), route: usage?.route ?? "model", outcome, depth: usage?.depth ?? plan.depth, ms: Math.round(ms), modelCalls: usage?.modelCalls ?? 0, webSearchCalls: usage?.webSearchCalls ?? 0, inputTokens: usage?.inputTokens ?? 0, cachedInputTokens: usage?.cachedInputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0, groundingFallbacks: usage?.groundingFallbacks ?? 0, estimatedUsd: null, errorClass });
        if (!request.signal.aborted) {
          try { out.enqueue(encoder.encode(`${JSON.stringify({ type: "error", message: controller.signal.aborted ? (plan.depth === "deep" ? "This analysis reached its time limit. Try a narrower question." : "This answer reached its time limit. Try a narrower question or choose Deep analysis.") : "Zarvis could not finish this answer. Please retry in a moment." })}\n`)); } catch { /* disconnected */ }
        }
      } finally {
        release();
        clearTimeout(timeout); request.signal.removeEventListener("abort", abort);
        try { out.close(); } catch { /* client already disconnected */ }
      }
    },
    cancel() { controller.abort(); release(); clearTimeout(timeout); request.signal.removeEventListener("abort", abort); },
  });
  return new Response(stream, { headers: { ...headers, "Content-Type": "application/x-ndjson; charset=utf-8", "X-Accel-Buffering": "no" } });
}
