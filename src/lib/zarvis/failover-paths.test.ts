import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({
  getDb: () => {
    throw new Error("no database in unit tests");
  },
}));
const mocks = vi.hoisted(() => ({
  stream: vi.fn(),
  create: vi.fn(),
  prepare: vi.fn(),
  config: vi.fn(),
  lookup: vi.fn(),
}));
vi.mock("@anthropic-ai/sdk", async (original) => ({
  ...(await original<object>()),
  default: class {
    messages = { stream: mocks.stream };
  },
}));
vi.mock("openai", async (original) => ({
  ...(await original<object>()),
  default: class {
    responses = { create: mocks.create };
  },
}));
vi.mock("./config", () => ({ zarvisConfig: mocks.config }));
vi.mock("./local", async (original) => ({
  ...(await original<object>()),
  prepareLocal: mocks.prepare,
}));
vi.mock("./data", async (original) => ({
  ...(await original<object>()),
  lookupPublicData: mocks.lookup,
}));
import {
  APIError as ClaudeAPIError,
  APIUserAbortError as ClaudeAbortError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import {
  InternalServerError as OpenAIServerError,
  RateLimitError as OpenAIRateLimitError,
} from "openai";
import { resetAlertsForTests } from "./alerts";
import { recordGeneration, resetMetricsForTests } from "./metrics";
import { resetStoreForTests } from "./metrics-store";
import { generateAnswer } from "./openai";
import { estimateUsageUsd } from "./pricing";
import type { ZarvisEvent } from "./types";

/* Every branch of the failover wrapper in openai.ts, and cache-write tokens reaching the price, with both SDKs mocked as failover.test.ts mocks them. */
type Block = Record<string, unknown>;
const headers = new Headers({ "request-id": "req_sentinel" });
const body = (
  type: string,
  message: string,
  details?: Record<string, string>,
) => ({
  type: "error",
  error: { type, message, ...(details ? { details } : {}) },
});
const usage = {
  input_tokens: 100,
  cache_read_input_tokens: 40,
  cache_creation_input_tokens: 10,
  output_tokens: 20,
  server_tool_use: null,
};
const message = (content: Block[], stop: string, searches = 0) => ({
  id: "msg",
  type: "message",
  role: "assistant",
  content,
  stop_reason: stop,
  usage: {
    ...usage,
    server_tool_use: searches
      ? { web_search_requests: searches, web_fetch_requests: 0 }
      : null,
  },
});
/** Deltas reach the text listener before the final message settles, as the SDK's stream delivers them. */
const failing = (error: Error, deltas: string[] = []) => ({
  on(event: string, fn: (...args: unknown[]) => void) {
    if (event === "text")
      for (const delta of deltas) queueMicrotask(() => fn(delta, delta));
    return this;
  },
  finalMessage: () =>
    new Promise((_, reject) => setTimeout(() => reject(error), 0)),
});
const answered = (content: Block[], stop?: string, searches?: number) => ({
  on() {
    return this;
  },
  finalMessage: async () =>
    message(
      content,
      stop ??
        (content.some((block) => block.type === "tool_use")
          ? "tool_use"
          : "end_turn"),
      searches,
    ),
});
async function* events(output: unknown[], text?: string) {
  if (text) yield { type: "response.output_text.delta", delta: text };
  yield {
    type: "response.completed",
    response: {
      status: "completed",
      output,
      usage: {
        input_tokens: 100,
        input_tokens_details: { cached_tokens: 40 },
        output_tokens: 20,
      },
    },
  };
}
async function* breaking(text: string, error: Error) {
  yield { type: "response.output_text.delta", delta: text };
  throw error;
}
const answer = (text: string) => ({
  type: "message",
  role: "assistant",
  content: [{ type: "output_text", text, annotations: [] }],
});
const text = (value: string): Block => ({
  type: "text",
  text: value,
  citations: null,
});
const use = (id: string): Block => ({
  type: "tool_use",
  id,
  name: "lookup_openzcash",
  input: { topic: "treasuries", query: "" },
});
const search = (id: string): Block[] => [
  {
    type: "server_tool_use",
    id,
    name: "web_search",
    input: { query: "zcash shielded pools" },
    caller: { type: "direct" },
  },
  {
    type: "web_search_tool_result",
    tool_use_id: id,
    caller: { type: "direct" },
    content: [
      {
        type: "web_search_result",
        url: "https://z.cash/learn/",
        title: "Zcash",
        encrypted_content: "opaque-search",
        page_age: null,
      },
    ],
  },
];
const billing400 = () =>
  new BadRequestError(
    400,
    body(
      "invalid_request_error",
      "Your credit balance is too low to access the Anthropic API.",
    ),
    "credit",
    headers,
    "invalid_request_error",
  );
const spendLimit429 = () =>
  new RateLimitError(
    429,
    body(
      "rate_limit_error",
      "You have reached your API usage limits: sentinel",
      { error_code: "enforced_spend_limit_reached" },
    ),
    "limit",
    headers,
    "rate_limit_error",
  );
const overloaded529 = () =>
  new InternalServerError(
    529,
    body("overloaded_error", "Overloaded"),
    "Overloaded",
    headers,
    "overloaded_error",
  );
const overloadedMidStream = () =>
  new ClaudeAPIError(
    undefined,
    body("overloaded_error", "Overloaded"),
    undefined,
    headers,
    "overloaded_error",
  );
const plain400 = () =>
  new BadRequestError(
    400,
    body("invalid_request_error", "messages: roles must alternate"),
    "bad",
    headers,
    "invalid_request_error",
  );
const primary = {
  provider: "anthropic",
  apiKey: "unit-test-not-a-key",
  model: "claude-sonnet-5-5",
  providerLabel: "Anthropic (Claude)",
  webSearch: true,
};
const fallback = {
  provider: "xai",
  apiKey: "unit-test-not-a-key-2",
  model: "grok-4.7",
  providerLabel: "xAI (Grok)",
  webSearch: true,
};
const openaiFallback = {
  provider: "openai",
  apiKey: "unit-test-not-a-key-3",
  model: "gpt-5-mini",
  providerLabel: "OpenAI",
  webSearch: true,
};
const question = [{ role: "user" as const, content: "What does ZCG hold?" }];
const zooko = [{ role: "user" as const, content: "Who is Zooko?" }];
const zookoPlan = {
  query: "Who is Zooko?",
  documents: [
    {
      id: "zooko-background",
      title: "Zooko",
      url: "https://z.cash/learn/who-created-zcash/",
      text: "Zooko Wilcox.",
      kind: "reference",
    },
  ],
  evidence: [],
  external: false,
};
const searchPlan = {
  query: "shielded pools explained",
  documents: [],
  evidence: [],
  external: true,
};
const fetchMock = vi.fn();
const run = async (
  messages = question,
  signal = new AbortController().signal,
) => {
  const emitted: ZarvisEvent[] = [];
  const metrics = await generateAnswer(messages, signal, (e) =>
    emitted.push(e),
  );
  return { emitted, metrics };
};
const failed = async (
  messages = question,
  signal = new AbortController().signal,
) => {
  const emitted: ZarvisEvent[] = [];
  const error = await generateAnswer(messages, signal, (e) =>
    emitted.push(e),
  ).then(
    () => {
      throw new Error("resolved unexpectedly");
    },
    (e) => e,
  );
  return { emitted, error };
};
const alertMessage = (call = 0) =>
  JSON.parse(fetchMock.mock.calls[call][1].body).content as string;
/** 100 plain input at $2, 40 cached at $0.10, 10 written at $2.50 and 20 output at $10, per million. */
const CLAUDE_USD = (100 * 2 + 40 * 0.1 + 10 * 2.5 + 20 * 10) / 1e6;
/** 60 plain input at $2, 40 cached at $0.50 and 20 output at $6, per million. */
const GROK_USD = (60 * 2 + 40 * 0.5 + 20 * 6) / 1e6;
beforeEach(() => {
  vi.resetAllMocks();
  resetAlertsForTests();
  resetMetricsForTests();
  resetStoreForTests();
  fetchMock.mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("ZARVIS_ALERT_WEBHOOK_URL", "https://hooks.example/abc");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.config.mockReturnValue({ ...primary, fallback });
  mocks.prepare.mockResolvedValue({
    query: "test",
    documents: [],
    evidence: [],
    external: false,
  });
  mocks.lookup.mockResolvedValue({ content: "{}" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Failover fires", () => {
  it("moves to the fallback on the spend-limit 429 before any delta and names the fallback model in metrics, provenance and price", async () => {
    mocks.stream.mockReturnValueOnce(failing(spendLimit429()));
    mocks.create.mockResolvedValueOnce(events([answer("A grounded answer.")]));
    const { emitted, metrics } = await run();
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(metrics).toEqual(
      expect.objectContaining({
        route: "model",
        provider: "xai",
        model: "grok-4.7",
        modelCalls: 1,
        localLookups: 0,
        webSearchCalls: 0,
        inputTokens: 100,
        cachedInputTokens: 40,
        cacheWriteTokens: 0,
        outputTokens: 20,
        usageReported: true,
        depth: "quick",
        reasoningEffort: "low",
      }),
    );
    expect(emitted.at(-1)).toMatchObject({
      type: "done",
      provenance: { route: "model", model: "grok-4.7" },
    });
    expect(estimateUsageUsd(metrics)).toBeCloseTo(GROK_USD, 12);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(alertMessage()).toContain("provider_billing");
    expect(alertMessage()).not.toContain("sentinel");
  });
  it("moves to the fallback on a mid-stream overloaded error that carries no HTTP status", async () => {
    mocks.stream.mockReturnValueOnce(failing(overloadedMidStream()));
    mocks.create.mockResolvedValueOnce(events([answer("A grounded answer.")]));
    const { metrics } = await run();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(metrics).toMatchObject({ provider: "xai", model: "grok-4.7" });
    expect(alertMessage()).toContain("provider_http_5xx");
  });
  it("moves to the fallback when the primary's text was only buffered for a money question, and never shows that text", async () => {
    mocks.stream.mockReturnValueOnce(
      failing(overloaded529(), ["ZCG holds $1 million"]),
    );
    mocks.create.mockResolvedValueOnce(events([answer("A grounded answer.")]));
    const { emitted, metrics } = await run();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(emitted.some((e) => e.type === "delta")).toBe(false);
    expect(JSON.stringify(emitted)).not.toContain("$1 million");
    expect(metrics).toMatchObject({ provider: "xai", model: "grok-4.7" });
    expect(emitted.at(-1)).toMatchObject({
      type: "done",
      provenance: { model: "grok-4.7" },
    });
  });
  it("moves to the fallback when a pause_turn continuation of the first model call fails", async () => {
    mocks.prepare.mockResolvedValue(searchPlan);
    mocks.stream
      .mockReturnValueOnce(answered(search("srv_1"), "pause_turn", 1))
      .mockReturnValueOnce(failing(overloaded529()));
    mocks.create.mockResolvedValueOnce(events([answer("A grounded answer.")]));
    const { metrics } = await run();
    expect(mocks.stream).toHaveBeenCalledTimes(2);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(metrics).toMatchObject({
      provider: "xai",
      model: "grok-4.7",
      modelCalls: 1,
    });
  });
  it("sends one failover alert per ten minutes", async () => {
    mocks.stream
      .mockReturnValueOnce(failing(billing400()))
      .mockReturnValueOnce(failing(billing400()));
    mocks.create
      .mockResolvedValueOnce(events([answer("One.")]))
      .mockResolvedValueOnce(events([answer("Two.")]));
    await run();
    await run();
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("surfaces the fallback's own class and the fallback's metrics when both providers fail", async () => {
    mocks.stream.mockReturnValueOnce(failing(billing400()));
    mocks.create.mockRejectedValueOnce(
      new OpenAIServerError(503, undefined, "upstream", headers),
    );
    const { emitted, error } = await failed();
    expect(error).toMatchObject({ errorClass: "provider_http_5xx" });
    expect(error.usage).toMatchObject({
      model: "grok-4.7",
      modelCalls: 1,
      inputTokens: 0,
      usageReported: false,
    });
    expect(emitted.some((e) => e.type === "done")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Failover stays put", () => {
  it("does not fire on the billing error once a delta has been emitted", async () => {
    mocks.prepare.mockResolvedValue(zookoPlan);
    mocks.stream.mockReturnValueOnce(failing(billing400(), ["Zooko Wilcox "]));
    const { emitted, error } = await failed(zooko);
    expect(error).toMatchObject({ errorClass: "provider_billing" });
    expect(emitted.some((e) => e.type === "delta")).toBe(true);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not fire on provider_http_4xx, including a rejected key", async () => {
    mocks.stream.mockReturnValueOnce(failing(plain400()));
    expect((await failed()).error).toMatchObject({
      errorClass: "provider_http_4xx",
    });
    mocks.stream.mockReturnValueOnce(
      failing(
        new AuthenticationError(
          401,
          body("authentication_error", "invalid x-api-key"),
          "auth",
          headers,
          "authentication_error",
        ),
      ),
    );
    expect((await failed()).error).toMatchObject({
      errorClass: "provider_http_4xx",
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not fire on incomplete_response or empty_response from the first call", async () => {
    mocks.stream.mockReturnValueOnce(
      answered([text("A truncated")], "max_tokens"),
    );
    expect((await failed()).error).toMatchObject({
      errorClass: "incomplete_response",
    });
    mocks.stream.mockReturnValueOnce(answered([], "end_turn"));
    expect((await failed()).error).toMatchObject({
      errorClass: "empty_response",
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not fire when the visitor aborts the first call", async () => {
    const controller = new AbortController();
    mocks.stream.mockImplementationOnce((_p, o: { signal: AbortSignal }) => ({
      on() {
        return this;
      },
      finalMessage: () =>
        new Promise((_, reject) => {
          o.signal.addEventListener("abort", () =>
            reject(new ClaudeAbortError()),
          );
          controller.abort();
        }),
    }));
    const { error } = await failed(question, controller.signal);
    expect(error).toMatchObject({ errorClass: "aborted" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not fire for a Responses primary once its stream has delivered a delta", async () => {
    mocks.config.mockReturnValue({ ...fallback, fallback: openaiFallback });
    mocks.prepare.mockResolvedValue(zookoPlan);
    mocks.create.mockResolvedValueOnce(
      breaking(
        "Zooko ",
        new OpenAIRateLimitError(
          429,
          { message: "sentinel" },
          undefined,
          headers,
        ),
      ),
    );
    const { emitted, error } = await failed(zooko);
    expect(error).toMatchObject({ errorClass: "provider_http_429" });
    expect(emitted.some((e) => e.type === "delta")).toBe(true);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Cache writes reach the price", () => {
  it("prices a completed Claude answer with its cache writes at the write rate, through estimateUsageUsd and recordGeneration", async () => {
    mocks.config.mockReturnValue({ ...primary, fallback: null });
    mocks.stream.mockReturnValueOnce(answered([text("A dated answer.")]));
    const { metrics } = await run();
    expect(metrics).toMatchObject({
      provider: "anthropic",
      inputTokens: 150,
      cachedInputTokens: 40,
      cacheWriteTokens: 10,
      outputTokens: 20,
      usageReported: true,
    });
    expect(estimateUsageUsd(metrics)).toBeCloseTo(CLAUDE_USD, 12);
    expect(recordGeneration("completed", 1_000, metrics)).toBeCloseTo(
      CLAUDE_USD,
      12,
    );
  });
  it("carries the cache writes of the rounds before a failure into the priced lower bound", async () => {
    mocks.config.mockReturnValue({ ...primary, fallback: null });
    mocks.stream
      .mockReturnValueOnce(answered([use("a")]))
      .mockReturnValueOnce(failing(overloaded529()));
    const { error } = await failed();
    expect(error).toMatchObject({ errorClass: "provider_http_5xx" });
    expect(error.usage).toMatchObject({
      model: "claude-sonnet-5-5",
      modelCalls: 2,
      inputTokens: 150,
      cachedInputTokens: 40,
      cacheWriteTokens: 10,
      outputTokens: 20,
      usageReported: false,
    });
    expect(
      recordGeneration("failed", 1_000, error.usage, error.errorClass),
    ).toBeCloseTo(CLAUDE_USD, 12);
  });
  it("never prices cache writes as free for a Claude model outside the rate table", async () => {
    mocks.config.mockReturnValue({
      ...primary,
      model: "claude-future",
      fallback: null,
    });
    mocks.stream.mockReturnValueOnce(answered([text("A dated answer.")]));
    const { metrics } = await run();
    expect(metrics).toMatchObject({
      model: "claude-future",
      cacheWriteTokens: 10,
    });
    expect(estimateUsageUsd(metrics)).toBeNull();
  });
});
