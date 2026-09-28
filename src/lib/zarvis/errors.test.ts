import { describe, expect, it } from "vitest";
import { APIConnectionError, APIConnectionTimeoutError, APIUserAbortError, BadRequestError, InternalServerError, RateLimitError } from "openai";
import { classifyError, ERROR_CLASSES, GenerationFailure } from "./errors";
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
  it("prefers the abort signal and keeps the class of a wrapped failure", () => {
    expect(classifyError(new Error("INCOMPLETE_RESPONSE"), true)).toBe("aborted");
    const failure = new GenerationFailure("tool_limit", { route: "model", model: "grok-4.7", modelCalls: 2, webSearchCalls: 1, inputTokens: 10, cachedInputTokens: 0, outputTokens: 5, usageReported: true });
    expect(classifyError(failure)).toBe("tool_limit"); expect(failure.usage?.modelCalls).toBe(2); expect(failure.message).toBe("tool_limit");
    const wrapped = new GenerationFailure("provider_http_5xx", undefined, new InternalServerError(503, undefined, "upstream", headers));
    expect(wrapped.message).toBe("503 upstream"); expect(wrapped.cause).toBeInstanceOf(InternalServerError); expect(classifyError(wrapped)).toBe("provider_http_5xx");
  });
});
