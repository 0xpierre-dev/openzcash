import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ client: vi.fn(), create: vi.fn() }));
vi.mock("./provider", () => ({ providerClient: mocks.client, providerOptions: () => ({}), providerSearchTool: () => ({ type: "web_search" }) }));
import { generateAnswer } from "./openai";
import { clearPublicCache } from "./public-cache";
import { NOW, supplyFixture, chainFixture, zecblockFixture, monthlyFixture } from "./fixtures/analytics";
import type { ZarvisEvent } from "./types";
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(NOW); clearPublicCache();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const monthly = monthlyFixture();
    if (url.includes("from=1785542400")) {
      monthly.points[0].periodStart = 1785542400; monthly.points[0].topHeight = 3467590;
      monthly.points[0].balances.ironwood += 200000000;
    }
    return new Response(JSON.stringify(url.includes("/analytics/monthly") ? monthly : url.endsWith("/v1/supply") ? supplyFixture() : url.endsWith("/v1/chain") ? chainFixture() : zecblockFixture()), { headers: { "content-type": "application/json" } });
  }));
  mocks.client.mockImplementation(() => { throw new Error("Unexpected model request"); });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
function disagreeingSupply(hashAvailable: boolean) {
  const zecblock = zecblockFixture();
  zecblock.data.valuePools.find(p => p.id === "transparent")!.chainValueZat = "49000000000";
  zecblock.data.valuePools.find(p => p.id === "orchard")!.chainValueZat = "11000000000";
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/v1/chain") && !hashAvailable) return new Response(null, { status: 503 });
    return new Response(JSON.stringify(url.endsWith("/v1/supply") ? supplyFixture() : url.endsWith("/v1/chain") ? chainFixture() : zecblock), { headers: { "content-type": "application/json" } });
  }));
}
describe("Analytics through the real Zarvis orchestrator", () => {
  it.each([
    ["How much ZEC is in shielded pools?", "Supply at block", 3],
    ["Qual é a oferta circulante de ZEC?", "Oferta no bloco", 3],
    ["¿Cuál es la oferta total de Zcash?", "Oferta en el bloque", 3],
    ["Mostre atividade mensal de setembro 2026.", "Atividade da rede", 1],
    ["Compare monthly activity for last month.", "August 2026 → September 2026", 2],
  ])("answers without AI calls and preserves source metadata: %s", async (question, label, sourceCount) => {
    const events: ZarvisEvent[] = [];
    const metrics = await generateAnswer([{ role: "user", content: question }], new AbortController().signal, event => events.push(event), {}, "auto", { localOnly: true });
    expect(metrics).toMatchObject({ route: "local", modelCalls: 0 });
    expect(mocks.client).not.toHaveBeenCalled();
    expect(events.find(e => e.type === "replace")).toMatchObject({ text: expect.stringContaining(label) });
    expect(events.at(-1)).toMatchObject({ type: "done", sources: expect.any(Array), provenance: { route: "local" } });
    const done = events.at(-1); if (done?.type === "done") expect(done.sources).toHaveLength(sourceCount);
  });
  it("exposes and executes the registered analytics tool for model-assisted questions", async () => {
    mocks.client.mockReturnValue({ responses: { create: mocks.create } });
    const complete = (output: unknown[]) => (async function* () { yield { type: "response.completed", response: { status: "completed", output, usage: { input_tokens: 100, output_tokens: 30 } } }; })();
    mocks.create.mockResolvedValueOnce(complete([{ type: "function_call", name: "query_zcash_analytics", call_id: "analytics-1", arguments: JSON.stringify({ metric: "monthly_activity", month: "2026-09" }) }]));
    mocks.create.mockResolvedValueOnce(complete([{ type: "message", content: [{ type: "output_text", text: "Fully shielded transactions represent 30%. Net flow was -2 ZEC.", annotations: [] }] }]));
    const events: ZarvisEvent[] = [];
    const metrics = await generateAnswer([{ role: "user", content: "Explain the difference between fully shielded and pool-touching transaction shares for September 2026." }], new AbortController().signal, event => events.push(event));
    expect(metrics).toMatchObject({ route: "model", modelCalls: 2 });
    expect(metrics.groundingFallbacks ?? 0).toBe(0);
    expect(mocks.create.mock.calls[0][0].tools).toEqual(expect.arrayContaining([expect.objectContaining({ name: "query_zcash_analytics" })]));
    const result = mocks.create.mock.calls[1][0].input.find((i: { type?: string; call_id?: string }) => i.type === "function_call_output" && i.call_id === "analytics-1");
    expect(JSON.parse(result.output).data.monthly).toMatchObject({ fullyShielded: { percent: 30 }, poolTouching: { percent: 50 } });
    expect(events.at(-1)).toMatchObject({ type: "done", sources: expect.arrayContaining([expect.objectContaining({ title: "ShieldedScan · 2026-09 chain activity" })]) });
  });
  it.each([true, false])("withholds direct supply amounts when explorers disagree (primary hash available: %s)", async hashAvailable => {
    disagreeingSupply(hashAvailable);
    const events: ZarvisEvent[] = [];
    const metrics = await generateAnswer([{ role: "user", content: "How much ZEC is in shielded pools?" }], new AbortController().signal, event => events.push(event), {}, "auto", { localOnly: true });
    expect(metrics).toMatchObject({ route: "local", modelCalls: 0 });
    expect(events.find(e => e.type === "replace")).toMatchObject({ text: expect.stringContaining("could not establish one verified balance") });
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it.each([true, false])("rejects both conflicting model figures and repair figures (primary hash available: %s)", async hashAvailable => {
    disagreeingSupply(hashAvailable);
    mocks.client.mockReturnValue({ responses: { create: mocks.create } });
    const complete = (output: unknown[]) => (async function* () { yield { type: "response.completed", response: { status: "completed", output, usage: { input_tokens: 100, output_tokens: 30 } } }; })();
    const message = (text: string) => [{ type: "message", content: [{ type: "output_text", text, annotations: [] }] }];
    mocks.create.mockResolvedValueOnce(complete([{ type: "function_call", name: "query_zcash_analytics", call_id: "supply-conflict", arguments: JSON.stringify({ metric: "supply", month: null }) }]));
    mocks.create.mockResolvedValueOnce(complete(message("The shielded supply is 450 ZEC.")));
    mocks.create.mockResolvedValueOnce(complete(message("The shielded supply is 460 ZEC.")));
    const events: ZarvisEvent[] = [];
    const metrics = await generateAnswer([{ role: "user", content: "Compare the explorers' current supply readings and explain any disagreement." }], new AbortController().signal, event => events.push(event));
    const result = mocks.create.mock.calls[1][0].input.find((i: { type?: string; call_id?: string }) => i.type === "function_call_output" && i.call_id === "supply-conflict");
    expect(JSON.parse(result.output).data).toMatchObject({ status: "mismatch", selected: null });
    expect(metrics).toMatchObject({ route: "model", modelCalls: 3, repairRounds: 1, groundingFallbacks: 1 });
    expect(events.find(e => e.type === "replace")).toMatchObject({ text: expect.stringContaining("cannot present an unverified amount") });
    expect(events.filter(e => e.type === "replace" || e.type === "delta").map(e => e.text).join("")).not.toMatch(/450|460/);
  });
});
