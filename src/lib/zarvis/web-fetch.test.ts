import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ stream: vi.fn(), client: vi.fn(), create: vi.fn(), lookup: vi.fn(), prepare: vi.fn(), config: vi.fn() }));
vi.mock("@anthropic-ai/sdk", async (original) => ({ ...await original<object>(), default: class { messages = { stream: mocks.stream }; constructor(options: unknown) { mocks.client(options); } } }));
vi.mock("openai", async (original) => ({ ...await original<object>(), default: class { responses = { create: mocks.create }; } }));
vi.mock("./config", () => ({ zarvisConfig: mocks.config }));
vi.mock("./data", async (original) => ({ ...await original<object>(), lookupPublicData: mocks.lookup }));
vi.mock("./local", async (original) => ({ ...await original<object>(), prepareLocal: mocks.prepare }));
import { FETCH_MAX_CONTENT_TOKENS, anthropicFetchTool } from "./anthropic";
import { linkedSources, modelAnswer, prepareAnswer, researchTool, type Conversation, type GenerationMetrics, type RoundOptions, type RoundResult } from "./engine";
import { generateAnswer } from "./openai";
import { SEARCH_DOMAINS, fetchableSourceUrl } from "./sources";
import type { ChatMessage, ZarvisEvent } from "./types";

/*
 * The page-reading tool: the engine offers it in exactly two situations, the Anthropic transport declares Claude's web fetch server tool for it,
 * renders a cited fetched page as a source and counts the fetch; the Responses transport never sees it. The SDK is mocked as in anthropic.test.ts.
 */
type Listener = (...args: unknown[]) => void;
type Block = Record<string, unknown>;
const usage = { input_tokens: 100, cache_read_input_tokens: 40, cache_creation_input_tokens: 10, output_tokens: 20 };
function reply(content: Block[], options: { stop?: string; items?: Array<string | Block>; searches?: number; fetches?: number } = {}) {
  const stop = options.stop ?? (content.some((block) => block.type === "tool_use") ? "tool_use" : "end_turn");
  const message = { id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5-5", content, stop_reason: stop, stop_sequence: null, usage: { ...usage, server_tool_use: options.searches || options.fetches ? { web_search_requests: options.searches ?? 0, web_fetch_requests: options.fetches ?? 0 } : null } };
  const listeners = new Map<string, Listener[]>();
  const stream = {
    on(event: string, fn: Listener) { listeners.set(event, [...(listeners.get(event) ?? []), fn]); return stream; },
    async finalMessage() {
      for (const item of options.items ?? []) {
        if (typeof item === "string") for (const fn of listeners.get("text") ?? []) fn(item, item);
        else for (const fn of listeners.get("streamEvent") ?? []) fn(item, message);
      }
      return message;
    },
  };
  return stream;
}
const THREAD = "https://forum.zcashcommunity.com/t/zcash-arborist-call-131/52000";
const text = (value: string, citations: unknown[] | null = null): Block => ({ type: "text", text: value, citations });
const use = (id: string): Block => ({ type: "tool_use", id, name: "lookup_openzcash", input: { topic: "treasuries", query: "" } });
const fetchUse = (id: string, url = THREAD): Block => ({ type: "server_tool_use", id, name: "web_fetch", input: { url }, caller: { type: "direct" } });
const fetchResult = (id: string, url = THREAD, title: string | null = "Arborist call 131"): Block => ({ type: "web_fetch_tool_result", tool_use_id: id, caller: { type: "direct" }, content: { type: "web_fetch_result", url, content: { type: "document", source: { type: "text", media_type: "text/plain", data: "The call covered Zebra 3.0." }, title, citations: { enabled: true } }, retrieved_at: "2026-10-08T10:00:00Z" } });
const fetched = (id: string, url = THREAD, title: string | null = "Arborist call 131"): Block[] => [fetchUse(id, url), fetchResult(id, url, title)];
const cite = (index: number, title: string | null = "Arborist call 131") => ({ type: "char_location", document_index: index, document_title: title, start_char_index: 0, end_char_index: 27, cited_text: "The call covered Zebra 3.0.", file_id: null });
const fetchStart = { type: "content_block_start", index: 1, content_block: { type: "server_tool_use", id: "srv_f1", name: "web_fetch", input: {} } };
const linked: ChatMessage[] = [{ role: "user", content: `What was decided in ${THREAD}?` }];
const plain: ChatMessage[] = [{ role: "user", content: "What does ZCG hold?" }];
const FETCH_TOOL = { type: "web_fetch_20260318", name: "web_fetch", allowed_callers: ["direct"], max_uses: 2, allowed_domains: SEARCH_DOMAINS, max_content_tokens: FETCH_MAX_CONTENT_TOKENS, citations: { enabled: true } };
const names = (tools: Array<{ name: string }>) => tools.map((tool) => tool.name);
const params = (call: number) => mocks.stream.mock.calls[call][0];
const config = (webSearch: boolean) => ({ provider: "anthropic" as const, apiKey: "unit-test-not-a-key", model: "claude-sonnet-5-5", providerLabel: "Anthropic (Claude)" as const, webSearch, fallback: null });
const run = async (messages: ChatMessage[]) => { const emitted: ZarvisEvent[] = []; const metrics = await generateAnswer(messages, new AbortController().signal, (e) => emitted.push(e)); return { emitted, metrics }; };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.config.mockReturnValue(config(true));
  mocks.prepare.mockResolvedValue({ query: "test", documents: [], evidence: [], external: false });
  mocks.lookup.mockResolvedValue({ content: "{}" });
});

