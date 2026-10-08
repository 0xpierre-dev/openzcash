import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ stream: vi.fn(), create: vi.fn(), prepare: vi.fn(), config: vi.fn(), lookup: vi.fn() }));
vi.mock("@anthropic-ai/sdk", async (original) => ({ ...await original<object>(), default: class { messages = { stream: mocks.stream }; } }));
vi.mock("openai", async (original) => ({ ...await original<object>(), default: class { responses = { create: mocks.create }; } }));
vi.mock("./config", () => ({ zarvisConfig: mocks.config }));
vi.mock("./local", async (original) => ({ ...await original<object>(), prepareLocal: mocks.prepare }));
vi.mock("./data", async (original) => ({ ...await original<object>(), lookupPublicData: mocks.lookup }));
import { APIConnectionError, APIConnectionTimeoutError, BadRequestError, InternalServerError, RateLimitError } from "@anthropic-ai/sdk";
import { InternalServerError as OpenAIServerError } from "openai";
import { resetAlertsForTests } from "./alerts";
import { generateAnswer } from "./openai";
import type { ZarvisEvent } from "./types";

const headers = new Headers({ "request-id": "req_sentinel" });
const body = (type: string, message: string, details?: Record<string, string>) => ({ type: "error", error: { type, message, ...(details ? { details } : {}) } });
const failing = (error: Error, deltas: string[] = []) => ({ on(event: string, fn: (...args: unknown[]) => void) { if (event === "text") for (const delta of deltas) queueMicrotask(() => fn(delta, delta)); return this; }, finalMessage: () => new Promise((_, reject) => setTimeout(() => reject(error), 0)) });
const answered = (content: unknown[]) => ({ on() { return this; }, finalMessage: async () => ({ id: "msg", type: "message", role: "assistant", content, stop_reason: content.some((b) => (b as { type: string }).type === "tool_use") ? "tool_use" : "end_turn", usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use: null } }) });
async function* events(output: unknown[]) { yield { type: "response.completed", response: { status: "completed", output, usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 40 }, output_tokens: 20 } } }; }
const answer = (text: string) => ({ type: "message", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] });
const primary = { provider: "anthropic", apiKey: "unit-test-not-a-key", model: "claude-sonnet-5-5", providerLabel: "Anthropic (Claude)", webSearch: true };
const fallback = { provider: "xai", apiKey: "unit-test-not-a-key-2", model: "grok-4.7", providerLabel: "xAI (Grok)", webSearch: true };
const question = [{ role: "user" as const, content: "What does ZCG hold?" }];
const fetchMock = vi.fn();
const run = async () => { const emitted: ZarvisEvent[] = []; const metrics = await generateAnswer(question, new AbortController().signal, (e) => emitted.push(e)); return { emitted, metrics }; };
beforeEach(() => {
  vi.resetAllMocks(); resetAlertsForTests();
  fetchMock.mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetchMock); vi.stubEnv("ZARVIS_ALERT_WEBHOOK_URL", "https://hooks.example/abc");
  mocks.config.mockReturnValue({ ...primary, fallback });
  mocks.prepare.mockResolvedValue({ query: "test", documents: [], evidence: [], external: false });
  mocks.lookup.mockResolvedValue({ content: "{}" });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("Provider failover", () => {
  it.each([
    ["provider_http_429", new RateLimitError(429, body("rate_limit_error", "sentinel"), "sentinel", headers, "rate_limit_error")],
    ["provider_http_5xx", new InternalServerError(529, body("overloaded_error", "Overloaded"), "Overloaded", headers, "overloaded_error")],
    ["provider_connection", new APIConnectionError({ message: "fetch failed", cause: new Error("ECONNRESET") })],
    ["provider_timeout", new APIConnectionTimeoutError()],
    ["provider_billing", new BadRequestError(400, body("invalid_request_error", "Your credit balance is too low to access the Anthropic API."), "credit", headers, "invalid_request_error")],
  ])("runs the model part once more on the fallback when the first call fails with %s before any text, and reports the provider actually used", async (errorClass, error) => {
    mocks.stream.mockReturnValueOnce(failing(error));
    mocks.create.mockResolvedValueOnce(events([answer("A grounded answer.")]));
    const { emitted, metrics } = await run();
    expect(mocks.stream).toHaveBeenCalledTimes(1); expect(mocks.create).toHaveBeenCalledTimes(1); expect(mocks.prepare).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0][0]).toMatchObject({ model: "grok-4.7", max_turns: 2, store: false });
    expect(metrics).toMatchObject({ provider: "xai", model: "grok-4.7", modelCalls: 1, inputTokens: 100, cachedInputTokens: 40, usageReported: true });
    expect(emitted.at(-1)).toMatchObject({ type: "done", provenance: { route: "model", model: "grok-4.7" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const message = JSON.parse(fetchMock.mock.calls[0][1].body).content;
    expect(message).toContain("Anthropic (Claude)"); expect(message).toContain(errorClass); expect(message).toContain("xAI (Grok)");
    expect(message).not.toContain("sentinel");
  });
  it("does not fail over after the first model call, after streamed text, for an ineligible class, or without a fallback", async () => {
    const limit = () => new RateLimitError(429, body("rate_limit_error", "sentinel"), "sentinel", headers, "rate_limit_error");
    mocks.stream.mockReturnValueOnce(answered([{ type: "tool_use", id: "a", name: "lookup_openzcash", input: { topic: "treasuries", query: "" } }])).mockReturnValueOnce(failing(limit()));
    await expect(run()).rejects.toMatchObject({ errorClass: "provider_http_429" });
    expect(mocks.create).not.toHaveBeenCalled();
    mocks.prepare.mockResolvedValue({ query: "Who is Zooko?", documents: [], evidence: [], external: false });
    mocks.stream.mockReturnValueOnce(failing(limit(), ["Zooko Wilcox "]));
    const emitted: ZarvisEvent[] = [];
    await expect(generateAnswer([{ role: "user", content: "Who is Zooko?" }], new AbortController().signal, (e) => emitted.push(e))).rejects.toMatchObject({ errorClass: "provider_http_429" });
    expect(emitted.some((e) => e.type === "delta")).toBe(true); expect(mocks.create).not.toHaveBeenCalled();
    mocks.stream.mockReturnValueOnce(failing(new BadRequestError(400, body("invalid_request_error", "bad"), "bad", headers, "invalid_request_error")));
    await expect(run()).rejects.toMatchObject({ errorClass: "provider_http_4xx" });
    mocks.config.mockReturnValue({ ...primary, fallback: null });
    mocks.stream.mockReturnValueOnce(failing(limit()));
    await expect(run()).rejects.toMatchObject({ errorClass: "provider_http_429" });
    expect(mocks.create).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("fails over from xAI to OpenAI on a 5xx and surfaces the fallback's own failure class when both fail", async () => {
    mocks.config.mockReturnValue({ ...fallback, fallback: { provider: "openai", apiKey: "unit-test-not-a-key-3", model: "gpt-5-mini", providerLabel: "OpenAI", webSearch: true } });
    mocks.create.mockRejectedValueOnce(new OpenAIServerError(503, undefined, "upstream", headers)).mockResolvedValueOnce(events([answer("Answered by the fallback.")]));
    const { metrics } = await run();
    expect(mocks.create).toHaveBeenCalledTimes(2); expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.create.mock.calls[0][0]).toMatchObject({ model: "grok-4.7", max_turns: 2 });
    expect(mocks.create.mock.calls[1][0]).toMatchObject({ model: "gpt-5-mini", max_tool_calls: 2 });
    expect(metrics).toMatchObject({ provider: "openai", model: "gpt-5-mini", modelCalls: 1 });
    mocks.create.mockRejectedValueOnce(new OpenAIServerError(503, undefined, "upstream", headers)).mockRejectedValueOnce(new OpenAIServerError(502, undefined, "down", headers));
    await expect(run()).rejects.toMatchObject({ errorClass: "provider_http_5xx" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
