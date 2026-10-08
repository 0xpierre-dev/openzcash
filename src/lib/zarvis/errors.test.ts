import { describe, expect, it } from "vitest";
import { APIConnectionError, APIConnectionTimeoutError, APIUserAbortError, BadRequestError, InternalServerError, RateLimitError } from "openai";
import * as Anthropic from "@anthropic-ai/sdk";
import { classifyError, ERROR_CLASSES, GenerationFailure } from "./errors";
const body = (type: string, message: string, details?: Record<string, string>) => ({ type: "error", error: { type, message, ...(details ? { details } : {}) } });
const headers = new Headers({ "x-request-id": "req_sentinel" });
/** A bundler that mangles class names must not turn SDK errors into `unknown`. */
class Mangled extends APIConnectionTimeoutError {}
Object.defineProperty(Mangled, "name", { value: "a" });
class LocalTimeout extends Error {}
Object.defineProperty(LocalTimeout, "name", { value: "APIConnectionTimeoutError" });
describe("Failure classification", () => {
  it.each([
    [new APIConnectionTimeoutError(), "provider_timeout"],
    [new Mangled(), "provider_timeout"],
    [new LocalTimeout("Request timed out."), "provider_timeout"],
    [new APIConnectionError({ message: "Request timed out.", cause: new Error("ETIMEDOUT") }), "provider_timeout"],
    [new APIConnectionError({ message: undefined, cause: new Error("ECONNRESET") }), "provider_connection"],
    [new APIUserAbortError(), "aborted"],
    [new RateLimitError(429, { message: "provider-secret-sentinel body" }, undefined, headers), "provider_http_429"],
    [new InternalServerError(503, undefined, "upstream", headers), "provider_http_5xx"],
    [new BadRequestError(400, undefined, "bad", headers), "provider_http_4xx"],
    [Object.assign(new Error("503 provider body"), { status: 503 }), "provider_http_5xx"],
    [new Error("INCOMPLETE_RESPONSE"), "incomplete_response"],
    [new Error("EMPTY_RESPONSE"), "empty_response"],
    [new Error("TOOL_LIMIT"), "tool_limit"],
    [new Error("PROVIDER_NOT_CONFIGURED"), "provider_not_configured"],
    [new Error("PUBLIC_READ_TIMEOUT"), "public_read_timeout"],
    [new Error("REQUEST_ABORTED"), "aborted"],
    [Object.assign(new Error("The operation was aborted"), { name: "AbortError" }), "aborted"],
    [new Error("some provider text with a key sk-secret"), "unknown"],
    ["not an error", "unknown"],
  ])("maps %o to a fixed class", (error, expected) => {
    const result = classifyError(error);
    expect(result).toBe(expected); expect(ERROR_CLASSES).toContain(result);
    expect(JSON.stringify(result)).not.toMatch(/secret|sentinel/);
  });
  it.each([
    [new Anthropic.RateLimitError(429, body("rate_limit_error", "provider-secret-sentinel body"), "sentinel", headers, "rate_limit_error"), "provider_http_429"],
    [new Anthropic.InternalServerError(529, body("overloaded_error", "Overloaded"), "Overloaded", headers, "overloaded_error"), "provider_http_5xx"],
    [new Anthropic.InternalServerError(500, body("api_error", "sentinel"), "sentinel", headers, "api_error"), "provider_http_5xx"],
    [new Anthropic.APIConnectionTimeoutError(), "provider_timeout"],
    [new Anthropic.APIConnectionError({ message: "fetch failed", cause: new Error("ECONNRESET") }), "provider_connection"],
    [new Anthropic.APIUserAbortError(), "aborted"],
    [new Anthropic.BadRequestError(400, body("invalid_request_error", "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."), "credit", headers, "invalid_request_error"), "provider_billing"],
    [new Anthropic.BadRequestError(400, body("invalid_request_error", "You have reached your specified API usage limits. You will regain access on 2026-11-01 at 00:00 UTC."), "limit", headers, "invalid_request_error"), "provider_billing"],
    [new Anthropic.RateLimitError(429, body("rate_limit_error", "You have reached your API usage limits: sentinel", { error_code: "enforced_spend_limit_reached" }), "limit", headers, "rate_limit_error"), "provider_billing"],
    [new Anthropic.BadRequestError(400, body("invalid_request_error", "messages: roles must alternate sentinel"), "bad", headers, "invalid_request_error"), "provider_http_4xx"],
    [new Anthropic.AuthenticationError(401, body("authentication_error", "invalid x-api-key"), "auth", headers, "authentication_error"), "provider_http_4xx"],
    // Mid-stream SSE errors carry no HTTP status, only the body's error type.
    [new Anthropic.APIError(undefined, body("overloaded_error", "Overloaded"), undefined, headers, "overloaded_error"), "provider_http_5xx"],
    [new Anthropic.APIError(undefined, body("api_error", "sentinel"), undefined, headers, "api_error"), "provider_http_5xx"],
    [new Anthropic.APIError(undefined, body("rate_limit_error", "sentinel"), undefined, headers, "rate_limit_error"), "provider_http_429"],
    [new Anthropic.APIError(undefined, body("invalid_request_error", "sentinel"), undefined, headers, "invalid_request_error"), "provider_http_4xx"],
  ])("maps Anthropic SDK error %o to a fixed class", (error, expected) => {
    const result = classifyError(error);
    expect(result).toBe(expected); expect(ERROR_CLASSES).toContain(result);
    expect(JSON.stringify(result)).not.toMatch(/secret|sentinel/);
  });
  it("lists the billing class and never derives it from an OpenAI 400", () => {
    expect(ERROR_CLASSES).toContain("provider_billing");
    expect(classifyError(new BadRequestError(400, { message: "Your credit balance is too low" }, "bad", headers))).toBe("provider_http_4xx");
  });
  it("prefers the abort signal and keeps the class of a wrapped failure", () => {
    expect(classifyError(new Error("INCOMPLETE_RESPONSE"), true)).toBe("aborted");
    const failure = new GenerationFailure("tool_limit", { route: "model", model: "grok-4.7", modelCalls: 2, webSearchCalls: 1, inputTokens: 10, cachedInputTokens: 0, outputTokens: 5, usageReported: true });
    expect(classifyError(failure)).toBe("tool_limit"); expect(failure.usage?.modelCalls).toBe(2); expect(failure.message).toBe("tool_limit");
    const wrapped = new GenerationFailure("provider_http_5xx", undefined, new InternalServerError(503, undefined, "upstream", headers));
    expect(wrapped.message).toBe("503 upstream"); expect(wrapped.cause).toBeInstanceOf(InternalServerError); expect(classifyError(wrapped)).toBe("provider_http_5xx");
  });
});
