/** Fixed failure classes for logs and metrics. Never a provider message, body or stack. */
export const ERROR_CLASSES = ["provider_timeout", "provider_connection", "provider_http_429", "provider_http_4xx", "provider_http_5xx", "provider_not_configured", "incomplete_response", "empty_response", "tool_limit", "public_read_timeout", "model_required", "deadline", "aborted", "unknown"] as const;
export type ErrorClass = typeof ERROR_CLASSES[number];
export type PartialUsage = { route: "local" | "model"; depth?: "quick" | "deep"; modelCalls: number; webSearchCalls: number; inputTokens: number; cachedInputTokens: number; outputTokens: number; groundingFallbacks?: number };
/** Thrown by the answer pipeline: a class plus the usage accumulated before the failure. The cause stays in memory for tests and debuggers; only the class is logged. */
export class GenerationFailure extends Error {
  constructor(readonly errorClass: ErrorClass, readonly usage?: PartialUsage, cause?: unknown) { super(cause instanceof Error ? cause.message : errorClass, cause === undefined ? undefined : { cause }); this.name = "GenerationFailure"; }
}
const byMessage: Record<string, ErrorClass> = { INCOMPLETE_RESPONSE: "incomplete_response", EMPTY_RESPONSE: "empty_response", TOOL_LIMIT: "tool_limit", PROVIDER_NOT_CONFIGURED: "provider_not_configured", PUBLIC_READ_TIMEOUT: "public_read_timeout", REQUEST_ABORTED: "aborted", MODEL_REQUIRED: "model_required" };
export function classifyError(error: unknown, aborted = false): ErrorClass {
  if (aborted) return "aborted";
  if (error instanceof GenerationFailure) return error.errorClass;
  if (!(error instanceof Error)) return "unknown";
  const kind = error.constructor?.name ?? "";
  if (error.name === "AbortError" || kind === "APIUserAbortError") return "aborted";
  if (kind === "APIConnectionTimeoutError" || (kind === "APIConnectionError" && /timed out/i.test(error.message))) return "provider_timeout";
  if (kind === "APIConnectionError") return "provider_connection";
  const status = (error as { status?: unknown }).status;
  if (typeof status === "number") return status === 429 ? "provider_http_429" : status >= 500 ? "provider_http_5xx" : status >= 400 ? "provider_http_4xx" : "unknown";
  return byMessage[error.message] ?? "unknown";
}
