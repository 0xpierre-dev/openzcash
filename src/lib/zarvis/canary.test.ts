import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ client: vi.fn(), create: vi.fn(), lookup: vi.fn(), ledger: vi.fn(), zip: vi.fn(), getDb: vi.fn() }));
vi.mock("openai", async (original) => ({ ...await original<object>(), default: class { constructor() { mocks.client(); } responses = { create: mocks.create }; } }));
vi.mock("./config", () => ({ zarvisConfig: () => ({ provider: "xai", apiKey: "unit-test-not-a-key", model: "grok-4.7", webSearch: true }) }));
vi.mock("./data", async original => ({ ...await original<object>(), lookupPublicData: mocks.lookup }));
vi.mock("./ledger", async original => ({ ...await original<object>(), queryLedger: mocks.ledger }));
vi.mock("./zips", async original => ({ ...await original<object>(), getZipCorpus: mocks.zip }));
vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
import { CANARY_CASES, runCanary } from "./canary";
import { bundledZipCorpus } from "./knowledge";
import { links } from "./data";
import { metricsSnapshot, resetMetricsForTests } from "./metrics";
async function* events(text: string) {
  yield { type: "response.output_text.delta", delta: text };
  yield { type: "response.completed", response: { status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] }], usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 0 }, output_tokens: 20 } } };
}
const publicData = () => ({ content: JSON.stringify({ data: {
  quote: { usd: 100, quotedAt: new Date().toISOString(), stale: false },
  funds: { zcg: { zec: 50, cashUsd: 1000, snapshotAt: "2026-09-16", importedAt: new Date().toISOString(), updatesRequired: true }, lockbox: { estimatedZec: 80, estimateThroughBlock: 3500000, sourceAnchorBlock: 3400000, sourceAnchorDate: "2026-09-16", importedAt: new Date().toISOString(), updatesRequired: false } },
  price: { cents: 10000, quotedAt: new Date().toISOString(), stale: false },
} }), source: { title: "Public data", url: "https://openzcash.org/lockbox", retrievedAt: new Date().toISOString() } });
beforeEach(() => {
  vi.clearAllMocks(); resetMetricsForTests();
  mocks.getDb.mockImplementation(() => { throw new Error("no database in unit tests"); });
  mocks.create.mockImplementation(() => { throw new Error("UNEXPECTED_BILLED_CALL"); });
  mocks.zip.mockResolvedValue({ corpus: { ...bundledZipCorpus, retrievedAt: new Date().toISOString() }, stale: false });
  mocks.lookup.mockImplementation(async (args: { topic: keyof typeof links }) => ({ ...publicData(), source: { title: `OpenZcash · ${args.topic}`, url: `https://openzcash.org${links[args.topic]}`, retrievedAt: new Date().toISOString() } }));
});
describe("Zarvis canary", () => {
  it("passes all four zero-cost starter checks through the real local pipeline without touching the provider", async () => {
    const result = await runCanary(new AbortController().signal);
    expect(result.ok).toBe(true); expect(result.failed).toBe(0); expect(result.passed).toBe(4); expect(result.failedCases).toEqual([]);
    expect(result.cases.map((c) => c.id)).toEqual(CANARY_CASES.map((c) => c.id));
    for (const c of result.cases) expect(c).toMatchObject({ ok: true, route: "local", errorClass: null }); 
    expect(result.cases.every((c) => c.sources > 0)).toBe(true);
    expect(mocks.client).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/What is|ZIP 317|Explain/);
    expect(metricsSnapshot().completed).toBe(0);
  });
  it("fails the data-backed checks when the public readers return no evidence, still without a paid call", async () => {
    mocks.lookup.mockResolvedValue({ content: JSON.stringify({ error: "Public data temporarily unavailable." }) });
    const result = await runCanary(new AbortController().signal);
    expect(result.ok).toBe(false); expect(result.failedCases).toEqual(["treasuries", "price"]); expect(result.passed).toBe(2);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("reports a class, not a message, when a check throws", async () => {
    mocks.zip.mockRejectedValue(new Error("PUBLIC_READ_TIMEOUT"));
    const result = await runCanary(new AbortController().signal);
    expect(result.cases.find((c) => c.id === "zip")).toMatchObject({ ok: false, errorClass: "public_read_timeout", route: null });
    expect(JSON.stringify(result)).not.toContain("PUBLIC_READ_TIMEOUT with");
  });
  it("only calls the provider for the optional paid case and records it in the metrics", async () => {
    mocks.create.mockImplementation(async () => events("The Dev Fund is split as documented; see the sources."));
    const result = await runCanary(new AbortController().signal, { model: true });
    expect(result.ok).toBe(true); expect(result.cases).toHaveLength(5);
    expect(result.cases.at(-1)).toMatchObject({ id: "model", ok: true, route: "model" });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(metricsSnapshot()).toMatchObject({ completed: 1, model: 1, modelCalls: 1 });
  });
  it("classifies a provider failure in the paid case", async () => {
    mocks.create.mockImplementation(async () => { throw Object.assign(new Error("503 provider body"), { status: 503 }); });
    const result = await runCanary(new AbortController().signal, { model: true });
    expect(result.cases.at(-1)).toMatchObject({ id: "model", ok: false, errorClass: "provider_http_5xx" });
    expect(metricsSnapshot().failed).toBe(1);
  });
});
