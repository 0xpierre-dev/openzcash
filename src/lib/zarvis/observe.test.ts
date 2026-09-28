import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushRejectionLog, logRejection, REJECTION_LOG_WINDOW_MS, resetObserveForTests } from "./observe";
const info = vi.spyOn(console, "info").mockImplementation(() => {});
const lines = () => info.mock.calls.map((call) => JSON.parse(String(call[0])) as Record<string, unknown>);
beforeEach(() => { resetObserveForTests(); info.mockClear(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-28T12:00:00.000Z")); });
afterEach(() => { vi.useRealTimers(); });
describe("Rejection log coalescing", () => {
  it("logs the first rejection per outcome in full and folds a flood into one summary per window", () => {
    for (let i = 0; i < 1_000; i++) logRejection("busy", 2);
    for (let i = 0; i < 3; i++) logRejection("quota", 30);
    logRejection("forbidden", 1);
    expect(lines().map((line) => [line.event, line.outcome])).toEqual([["zarvis.chat", "busy"], ["zarvis.chat", "quota"], ["zarvis.chat", "forbidden"]]);
    expect(lines()[0]).toMatchObject({ route: "rejected", outcome: "busy", ms: 2, estimatedUsd: null, errorClass: null });
    vi.advanceTimersByTime(REJECTION_LOG_WINDOW_MS);
    expect(lines().slice(3)).toEqual([
      { event: "zarvis.rejections", at: "2026-09-28T12:00:10.000Z", outcome: "busy", count: 999, windowMs: 10_000, avgMs: 2 },
      { event: "zarvis.rejections", at: "2026-09-28T12:00:10.000Z", outcome: "quota", count: 2, windowMs: 10_000, avgMs: 30 },
    ]);
    logRejection("busy", 4);
    expect(lines()).toHaveLength(6); expect(lines()[5]).toMatchObject({ event: "zarvis.chat", outcome: "busy" });
  });
  it("prints nothing extra when every outcome was logged in full", () => {
    logRejection("invalid", 1); flushRejectionLog();
    expect(lines()).toHaveLength(1);
    vi.advanceTimersByTime(REJECTION_LOG_WINDOW_MS * 2);
    expect(lines()).toHaveLength(1);
  });
});
