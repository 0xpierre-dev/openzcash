import { describe, expect, it } from "vitest";
import { classifyError, ERROR_CLASSES, GenerationFailure } from "./errors";
class APIConnectionTimeoutError extends Error {}
class APIConnectionError extends Error {}
class APIUserAbortError extends Error {}
class RateLimitError extends Error { status = 429; error = { message: "provider-secret-sentinel body" }; }
class InternalServerError extends Error { status = 503; }
class BadRequestError extends Error { status = 400; }
describe("Failure classification", () => {
  it.each([
    [new APIConnectionTimeoutError("Request timed out."), "provider_timeout"],
    [new APIConnectionError("Connection error."), "provider_connection"],
    [new APIUserAbortError("Request was aborted."), "aborted"],
    [new RateLimitError("429 provider-secret-sentinel"), "provider_http_429"],
    [new InternalServerError("503 upstream"), "provider_http_5xx"],
    [new BadRequestError("400 bad"), "provider_http_4xx"],
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
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("prefers the abort signal and keeps the class of a wrapped failure", () => {
    expect(classifyError(new Error("INCOMPLETE_RESPONSE"), true)).toBe("aborted");
    const failure = new GenerationFailure("tool_limit", { route: "model", modelCalls: 2, webSearchCalls: 1, inputTokens: 10, cachedInputTokens: 0, outputTokens: 5 });
    expect(classifyError(failure)).toBe("tool_limit"); expect(failure.usage?.modelCalls).toBe(2); expect(failure.message).toBe("tool_limit");
    const wrapped = new GenerationFailure("provider_http_5xx", undefined, new InternalServerError("503 upstream"));
    expect(wrapped.message).toBe("503 upstream"); expect(wrapped.cause).toBeInstanceOf(InternalServerError); expect(classifyError(wrapped)).toBe("provider_http_5xx");
  });
});
