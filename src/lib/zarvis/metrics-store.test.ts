import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { dailyMetrics, feedbackReasons, flushDaily, latestCanary, percentile, queueDaily, queueFeedbackReason, recordCanary, resetStoreForTests, spendTodayUsd, storeState } from "./metrics-store";

type Call = { method: string; args: unknown[] };
type Chain = Record<string, unknown>;
type Tx = { execute: () => Promise<void>; insert: () => Chain; select: () => Chain };
function fakeDb(rows: unknown[] = [], calls: Call[] = []) {
  const chain = (result: unknown[]) => {
    const c: Record<string, unknown> = { then: (resolve: (value: unknown) => void) => resolve(result) };
    for (const method of ["values", "onConflictDoUpdate", "from", "where", "orderBy", "limit"]) c[method] = (...args: unknown[]) => { calls.push({ method, args }); return c; };
    return c;
  };
  const tx: Tx = { execute: async () => { calls.push({ method: "execute", args: [] }); }, insert: () => chain([]), select: () => chain(rows) };
  return { transaction: async (fn: (tx: Tx) => Promise<unknown>) => fn(tx) };
}
const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
beforeEach(() => { resetStoreForTests(); warn.mockClear(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-28T23:59:30.000Z")); });
afterEach(() => { vi.useRealTimers(); });

describe("Durable daily metrics", () => {
  it("merges deltas per UTC day and route and upserts them once, in key order", async () => {
    const calls: Call[] = []; mocks.getDb.mockReturnValue(fakeDb([], calls));
    queueDaily("rejected", { quota: 1 });
    queueDaily("model", { completed: 1, modelCalls: 2, inputTokens: 100, estimatedUsd: 0.02, latencyMs: 4_000 });
    queueDaily("model", { failed: 1, modelCalls: 1, latencyMs: 12_000 });
    queueDaily("local", { completed: 1, latencyMs: 50 });
    expect(storeState().pendingRows).toBe(3);
    expect(await flushDaily()).toBe(true);
    const inserted = calls.filter((c) => c.method === "values").map((c) => c.args[0] as Record<string, unknown>);
    // Sorted by day|route so concurrent flushes take row locks in the same order.
    expect(inserted.map((row) => row.route)).toEqual(["local", "model", "rejected"]);
    expect(inserted[1]).toMatchObject({ day: "2026-09-28", route: "model", completed: 1, failed: 1, modelCalls: 3, inputTokens: 100, estimatedUsd: 0.02 });
    expect(inserted[1].latency).toEqual([0, 0, 0, 1, 0, 1, 0, 0, 0]);
    expect(inserted[2]).toMatchObject({ day: "2026-09-28", route: "rejected", quota: 1, completed: 0 });
    expect(calls.filter((c) => c.method === "onConflictDoUpdate")).toHaveLength(3);
    expect(calls[0].method).toBe("execute");
    expect(storeState()).toMatchObject({ pendingRows: 0, writeFailures: 0 });
  });
  it("flushes needs-work reasons per day, route and reason in the same transaction, counts only", async () => {
    const calls: Call[] = []; mocks.getDb.mockReturnValue(fakeDb([], calls));
    queueFeedbackReason("model", "wrong_figure"); queueFeedbackReason("model", "wrong_figure"); queueFeedbackReason("local", "outdated");
    expect(storeState().pendingRows).toBe(2);
    expect(await flushDaily()).toBe(true);
    const inserted = calls.filter((c) => c.method === "values").map((c) => c.args[0] as Record<string, unknown>);
    expect(inserted).toEqual([{ day: "2026-09-28", route: "local", reason: "outdated", count: 1 }, { day: "2026-09-28", route: "model", reason: "wrong_figure", count: 2 }]);
    expect(storeState().pendingRows).toBe(0);
    mocks.getDb.mockReturnValue(fakeDb([{ day: "2026-09-28", route: "model", reason: "wrong_figure", count: 2 }]));
    expect(await feedbackReasons(14)).toEqual([{ day: "2026-09-28", route: "model", reason: "wrong_figure", count: 2 }]);
  });
  it("renders an upsert that adds counters and latency buckets element-wise in array order", async () => {
    const calls: Call[] = []; mocks.getDb.mockReturnValue(fakeDb([], calls));
    queueDaily("model", { completed: 1, estimatedUsd: 0.01, latencyMs: 100 });
    await flushDaily();
    const { set } = calls.find((c) => c.method === "onConflictDoUpdate")!.args[0] as { set: Record<string, SQL> };
    const render = (fragment: SQL) => new PgDialect().sqlToQuery(fragment).sql;
    expect(render(set.completed)).toBe('"zarvis_metrics_daily"."completed" + excluded.completed');
    expect(render(set.inputTokens)).toBe('"zarvis_metrics_daily"."input_tokens" + excluded.input_tokens');
    expect(render(set.estimatedUsd)).toBe('"zarvis_metrics_daily"."estimated_usd" + excluded.estimated_usd');
    expect(render(set.latency)).toBe('array(select coalesce(a, 0) + coalesce(b, 0) from unnest("zarvis_metrics_daily"."latency", excluded.latency) with ordinality as u(a, b, i) order by i)');
  });
  it("never throws when storage is unavailable, keeps the spend estimate in process and logs only the error class once", async () => {
    mocks.getDb.mockImplementation(() => { throw new Error("connection string with password"); });
    queueDaily("model", { completed: 1, estimatedUsd: 3 });
    expect(spendTodayUsd()).toBe(3);
    await expect(flushDaily()).resolves.toBe(false);
    expect(storeState().writeFailures).toBe(1);
    expect(spendTodayUsd()).toBe(3);
    await vi.advanceTimersByTimeAsync(0);
    expect(storeState().readFailures).toBeGreaterThanOrEqual(1);
    queueDaily("model", { completed: 1 }); await flushDaily();
    expect(storeState().writeFailures).toBe(2);
    const lines = warn.mock.calls.map((call) => JSON.parse(String(call[0])));
    expect(lines).toEqual([{ event: "zarvis.store", op: "read", errorClass: "Error" }, { event: "zarvis.store", op: "write", errorClass: "Error" }]);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("password");
  });
  it("flushes automatically a few seconds after the first delta", async () => {
    const calls: Call[] = []; mocks.getDb.mockReturnValue(fakeDb([], calls));
    queueDaily("local", { completed: 1, latencyMs: 100 });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(calls.some((c) => c.method === "values")).toBe(true); expect(storeState().pendingRows).toBe(0);
  });
  it("adds the durable total for today to unflushed usage and resets at the UTC day change", async () => {
    mocks.getDb.mockReturnValue(fakeDb([{ usd: "1.5" }]));
    expect(spendTodayUsd()).toBe(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(spendTodayUsd()).toBe(1.5);
    queueDaily("model", { completed: 1, estimatedUsd: 0.25 });
    expect(spendTodayUsd()).toBe(1.75);
    await flushDaily(); expect(spendTodayUsd()).toBe(1.75);
    vi.setSystemTime(new Date("2026-09-29T00:00:00.000Z"));
    mocks.getDb.mockReturnValue(fakeDb([{ usd: 0 }]));
    expect(spendTodayUsd()).toBe(0);
  });
  it("reads the last fourteen days with percentile approximations", async () => {
    mocks.getDb.mockReturnValue(fakeDb([{ day: "2026-09-28", route: "model", completed: 4, latency: [0, 1, 2, 1, 0, 0, 0, 0, 0] }]));
    const rows = await dailyMetrics(14);
    expect(rows[0]).toMatchObject({ day: "2026-09-28", p50BucketUpperMs: 3000, p95BucketUpperMs: 5000 });
    expect(percentile([0, 0, 0, 0, 0, 0, 0, 0, 3], 0.5)).toBeNull(); expect(percentile([], 0.5)).toBeNull();
  });
  it("stores canary runs and serves the latest one from a short cache", async () => {
    const calls: Call[] = []; mocks.getDb.mockReturnValue(fakeDb([], calls));
    const run = { at: "2026-09-28T23:00:00.000Z", ok: false, passed: 3, failed: 1, ms: 900, failedCases: ["price"] };
    expect(await recordCanary(run)).toBe(true);
    expect(calls.find((c) => c.method === "values")?.args[0]).toMatchObject({ ok: false, failed: 1, failedCases: ["price"] });
    expect(await latestCanary()).toEqual(run);
    resetStoreForTests();
    mocks.getDb.mockReturnValue(fakeDb([{ ranAt: new Date("2026-09-28T22:00:00.000Z"), ok: true, passed: 4, failed: 0, ms: 500, failedCases: [] }]));
    expect(await latestCanary()).toMatchObject({ at: "2026-09-28T22:00:00.000Z", ok: true });
    mocks.getDb.mockImplementation(() => { throw new Error("down"); });
    expect(await latestCanary()).toMatchObject({ ok: true });
    vi.advanceTimersByTime(61_000);
    expect(await latestCanary()).toMatchObject({ ok: true }); expect(storeState().readFailures).toBe(1);
  });
});
