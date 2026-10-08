import "server-only";
import { zarvisConfig, type ProviderConfig } from "./config";
import type { AnswerPlan, ResponseDepth } from "./depth";
import type { ZarvisSession } from "./session";
import { noteFailover } from "./alerts";
import { GenerationFailure, classifyError, type ErrorClass } from "./errors";
import { completeDirect, modelAnswer, prepareAnswer, type Conversation, type GenerationMetrics, type Prepared } from "./engine";
import { createResponsesConversation } from "./responses";
import { createAnthropicConversation } from "./anthropic";
import type { ChatMessage, ZarvisEvent } from "./types";
export { streamable } from "./engine";
export type { GenerationMetrics } from "./engine";

export type GenerateOptions = { /** Canary/no-spend mode: throw MODEL_REQUIRED instead of calling the provider. */ localOnly?: boolean };
/** Provider-side failures that say nothing about the request itself: the fallback provider may answer instead. */
const FAILOVER_CLASSES: ErrorClass[] = ["provider_billing", "provider_http_429", "provider_http_5xx", "provider_connection", "provider_timeout"];
const conversation = (config: ProviderConfig, plan: AnswerPlan): Conversation => config.provider === "anthropic" ? createAnthropicConversation(config, plan) : createResponsesConversation(config, plan);
/** Before preparation the route is still local; afterwards it is model unless the local plan finishes the answer. */
const freshMetrics = (config: ProviderConfig, prepared?: Prepared): GenerationMetrics => ({
  route: prepared && !prepared.direct ? "model" : "local", provider: config.provider, model: config.model, modelCalls: 0, localLookups: prepared?.local.evidence.length ?? 0, webSearchCalls: 0, inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, usageReported: false,
  ...(prepared ? { depth: prepared.plan.depth, reasoningEffort: prepared.plan.effort } : {}),
});
/** Every failure leaves here as a GenerationFailure: a fixed class plus the usage billed so far, never a provider body. */
export async function generateAnswer(messages: ChatMessage[], signal: AbortSignal, emit: (event: ZarvisEvent) => void, priorSession: ZarvisSession = {}, depth: ResponseDepth = "auto", options: GenerateOptions = {}): Promise<GenerationMetrics> {
  const config = zarvisConfig();
  const started = Date.now();
  let metrics = freshMetrics(config);
  let streamed = false;
  const observed = (event: ZarvisEvent) => { streamed ||= event.type === "delta"; emit(event); };
  const wrap = (error: unknown) => error instanceof GenerationFailure ? error : new GenerationFailure(classifyError(error, signal.aborted), metrics, error);
  try {
    const prepared = await prepareAnswer(messages, signal, priorSession, depth);
    signal.throwIfAborted();
    metrics = freshMetrics(config, prepared);
    if (prepared.direct) { completeDirect(prepared, metrics, emit); return metrics; }
    if (options.localOnly) throw new GenerationFailure("model_required", metrics);
    try { return await modelAnswer(prepared, config, conversation(config, prepared.plan), metrics, started, signal, observed); }
    catch (error) {
      // Only a first model call that produced nothing visible can move: later rounds carry tool state, and streamed text would be contradicted.
      const failure = wrap(error);
      if (!config.fallback || streamed || metrics.modelCalls !== 1 || !FAILOVER_CLASSES.includes(failure.errorClass)) throw failure;
      noteFailover(config.providerLabel, config.fallback.providerLabel, failure.errorClass);
      metrics = freshMetrics(config.fallback, prepared);
      return await modelAnswer(prepared, config.fallback, conversation(config.fallback, prepared.plan), metrics, started, signal, observed);
    }
  } catch (error) { throw wrap(error); }
}
