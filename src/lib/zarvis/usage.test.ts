import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
import { zarvisConfig } from "./config";
import { refundZarvisRequest, reserveZarvisRequest } from "./usage";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("ZARVIS_ORIGIN", "http://127.0.0.1:3100");
  vi.stubEnv("ZARVIS_LOCAL_UNLIMITED", "true");
  vi.stubEnv("ZARVIS_QUOTA_PAUSE_UNTIL", "");
  mocks.getDb.mockImplementation(() => { throw new Error("Normal quota storage reached"); });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("Unlimited local Zarvis testing", () => {
  it("allows repeated local requests without reading, resetting or spending quota counters", async () => {
    for (let i = 0; i < 30; i++) {
      expect(await reserveZarvisRequest(new Headers())).toEqual({ allowed: true, retryAfter: 0 });
    }
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it.each(["production", "test"])("keeps normal quota enforcement in %s even if the flag is enabled", async (mode) => {
    vi.stubEnv("NODE_ENV", mode);
    expect(zarvisConfig().unlimitedLocalTesting).toBe(false);
    await expect(reserveZarvisRequest(new Headers())).rejects.toThrow("Normal quota storage reached");
  });

  it.each(["", "false"])("requires an explicit true opt-in, not %s", async (flag) => {
    vi.stubEnv("ZARVIS_LOCAL_UNLIMITED", flag);
    await expect(reserveZarvisRequest(new Headers())).rejects.toThrow("Normal quota storage reached");
  });

  it.each(["", "https://openzcash.org", "http://0.0.0.0:3100", "http://localhost.evil.example", "http://127.0.0.1:3100/not-an-origin", "http://user@127.0.0.1:3100"])("keeps normal quotas for a missing or non-local configured origin: %s", async (origin) => {
    vi.stubEnv("ZARVIS_ORIGIN", origin);
    expect(zarvisConfig().unlimitedLocalTesting).toBe(false);
    await expect(reserveZarvisRequest(new Headers({ "x-forwarded-host": "localhost:3100" }))).rejects.toThrow("Normal quota storage reached");
  });
});


describe("Temporary production launch window", () => {
  const deadline = "2026-09-29T03:00:00.000Z";
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ZARVIS_QUOTA_PAUSE_UNTIL", deadline);
    vi.stubEnv("ZARVIS_DAILY_REQUEST_LIMIT", "100");
    vi.stubEnv("ZARVIS_HOURLY_REQUEST_LIMIT", "30");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T14:00:00.000Z"));
  });

  it("admits more than the ordinary global and network caps without changing stored counters", async () => {
    for (let i = 0; i < 101; i++) {
      expect(await reserveZarvisRequest(new Headers())).toEqual({ allowed: true, retryAfter: 0 });
    }
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(zarvisConfig()).toMatchObject({
      unlimitedLocalTesting: false, dailyLimit: 100, hourlyLimit: 30,
      quotaPause: { active: true, until: deadline },
    });
  });

  it("resumes normal quota storage exactly at midnight in Sao Paulo without restarting", async () => {
    vi.setSystemTime(new Date(Date.parse(deadline) - 1));
    expect(await reserveZarvisRequest(new Headers())).toEqual({ allowed: true, retryAfter: 0 });
    vi.setSystemTime(new Date(deadline));
    expect(zarvisConfig().quotaPause.active).toBe(false);
    await expect(reserveZarvisRequest(new Headers())).rejects.toThrow("Normal quota storage reached");
    vi.advanceTimersByTime(1);
    await expect(reserveZarvisRequest(new Headers())).rejects.toThrow("Normal quota storage reached");
  });

  it.each([
    "", "true", "invalid", "2026-09-29", "2026-09-29T03:00:00", "2026-09-29T00:00:00-03:00",
    "2026-09-28T13:00:00.000Z", "2026-09-30T03:00:00.000Z", "2026-02-30T03:00:00.000Z",
  ])("keeps normal quotas for missing, invalid, expired or too distant expiry: %s", async (expiry) => {
    vi.stubEnv("ZARVIS_QUOTA_PAUSE_UNTIL", expiry);
    expect(zarvisConfig().quotaPause.active).toBe(false);
    await expect(reserveZarvisRequest(new Headers())).rejects.toThrow("Normal quota storage reached");
  });

  it("accepts explicit UTC seconds and limits the active window to the last 24 hours", () => {
    vi.stubEnv("ZARVIS_QUOTA_PAUSE_UNTIL", "2026-09-29T03:00:00Z");
    vi.setSystemTime(new Date(Date.parse(deadline) - 86_400_001));
    expect(zarvisConfig().quotaPause.active).toBe(false);
    vi.advanceTimersByTime(1);
    expect(zarvisConfig().quotaPause).toEqual({ active: true, until: deadline });
  });

  it("does not enable a disabled assistant", () => {
    vi.stubEnv("ZARVIS_ENABLED", "false");
    expect(zarvisConfig()).toMatchObject({ enabled: false, quotaPause: { active: true } });
  });
});


