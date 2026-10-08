import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlock, ContentBlockParam, MessageParam, MessageStreamEvent, TextBlockParam, Tool, ToolUnion, WebSearchTool20260318 } from "@anthropic-ai/sdk/resources/messages";
import type { FunctionTool } from "openai/resources/responses/responses";
import type { ProviderConfig } from "./config";
import type { AnswerPlan } from "./depth";
import { ENGINE_INSTRUCTION_NOTE, ENGINE_INSTRUCTION_PREFIX, VISITOR_TEXT_LABEL, systemPrompt } from "./prompt";
import { GROK_SEARCH_DOMAINS } from "./provider";
import type { ResearchScope } from "./research-scope";
import { SEARCH_DOMAINS, safeSourceUrl } from "./sources";
import { IncompleteRound, deltaSink, type Conversation, type RoundOptions, type RoundResult, type RoundUsage } from "./engine";
import type { ZarvisSource } from "./types";
export { ENGINE_INSTRUCTION_PREFIX, VISITOR_TEXT_LABEL };

/** A paused server-tool turn is continued at most this many times inside one round, within the round's own time budget. */
const MAX_CONTINUATIONS = 3;
/** Thinking is on by default on the 5.5 models and counts toward max_tokens even with its text omitted; this room keeps the depth's visible budget intact and costs nothing (output rate limits count generated tokens only). */
export const THINKING_HEADROOM = 8_000;
export function anthropicClient(config: Pick<ProviderConfig, "apiKey">, timeout = 50_000) {
  if (!config.apiKey) throw new Error("PROVIDER_NOT_CONFIGURED");
  // Fixed host: never route a credential using a user-supplied URL or the SDK's ANTHROPIC_BASE_URL override.
  return new Anthropic({ apiKey: config.apiKey, baseURL: "https://api.anthropic.com", maxRetries: 0, timeout });
}
/** The function tools keep their Responses definition; only the schema key differs here. strict is not forwarded: Anthropic's strict mode constrains the schema features it accepts. */
const convertTool = (tool: FunctionTool): Tool => ({ name: tool.name, ...(tool.description ? { description: tool.description } : {}), input_schema: tool.parameters as Tool.InputSchema });
/** Direct server-side search (no dynamic filtering), two uses per request, the whole reviewed list for general questions and the topic lists otherwise. */
export function anthropicSearchTool(scope: ResearchScope): WebSearchTool20260318 {
  const domains = scope === "zip" ? ["zips.z.cash"] : scope === "general" ? SEARCH_DOMAINS : GROK_SEARCH_DOMAINS[scope];
  return { type: "web_search_20260318", name: "web_search", allowed_callers: ["direct"], max_uses: 2, allowed_domains: domains };
}
/** Text blocks of one message joined as the fragments they are; each allowlisted web citation becomes a source and, the first time its URL is cited in the message, a markdown link after the text it supports. */
export function renderBlocks(content: ContentBlock[]): { text: string; sources: ZarvisSource[] } {
  const sources = new Map<string, ZarvisSource>();
  const parts: string[] = [];
  for (const block of content) {
    if (block.type !== "text") continue;
    const links: string[] = [];
    for (const citation of block.citations ?? []) {
      if (citation.type !== "web_search_result_location") continue;
      const url = safeSourceUrl(citation.url);
      if (!url || sources.has(url)) continue;
      const title = (citation.title || "Source").replace(/[\[\]\r\n]/g, " ").slice(0, 150) || "Source";
      sources.set(url, { title, url, retrievedAt: new Date().toISOString() });
      links.push(`[${title}](${url})`);
    }
    parts.push(links.length ? `${block.text} ${links.join(" ")}` : block.text);
  }
  return { text: parts.join(""), sources: [...sources.values()] };
}
/** The messages of one round (a paused turn and its continuations) rendered as paragraphs, like the Responses renderer; a URL cited in two of them is listed once. */
function renderTurns(turns: ContentBlock[][]): { text: string; sources: ZarvisSource[] } {
  const rendered = turns.map(renderBlocks);
  return { text: rendered.map((turn) => turn.text).filter(Boolean).join("\n\n"), sources: [...new Map(rendered.flatMap((turn) => turn.sources).map((source) => [source.url, source])).values()] };
}
/** Total input is the sum of the three usage fields; a request without usage leaves the round unpriced. */
function addUsage(usage: RoundUsage, message: Anthropic.Message): RoundUsage {
  const u = message.usage;
  if (!u) return { ...usage, reported: false };
  return { inputTokens: usage.inputTokens + u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), cachedInputTokens: usage.cachedInputTokens + (u.cache_read_input_tokens ?? 0), cacheWriteTokens: usage.cacheWriteTokens + (u.cache_creation_input_tokens ?? 0), outputTokens: usage.outputTokens + u.output_tokens, reported: usage.reported };
}
const searches = (message: Anthropic.Message) => message.usage?.server_tool_use?.web_search_requests ?? 0;
/** A server search Claude called next to a local tool has no result block yet: the API runs it only when the next user message holds nothing but tool results. */
const pendingServerTool = (content: ContentBlock[]) => content.some((block) => block.type === "server_tool_use" && !content.some((other) => other.type === "web_search_tool_result" && other.tool_use_id === block.id));
/** History text never begins with the engine marker: a message that imitates it is labelled, so the note in the system prompt keeps its meaning. */
const historyText = (content: string) => (/^\s*\[openzcash engine instruction\]/i.test(content) ? `${VISITOR_TEXT_LABEL} ${content}` : content);
const assistant = (content: ContentBlock[]): MessageParam => ({ role: "assistant", content: content as ContentBlockParam[] });
/** The user turn under construction: tool results first, then application notes, as the API requires. */
type UserTurn = { results: ContentBlockParam[]; texts: ContentBlockParam[] };
/**
 * The Messages API conversation: tools and the system prompt form the cached prefix; evidence opens the first user turn as untrusted data;
 * every assistant turn (thinking, tool use, encrypted search results) is echoed exactly as returned before the next user turn.
 * Thinking blocks are bound to `system`, `tools` and the messages before them, so the request is append-only: the tool list is fixed by the
 * first round, a round without tools sends tool_choice none instead of a shorter list, and notes wait while a server search is still owed.
 */
