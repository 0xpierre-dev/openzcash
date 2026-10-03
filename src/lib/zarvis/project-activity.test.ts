import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ read: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/project-history/data", () => ({ readMonthlyProjectActivity: mocks.read }));
vi.mock("openai", async original => ({ ...await original<object>(), default: class { responses = { create: mocks.create }; } }));
vi.mock("./config", () => ({ zarvisConfig: () => ({ provider: "openai", apiKey: "unit-test-placeholder", model: "test-model", webSearch: false }) }));
import { projectActivityMonth, lookupProjectActivity, projectActivityAnswer } from "./project-activity";
import { monthlyProjectActivity } from "@/lib/project-history/activity";
import { generateAnswer } from "./openai";
import { isFinancialEvidence, numericFacts } from "./grounding";
import type { ZarvisEvent } from "./types";
import { GET } from "@/app/api/project-activity/route";

const now = new Date("2026-10-02T12:00:00Z");
const finance = { payments: [], proposals: [], paymentsAvailable: true, proposalsAvailable: true, importedAt: now.toISOString() };
const screenshotQuestion = "Quais projetos financiados entregaram atualizações neste mês, quanto receberam e quais evidências temos dos resultados?";
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now); vi.clearAllMocks();
  mocks.read.mockImplementation(async month => monthlyProjectActivity([], finance, month, now));
  mocks.create.mockRejectedValue(new Error("Unexpected provider request"));
});
afterEach(() => vi.useRealTimers());
describe("monthly project answers", () => {
  it.each([
    [screenshotQuestion, "2026-10"],
    ["Which funded projects shipped updates last month and what evidence supports them?", "2026-09"],
    ["Quais projetos financiados tiveram releases em setembro de 2026?", "2026-09"],
    ["Which funded projects have updates in 2026-09?", "2026-09"],
    ["Que proyectos financiados publicaron actualizaciones este mes?", "2026-10"],
  ])("resolves %s to %s and avoids the external model", async (question, month) => {
    expect(projectActivityMonth(question, now)).toBe(month);
    const events: ZarvisEvent[] = [];
    const metrics = await generateAnswer([{ role: "user", content: question }], new AbortController().signal, e => events.push(e), {}, "quick", { localOnly: true });
    expect(metrics).toMatchObject({ route: "local", modelCalls: 0 });
    expect(mocks.read).toHaveBeenCalledWith(month);
    expect(events.find(e => e.type === "replace")).toMatchObject({ text: expect.stringContaining(month) });
  });
  it.each([
    "Compare funded projects and updates in September and October 2026.",
    "Which funded projects shipped updates between September 1 and 10, 2026?",
    "Which funded projects shipped updates in 2026-11?",
    "Which funded projects shipped updates since September?",
    "Which funded projects have evidence of impact this month?",
    "Which funded ZCG projects shipped updates last month?",
    "Which funded projects shipped wallet updates last month?",
    "Which funded projects shipped updates this month and explain why others failed?",
    "Which funded projects shipped updates?",
  ])("leaves unsupported scope to research: %s", question => expect(projectActivityMonth(question, now)).toBeUndefined());
  it("rolls the previous month across years", () => expect(projectActivityMonth("Which funded projects shipped updates last month?", new Date("2027-01-01"))).toBe("2026-12"));
  it("keeps partial October distinct and labels an unavailable ledger instead of zero", async () => {
    let result = await lookupProjectActivity({ month: "2026-10" }, new AbortController().signal);
    expect(projectActivityAnswer(result, "pt")).toContain("parcial até 2026-10-02 UTC");
    expect(projectActivityAnswer(result, "pt")).not.toContain("2026-09");
    mocks.read.mockResolvedValue(monthlyProjectActivity([], { ...finance, paymentsAvailable: false }, "2026-10", now));
    result = await lookupProjectActivity({ month: "2026-10" }, new AbortController().signal);
    expect(projectActivityAnswer(result, "pt")).toContain("indisponível");
    expect(projectActivityAnswer(result, "pt")).not.toContain("0 lançamentos");
  });
  it("feeds computed monetary amounts to the existing numeric guard", async () => {
    mocks.read.mockResolvedValue({ ...monthlyProjectActivity([], finance, "2026-09", now), ledger: { paidEntries: 1, budgetUsdCents: "12345", recordedZecZat: "100000000", missingUsd: 0, missingZec: 0, programs: [] } });
    const result = await lookupProjectActivity({ month: "2026-09" }, new AbortController().signal);
    expect(isFinancialEvidence([result])).toBe(true);
    expect(numericFacts([result])).toContainEqual({ unit: "USD", value: 123.45 });
    expect(numericFacts([result])).toContainEqual({ unit: "ZEC", value: 1 });
  });
  it("validates API filters before finance reads and disables HTTP caching", async () => {
    for (const query of ["", "?month=2026-13", "?month=2026-11"]) expect((await GET(new Request(`https://example.org/api/project-activity${query}`))).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
    const result = await GET(new Request("https://example.org/api/project-activity?month=2026-09"));
    expect(result.status).toBe(200); expect(result.headers.get("Cache-Control")).toBe("no-store");
    mocks.read.mockResolvedValue(monthlyProjectActivity([], { ...finance, paymentsAvailable: false }, "2026-09", now));
    expect((await GET(new Request("https://example.org/api/project-activity?month=2026-09"))).status).toBe(503);
  });
  it("dispatches the monthly tool for a model analysis", async () => {
    async function* stream(output: unknown[]) { yield { type: "response.completed", response: { status: "completed", output, usage: { input_tokens: 10, output_tokens: 10 } } }; }
    mocks.create.mockResolvedValueOnce(stream([{ type: "function_call", name: "query_project_activity", call_id: "activity-call", arguments: JSON.stringify({ month: "2026-09" }) }]))
      .mockResolvedValueOnce(stream([{ type: "message", role: "assistant", content: [{ type: "output_text", text: "The work corpus is incomplete. [Records](https://openzcash.org/api/project-activity?month=2026-09)", annotations: [] }] }]));
    await generateAnswer([{ role: "user", content: "Assess the evidence for projects last month." }], new AbortController().signal, () => {});
    expect(mocks.read).toHaveBeenCalledWith("2026-09");
    expect(mocks.create.mock.calls[1][0].input).toContainEqual(expect.objectContaining({ type: "function_call_output", call_id: "activity-call", output: expect.stringContaining("monthly_project_activity") }));
  });
  it("preserves aborts and rejects invalid tool arguments", async () => {
    expect(JSON.parse((await lookupProjectActivity({ month: "2026-13" }, new AbortController().signal)).content)).toHaveProperty("error");
    const controller = new AbortController(); controller.abort();
    await expect(lookupProjectActivity({ month: "2026-09" }, controller.signal)).rejects.toThrow();
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
