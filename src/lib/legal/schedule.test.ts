import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./collector", () => ({ collectLegalDaily: vi.fn() }));
import { createLegalSchedule, legalCollectionDay, LEGAL_SCHEDULE_CHECK_MS, LEGAL_SCHEDULE_FIRST_RUN_MS } from "./schedule";

const outcome = { ok: true, outcome: "collected" as const, day: "2026-10-05", nextRetryAt: null, sources: [] };
const initialTime = Date.parse("2026-10-05T12:00:00Z");
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(initialTime); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("Privacy & Policy daily schedule", () => {
  it("uses the São Paulo day at UTC and year boundaries", () => {
    expect(legalCollectionDay(Date.parse("2026-10-05T02:59:59Z"))).toBe("2026-10-04");
    expect(legalCollectionDay(new Date("2026-10-05T03:00:00Z"))).toBe("2026-10-05");
    expect(legalCollectionDay(Date.parse("2027-01-01T02:00:00Z"))).toBe("2026-12-31");
  });

  it("checks after startup and periodically so a missed day or retry can be collected", async () => {
    const collect = vi.fn().mockResolvedValue(outcome);
    const report = vi.fn();
    const schedule = createLegalSchedule({ collect, report });
    expect(schedule.start()).toBe(true);
    expect(schedule.start()).toBe(true);
    expect(vi.getTimerCount()).toBe(2);
    await vi.advanceTimersByTimeAsync(LEGAL_SCHEDULE_FIRST_RUN_MS - 1);
    expect(collect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(collect).toHaveBeenCalledWith({ day: "2026-10-05", now: "2026-10-05T12:00:30.000Z", trigger: "scheduled" });
    expect(report).toHaveBeenCalledWith(outcome);
    await vi.advanceTimersByTimeAsync(LEGAL_SCHEDULE_CHECK_MS - LEGAL_SCHEDULE_FIRST_RUN_MS);
    expect(collect).toHaveBeenCalledTimes(2);
    schedule.stop();
    await vi.advanceTimersByTimeAsync(LEGAL_SCHEDULE_CHECK_MS);
    expect(collect).toHaveBeenCalledTimes(2);
  });

  it("leaves durable success and retry decisions to the collector, including across midnight", async () => {
    const collect = vi.fn()
      .mockResolvedValueOnce({ ...outcome, outcome: "already-collected", day: "2026-10-04" })
      .mockResolvedValueOnce({ ...outcome, ok: false, outcome: "partial", nextRetryAt: "2026-10-05T04:00:00Z" })
      .mockResolvedValueOnce({ ...outcome, ok: false, outcome: "retry-later", nextRetryAt: "2026-10-05T04:00:00Z" })
      .mockResolvedValueOnce(outcome);
    const schedule = createLegalSchedule({ collect });
    vi.setSystemTime(new Date("2026-10-05T02:59:59Z"));
    expect((await schedule.execute()).outcome).toBe("already-collected");
    vi.setSystemTime(new Date("2026-10-05T03:00:00Z"));
    expect((await schedule.execute()).outcome).toBe("partial");
    expect((await schedule.execute()).outcome).toBe("retry-later");
    vi.setSystemTime(new Date("2026-10-05T04:00:00Z"));
    expect((await schedule.execute()).outcome).toBe("collected");
    expect(collect.mock.calls.map(([input]) => input.day)).toEqual(["2026-10-04", "2026-10-05", "2026-10-05", "2026-10-05"]);
  });

  it("shares a pending collection between the schedule and authenticated trigger", async () => {
    let finish!: (value: typeof outcome) => void;
    const collect = vi.fn().mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const schedule = createLegalSchedule({ collect });
    const first = schedule.execute("scheduled");
    const second = schedule.execute("cron");
    expect(first).toBe(second);
    await Promise.resolve();
    expect(collect).toHaveBeenCalledTimes(1);
    finish(outcome);
    await first;
    await schedule.execute("cron");
    expect(collect).toHaveBeenCalledTimes(2);
    expect(collect.mock.calls[1][0].trigger).toBe("cron");
  });

  it("honors the preview pause before creating timers or starting any collection", async () => {
    vi.stubEnv("DISABLE_AUTO_REFRESH", "true");
    const collect = vi.fn();
    const schedule = createLegalSchedule({ collect });
    expect(schedule.start()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(await schedule.execute("cron")).toEqual({ ok: true, outcome: "disabled", day: "2026-10-05" });
    expect(collect).not.toHaveBeenCalled();
  });

  it("checks the pause again on later ticks instead of capturing it only at boot", async () => {
    const collect = vi.fn().mockResolvedValue(outcome);
    const schedule = createLegalSchedule({ collect });
    schedule.start();
    vi.stubEnv("DISABLE_AUTO_REFRESH", "true");
    await vi.advanceTimersByTimeAsync(LEGAL_SCHEDULE_CHECK_MS);
    expect(collect).not.toHaveBeenCalled();
    vi.stubEnv("DISABLE_AUTO_REFRESH", "false");
    await vi.advanceTimersByTimeAsync(LEGAL_SCHEDULE_CHECK_MS);
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it("contains collector errors, releases the in-flight guard and retries on a later tick", async () => {
    const collect = vi.fn().mockRejectedValueOnce(new Error("private-db-secret")).mockResolvedValue(outcome);
    const report = vi.fn();
    const schedule = createLegalSchedule({ collect, report });
    schedule.start();
    await vi.advanceTimersByTimeAsync(LEGAL_SCHEDULE_FIRST_RUN_MS);
    expect(report).toHaveBeenCalledWith({ ok: false, outcome: "unavailable", day: "2026-10-05" });
    expect(JSON.stringify(report.mock.calls)).not.toContain("private-db-secret");
    await vi.advanceTimersByTimeAsync(LEGAL_SCHEDULE_CHECK_MS);
    expect(collect).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenLastCalledWith(outcome);
  });
});