describe("Charging only model answers", () => {
  type Call = { method: string; args: unknown[] };
  function fakeDb(rows: unknown[], calls: Call[]) {
    const chain = (result: unknown[]) => {
      const c: Record<string, unknown> = { then: (resolve: (value: unknown) => void) => resolve(result) };
      for (const method of ["values", "onConflictDoUpdate", "from", "where", "set"]) c[method] = (...args: unknown[]) => { calls.push({ method, args }); return c; };
      return c;
    };
    const tx = { execute: async (q: unknown) => { calls.push({ method: "execute", args: [q] }); }, delete: () => chain([]), insert: () => chain([]), select: () => chain(rows), update: () => { calls.push({ method: "update", args: [] }); return chain([]); } };
    return { transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) };
  }
  beforeEach(() => { vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("ZARVIS_LOCAL_UNLIMITED", ""); vi.stubEnv("ZARVIS_QUOTA_PAUSE_UNTIL", ""); vi.stubEnv("XAI_API_KEY", "xai-unit-test-key"); vi.stubEnv("ZARVIS_PROVIDER", "xai"); });
  it("charges the four buckets up front and hands back a refund that decrements them, floored at zero", async () => {
    const calls: Call[] = []; mocks.getDb.mockReturnValue(fakeDb([], calls));
    const allowance = await reserveZarvisRequest(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }));
    expect(allowance).toMatchObject({ allowed: true, retryAfter: 0 }); expect(allowance.allowed && typeof allowance.refund).toBe("function");
    const inserted = calls.find((c) => c.method === "values")!.args[0] as Array<{ key: string; count: number }>;
    expect(inserted.map((row) => row.key.replace(/network:[a-f0-9]{32}/, "network:<digest>"))).toEqual(expect.arrayContaining([expect.stringMatching(/^global:day:\d+$/), expect.stringMatching(/^global:hour:\d+$/), expect.stringMatching(/^network:<digest>:day:\d+$/), expect.stringMatching(/^network:<digest>:window:\d+$/)]));
    expect(inserted.some((row) => row.key.includes("203.0.113.9"))).toBe(false);
    calls.length = 0;
    expect(allowance.allowed && await allowance.refund!()).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(["execute", "update", "set", "where"]);
    const dialect = new PgDialect();
    const set = calls.find((c) => c.method === "set")!.args[0] as { count: SQL };
    expect(dialect.sqlToQuery(set.count).sql).toMatch(/greatest\(.*- 1, 0\)/);
    const where = dialect.sqlToQuery(calls.find((c) => c.method === "where")!.args[0] as SQL);
    expect(where.params).toEqual(expect.arrayContaining(inserted.map((row) => row.key)));
  });
  it("keys the network digest with the dedicated HMAC secret when set, so the provider key is never an HMAC input", async () => {
    const keysWith = async (secret: string) => { vi.stubEnv("ZARVIS_HMAC_SECRET", secret); const calls: Call[] = []; mocks.getDb.mockReturnValue(fakeDb([], calls)); await reserveZarvisRequest(new Headers({ "x-forwarded-for": "203.0.113.9" })); return (calls.find((c) => c.method === "values")!.args[0] as Array<{ key: string }>).map((r) => r.key).filter((k) => k.startsWith("network:")); };
    const a = await keysWith("hmac-secret-a"), b = await keysWith("hmac-secret-b"), fallback = await keysWith("");
    expect(a).not.toEqual(b); expect(fallback).not.toEqual(a);
    expect(zarvisConfig().hmacSecret).toBe("xai-unit-test-key");
  });
  it("never throws on a failed refund and refuses nothing when there is nothing to refund", async () => {
    mocks.getDb.mockImplementation(() => { throw new Error("storage down"); });
    expect(await refundZarvisRequest(["global:day:1"])).toBe(false);
    expect(await refundZarvisRequest([])).toBe(true);
    expect(mocks.getDb).toHaveBeenCalledTimes(1);
  });
});