export function createAnthropicConversation(config: ProviderConfig, plan: AnswerPlan): Conversation {
  const client = anthropicClient(config, plan.providerTimeoutMs);
  const system: TextBlockParam[] = [{ type: "text", text: `${systemPrompt(plan.depth)}\n\n${ENGINE_INSTRUCTION_NOTE}`, cache_control: { type: "ephemeral" } }];
  let messages: MessageParam[] = [];
  let pending: ContentBlock[][] = [];
  let turn: UserTurn = { results: [], texts: [] };
  let tools: ToolUnion[] | undefined;
  let awaiting = false;
  /** Consecutive same-role turns merge, so evidence joins the first visitor message and a history that opens with an assistant turn still alternates. */
  const append = (role: MessageParam["role"], blocks: ContentBlockParam[]) => {
    const last = messages.at(-1);
    if (last?.role === role && Array.isArray(last.content)) messages = [...messages.slice(0, -1), { role, content: [...last.content, ...blocks] }];
    else messages = [...messages, { role, content: blocks }];
  };
  /** Each model turn goes back as its own assistant message, exactly as returned; then the user turn built since. While a server search is owed, only the tool results go out and the notes wait for the following turn. */
  const flush = () => {
    messages = [...messages, ...pending.map(assistant)];
    pending = [];
    const blocks = awaiting ? turn.results : [...turn.results, ...turn.texts];
    if (blocks.length) append("user", blocks);
    turn = { results: [], texts: awaiting ? turn.texts : [] };
  };
  async function round({ tools: offered, webSearch, effort, maxOutputTokens, streaming, signal, emit }: RoundOptions): Promise<RoundResult> {
    flush();
    const list = (tools ??= [...offered.map(convertTool), ...(webSearch ? [anthropicSearchTool(webSearch)] : [])]);
    // tool_choice is outside the thinking prefix: none turns the fixed list off for the synthesis and repair rounds; it stays unset while a search is owed so the API runs it.
    const choice = offered.length || webSearch || awaiting ? {} : { tool_choice: { type: "none" as const } };
    const request = { model: config.model, max_tokens: maxOutputTokens + THINKING_HEADROOM, output_config: { effort }, system, tools: list, ...choice };
    const sink = deltaSink(streaming, emit);
    const turns: ContentBlock[][] = [];
    let usage: RoundUsage = { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reported: true };
    let searchCount = 0;
    let message: Anthropic.Message;
    if (awaiting) emit({ type: "status", message: "Checking Zcash sources…" });
    for (let attempt = 0; ; attempt++) {
      const stream = client.messages.stream({ ...request, messages: [...messages, ...turns.map(assistant)] }, { signal });
      stream.on("streamEvent", (event: MessageStreamEvent) => { if (event.type === "content_block_start" && event.content_block.type === "server_tool_use") emit({ type: "status", message: "Checking Zcash sources…" }); });
      stream.on("text", (delta: string) => sink.push(delta));
      message = await stream.finalMessage();
      signal.throwIfAborted();
      turns.push(message.content);
      usage = addUsage(usage, message); searchCount += searches(message);
      // A paused server-tool loop continues with the same tools and the paused content re-sent as-is.
      if (message.stop_reason === "pause_turn" && attempt < MAX_CONTINUATIONS) continue;
      if (message.stop_reason === "max_tokens" || message.stop_reason === "model_context_window_exceeded" || message.stop_reason === "pause_turn") throw new IncompleteRound(usage);
      break;
    }
    pending = turns;
    const content = turns.flat();
    awaiting = pendingServerTool(content);
    return {
      ...renderTurns(turns),
      calls: content.filter((block) => block.type === "tool_use").map((block) => ({ id: block.id, name: block.name, arguments: JSON.stringify(block.input) })),
      searches: searchCount, usage, streamed: sink.streamed,
    };
  }
  return {
    fixedTools: true,
    addEvidence(text) { append("user", [{ type: "text", text }]); },
    addMessages(history) { for (const { role, content } of history) append(role, [{ type: "text", text: historyText(content) }]); },
    note(text) { turn = { ...turn, texts: [...turn.texts, { type: "text", text: `${ENGINE_INSTRUCTION_PREFIX} ${text}` }] }; },
    toolResult(callId, content) { turn = { ...turn, results: [...turn.results, { type: "tool_result", tool_use_id: callId, content }] }; },
    round,
  };
}