describe("linkedSources", () => {
  it("returns the fetchable https links of the latest visitor message only, trailing punctuation dropped, each once, at most three", () => {
    const history: ChatMessage[] = [{ role: "user", content: "see https://zfnd.org/blog/one/" }, { role: "assistant", content: "https://zfnd.org/blog/two/" }, { role: "user", content: `Read ${THREAD}, then https://zips.z.cash/zip-0317). Also https://electriccoin.co/blog/a/ and https://zechub.wiki/b, and ${THREAD} again.` }];
    expect(linkedSources(history)).toEqual([THREAD, "https://zips.z.cash/zip-0317", "https://electriccoin.co/blog/a/"]);
    expect(linkedSources([{ role: "assistant", content: THREAD }])).toEqual([]);
  });
  it.each(["https://evil.example/zcash", "https://www.youtube.com/watch?v=abc123def", "https://github.com/zcash/zips/blob/main/zips/zip-0317.rst", "http://forum.zcashcommunity.com/t/x/1", "https://user:pw@zfnd.org/blog/", "https://forum.zcashcommunity.com.evil.org/t/x/1"])("ignores a link the fetch tool cannot read: %s", (url) => {
    expect(fetchableSourceUrl(url)).toBeNull();
    expect(linkedSources([{ role: "user", content: `Look at ${url} please` }])).toEqual([]);
  });
});

describe("engine: when the fetch tool is offered", () => {
  const metrics = (): GenerationMetrics => ({ route: "model", provider: "openai", model: "unit-model", modelCalls: 0, localLookups: 0, webSearchCalls: 0, webFetchCalls: 0, inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, usageReported: false });
  const round = (result: Partial<RoundResult>): RoundResult => ({ text: "Answer.", sources: [], calls: [], searches: 0, usage: { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1, reported: true }, streamed: false, ...result });
  const lookup = round({ text: "", calls: [{ id: "a", name: "lookup_openzcash", arguments: "{}" }] });
  /** A transport stand-in that records what each round was offered and answers from a script. */
  function fake(replies: RoundResult[]) {
    const rounds: RoundOptions[] = [];
    const script = [...replies];
    const conversation: Conversation = { addEvidence() {}, addMessages() {}, note() {}, toolResult() {}, async round(options) { rounds.push(options); const next = script.shift(); if (!next) throw new Error("script exhausted"); return next; } };
    return { conversation, rounds };
  }
  async function offered(messages: ChatMessage[], replies: RoundResult[], webSearch = true) {
    const { conversation, rounds } = fake(replies);
    const prepared = await prepareAnswer(messages, new AbortController().signal, {}, "auto");
    const result = await modelAnswer(prepared, { ...config(webSearch), provider: "openai" as const }, conversation, metrics(), Date.now(), new AbortController().signal, () => {});
    return { rounds: rounds.map((options) => ({ webFetch: options.webFetch, webSearch: options.webSearch, tools: names(options.tools) })), metrics: result };
  }
  it("offers nothing without allowed research or a linked page", async () => {
    const { rounds, metrics: m } = await offered(plain, [lookup, round({})]);
    expect(rounds.map((r) => r.webFetch)).toEqual([false, false]);
    expect(m.webFetchCalls).toBe(0);
  });
  it("offers fetch while research is allowed, until a fetch was used and never on the final round", async () => {
    mocks.prepare.mockResolvedValue({ query: "test", documents: [], evidence: [], external: true });
    const { rounds, metrics: m } = await offered(plain, [lookup, { ...lookup, fetches: 1 }, round({})]);
    expect(rounds.map((r) => r.webFetch)).toEqual([true, true, false]);
    expect(rounds[2].webSearch).toBeNull();
    expect(m.webFetchCalls).toBe(1);
  });
  it("offers fetch for a linked allowlisted page even when no research is allowed, and keeps the research request flow unchanged", async () => {
    const { rounds } = await offered(linked, [lookup, lookup, round({})]);
    expect(rounds.map((r) => r.webFetch)).toEqual([true, true, false]);
    expect(rounds.map((r) => r.webSearch)).toEqual([null, null, null]);
    expect(rounds[0].tools).toContain(researchTool.name);
    const { rounds: off } = await offered(linked, [lookup, round({})], false);
    expect(off.map((r) => r.webFetch)).toEqual([true, true]);
    expect(off[0].tools).not.toContain(researchTool.name);
  });
  it("offers fetch once a research request was granted", async () => {
    const granted = round({ text: "", calls: [{ id: "r", name: "request_external_research", arguments: '{"reason":"missing_local_evidence"}' }] });
    const { rounds } = await offered(plain, [granted, round({ fetches: 1 })]);
    expect(rounds.map((r) => [r.webFetch, r.webSearch])).toEqual([[false, null], [true, "general"]]);
  });
  it.each(["https://evil.example/zcash-thread", "https://www.youtube.com/watch?v=abc123def"])("never offers fetch for a link off the fetch domains: %s", async (url) => {
    const { rounds } = await offered([{ role: "user", content: `Summarise ${url}` }], [round({})]);
    expect(rounds.map((r) => r.webFetch)).toEqual([false]);
  });
});

