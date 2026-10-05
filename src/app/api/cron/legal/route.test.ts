import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@/lib/legal/schedule", () => ({ executeLegalCollection: mocks.execute }));
import * as route from "./route";

const secret = "test-cron-secret-sentinel";
const request = (authorization?: string) => new Request("https://openzcash.org/api/cron/legal?force=1&day=1999-01-01", {
  method: "POST", headers: authorization ? { authorization } : {},
  body: JSON.stringify({ sourceUrl: "https://untrusted.example/", force: true }),
});
const success = { ok: true, outcome: "collected", day: "2026-10-05", nextRetryAt: null, sources: [{ sourceId: "pgp", status: "collected", itemCount: 2, lastSuccessAt: "2026-10-05T12:00:00Z" }] };

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("CRON_SECRET", secret); mocks.execute.mockResolvedValue(success); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("Privacy & Policy authenticated collection trigger", () => {
  it("only exports a POST handler with the Node runtime", () => {
    expect(route).not.toHaveProperty("GET");
    expect(route.runtime).toBe("nodejs");
  });

  it("rejects missing, wrong and same-length incorrect credentials before any collection", async () => {
    for (const auth of [undefined, "Bearer wrong", `Bearer ${"x".repeat(secret.length)}`, secret]) {
      const response = await route.POST(request(auth));
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ ok: false, error: "Unauthorized" });
    }
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("fails closed if the secret is absent without disclosing config or credentials", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const response = await route.POST(request(`Bearer ${secret}`));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "Collection trigger unavailable" });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("runs only the legal collector and ignores caller-provided dates, URLs and force flags", async () => {
    const response = await route.POST(request(`Bearer ${secret}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(success);
    expect(mocks.execute).toHaveBeenCalledExactlyOnceWith("cron");
  });

  it("reports a paused preview without collecting and keeps the response shape safe", async () => {
    mocks.execute.mockResolvedValue({ ok: true, outcome: "disabled", day: "2026-10-05" });
    const response = await route.POST(request(`Bearer ${secret}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, outcome: "disabled", day: "2026-10-05", nextRetryAt: null, sources: [] });
  });

  it.each(["partial", "unavailable"])("reports %s as unsuccessful without exposing raw errors", async outcome => {
    mocks.execute.mockResolvedValue({ ...success, ok: false, outcome, rawError: "private-db-secret", sources: [{ ...success.sources[0], status: "unavailable", rawError: "private-source-secret" }] });
    const response = await route.POST(request(`Bearer ${secret}`));
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).not.toContain("private-");
    expect(JSON.parse(body)).toMatchObject({ ok: false, outcome });
  });

  it.each(["locked", "retry-later"])("reports a bounded %s instead of bypassing the checkpoint", async outcome => {
    mocks.execute.mockResolvedValue({ ...success, ok: false, outcome, nextRetryAt: "2026-10-05T13:00:00Z" });
    const response = await route.POST(request(`Bearer ${secret}`));
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ outcome, nextRetryAt: "2026-10-05T13:00:00Z" });
  });

  it("contains unexpected exceptions without returning raw errors", async () => {
    mocks.execute.mockRejectedValue(new Error(`db connection password=${secret}`));
    const response = await route.POST(request(`Bearer ${secret}`));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "Collection unavailable" });
  });
});
