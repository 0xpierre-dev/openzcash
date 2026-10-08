import "server-only";
import type { Response as OpenAIResponse, ResponseInputItem, ResponseCreateParamsStreaming, Tool } from "openai/resources/responses/responses";
import type { ProviderConfig } from "./config";
import type { AnswerPlan } from "./depth";
import { systemPrompt } from "./prompt";
import { providerClient, providerOptions, providerSearchTool } from "./provider";
import { renderResponse } from "./answer";
import { deltaSink, type Conversation, type RoundOptions, type RoundResult } from "./engine";

const ECHOED_AFTER_TOOLS = ["message", "reasoning", "function_call", "web_search_call"];
const ECHOED_AFTER_ANSWER = ["message", "reasoning"];
/** The Responses API conversation (OpenAI and xAI): a flat input list, store: false, encrypted reasoning and tool ids echoed as returned. */
export function createResponsesConversation(config: ProviderConfig, plan: AnswerPlan): Conversation {
  const client = providerClient(config, plan.providerTimeoutMs);
  const input: ResponseInputItem[] = [];
  let pending: OpenAIResponse | undefined;
  // A tool round echoes everything it produced before its outputs; an answer round continuing into a repair echoes only its message and reasoning items.
  const flush = () => {
    if (!pending) return;
    const kinds = pending.output.some((item) => item.type === "function_call") ? ECHOED_AFTER_TOOLS : ECHOED_AFTER_ANSWER;
    for (const item of pending.output) if (kinds.includes(item.type)) input.push(item as ResponseInputItem);
    pending = undefined;
  };
  async function round({ tools, webSearch, effort, maxOutputTokens, streaming, signal, emit }: RoundOptions): Promise<RoundResult> {
    flush();
    const parameters: ResponseCreateParamsStreaming & { max_tool_calls?: number; max_turns?: number } = {
      model: config.model, instructions: systemPrompt(plan.depth), input: [...input], tools: [...tools, ...(webSearch ? [providerSearchTool(config, webSearch)] : [])] as Tool[],
      parallel_tool_calls: true, max_output_tokens: maxOutputTokens,
      ...providerOptions(config, effort), store: false, stream: true,
    };
    const stream = await client.responses.create(parameters, { signal });
    const sink = deltaSink(streaming, emit);
    let result: OpenAIResponse | undefined;
    for await (const event of stream) {
      signal.throwIfAborted();
      if (event.type === "response.output_text.delta") sink.push(event.delta);
      if (event.type === "response.web_search_call.in_progress") emit({ type: "status", message: "Checking Zcash sources…" });
      if (event.type === "response.completed") result = event.response;
      if (event.type === "response.failed" || event.type === "response.incomplete" || event.type === "error") throw new Error("INCOMPLETE_RESPONSE");
    }
    if (!result || result.status !== "completed") throw new Error("INCOMPLETE_RESPONSE");
    pending = result;
    const usage = result.usage;
    return {
      ...renderResponse(result),
      calls: result.output.filter((item) => item.type === "function_call").map((call) => ({ id: call.call_id, name: call.name, arguments: call.arguments })),
      searches: result.output.filter((item) => item.type === "web_search_call").length,
      usage: { inputTokens: usage?.input_tokens ?? 0, cachedInputTokens: usage?.input_tokens_details?.cached_tokens ?? 0, cacheWriteTokens: 0, outputTokens: usage?.output_tokens ?? 0, reported: Boolean(usage) },
      streamed: sink.streamed,
    };
  }
  return {
    addEvidence(text) { input.push({ role: "developer", content: text }); },
    addMessages(messages) { input.push(...messages.map(({ role, content }) => ({ role, content }))); },
    note(text) { flush(); input.push({ role: "developer", content: text }); },
    toolResult(callId, content) { flush(); input.push({ type: "function_call_output", call_id: callId, output: content }); },
    round,
  };
}