describe("Anthropic transport: the web fetch server tool", () => {
  it("declares the documented fetch tool next to the search tool from the first round and keeps the list fixed", async () => {
    mocks.stream.mockReturnValueOnce(reply([use("a")])).mockReturnValueOnce(reply([text("Answered.")]));
    await run(plain);
    expect(anthropicFetchTool()).toEqual(FETCH_TOOL);
    expect(params(0).tools.find((tool: { type?: string }) => tool.type === "web_fetch_20260318")).toEqual(FETCH_TOOL);
    expect(names(params(0).tools).slice(-2)).toEqual(["web_fetch", "web_search"]);
    expect(params(1).tools).toEqual(params(0).tools);
  });
  it("declares the fetch tool alone when search is off and the question links an allowlisted page", async () => {
    mocks.config.mockReturnValue(config(false));
    mocks.stream.mockReturnValueOnce(reply([text("Read it.")]));
    await run(linked);
    expect(names(params(0).tools)).toEqual(["lookup_openzcash", "query_openzcash_ledger", "calculate_openzcash_treasury", "lookup_zcash_zips", "query_project_history", "query_project_activity", "query_zcash_analytics", "read_grant_application", "web_fetch"]);
    expect(params(0)).not.toHaveProperty("tool_choice");
  });
  it.each(["https://evil.example/zcash-thread", "https://github.com/zcash/zips/blob/main/zips/zip-0317.rst"])("declares no server tool when search is off and the only link is unreadable: %s", async (url) => {
    mocks.config.mockReturnValue(config(false));
    mocks.stream.mockReturnValueOnce(reply([text("No page to read.")]));
    await run([{ role: "user", content: `Summarise ${url}` }]);
    expect(names(params(0).tools)).not.toContain("web_fetch");
    expect(params(0).tools.every((tool: { type?: string }) => !tool.type)).toBe(true);
  });
  it("renders a cited fetched page as a source and a link, counts the fetch, reports the read and echoes the result exactly", async () => {
    mocks.config.mockReturnValue(config(false));
    const first = [...fetched("srv_f1"), use("a")];
    mocks.stream.mockReturnValueOnce(reply(first, { fetches: 1, items: [fetchStart] })).mockReturnValueOnce(reply([text("The call covered Zebra 3.0.", [cite(0)]), text(" Notes follow.")]));
    const { emitted, metrics } = await run(linked);
    expect(params(1).messages[1]).toEqual({ role: "assistant", content: first });
    expect(params(1).messages.at(-1)).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "a", content: "{}" }] });
    expect(emitted.some((e) => e.type === "status" && e.message === "Reading a source page…")).toBe(true);
    expect(emitted.find((e) => e.type === "replace")).toEqual({ type: "replace", text: `The call covered Zebra 3.0. [Arborist call 131](${THREAD}) Notes follow.` });
    expect(emitted.at(-1)).toMatchObject({ type: "done", sources: [{ title: "Arborist call 131", url: THREAD, retrievedAt: expect.any(String) }], provenance: { webSearch: false } });
    expect(metrics).toMatchObject({ modelCalls: 2, webFetchCalls: 1, webSearchCalls: 0, localLookups: 1 });
  });
  it("resolves pages fetched in the same turn by index, falls back to the page title and links each page once", async () => {
    const zip = "https://zips.z.cash/zip-0317";
    mocks.stream.mockReturnValueOnce(reply([...fetched("srv_f1"), ...fetched("srv_f2", zip, "ZIP 317"), text("First.", [cite(1, null)]), text(" Second.", [cite(1, null), cite(0)])], { fetches: 2 }));
    const { emitted, metrics } = await run(plain);
    expect(emitted.find((e) => e.type === "replace")).toEqual({ type: "replace", text: `First. [ZIP 317](${zip}) Second. [Arborist call 131](${THREAD})` });
    expect((emitted.at(-1) as { sources: Array<{ url: string }> }).sources.map((s) => s.url)).toEqual([zip, THREAD]);
    expect(metrics.webFetchCalls).toBe(2);
  });
  it("drops a fetched-page citation whose page is off the allowlist or whose index is unknown, and ignores an error result", async () => {
    const error = { type: "web_fetch_tool_result", tool_use_id: "srv_f2", caller: { type: "direct" }, content: { type: "web_fetch_tool_result_error", error_code: "url_not_allowed" } };
    mocks.stream.mockReturnValueOnce(reply([...fetched("srv_f1", "https://evil.example/page", "Evil"), fetchUse("srv_f2", "https://evil.example/other"), error, text("Claim.", [cite(0, "Evil"), cite(7)])], { fetches: 2 }));
    const { emitted, metrics } = await run(plain);
    expect(emitted.find((e) => e.type === "replace")).toEqual({ type: "replace", text: "Claim." });
    expect(emitted.at(-1)).toMatchObject({ type: "done", sources: [] });
    expect(JSON.stringify(emitted)).not.toContain("evil.example");
    expect(metrics.webFetchCalls).toBe(2);
  });
  it("answers a turn that owes a fetch next to a local tool with tool results only, keeps the tools and resolves the result that opens the next response", async () => {
    mocks.stream.mockReturnValueOnce(reply([fetchUse("srv_f1"), use("a")], { stop: "tool_use" })).mockReturnValueOnce(reply([fetchResult("srv_f1"), text("Decided.", [cite(0)])], { fetches: 1 }));
    const { emitted, metrics } = await run(linked);
    expect(params(1).messages.at(-1)).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "a", content: "{}" }] });
    expect(params(1)).not.toHaveProperty("tool_choice");
    expect(params(1).tools).toEqual(params(0).tools);
    expect(emitted.find((e) => e.type === "replace")).toEqual({ type: "replace", text: `Decided. [Arborist call 131](${THREAD})` });
    expect(metrics).toMatchObject({ modelCalls: 2, webFetchCalls: 1 });
  });
});

describe("Responses transport", () => {
  it("sends the same request with a linked page: no fetch tool exists there", async () => {
    mocks.config.mockReturnValue({ provider: "openai", apiKey: "unit-test-not-a-key", model: "gpt-6-astra", webSearch: true, fallback: null });
    const completed = { type: "response.completed", response: { status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Read.", annotations: [] }] }], usage: { input_tokens: 10, output_tokens: 2 } } };
    mocks.create.mockResolvedValueOnce((async function* () { yield completed; })());
    const { metrics } = await run(linked);
    const tools = mocks.create.mock.calls[0][0].tools as Array<{ type: string; name?: string }>;
    expect(tools.map((tool) => tool.name ?? tool.type)).toEqual(["lookup_openzcash", "query_openzcash_ledger", "calculate_openzcash_treasury", "lookup_zcash_zips", "query_project_history", "query_project_activity", "query_zcash_analytics", "read_grant_application", "request_external_research"]);
    expect(JSON.stringify(tools)).not.toContain("fetch");
    expect(mocks.create.mock.calls[0][0]).not.toHaveProperty("webFetch");
    expect(metrics.webFetchCalls).toBe(0);
  });
});
