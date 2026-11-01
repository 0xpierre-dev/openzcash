// @vitest-environment node
const mocks = vi.hoisted(() => ({ session: vi.fn(), verify: vi.fn(), read: vi.fn(), unlock: vi.fn(), set: vi.fn(), clear: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ readSession: mocks.session }));
vi.mock("@/lib/auth/committee-admin", async original => ({ ...await original<typeof import("@/lib/auth/committee-admin")>(), unlockPilotModeration: mocks.unlock, verifyPilotModeration: mocks.verify }));
vi.mock("@/lib/auth/pilot-moderation-cookie", () => ({ readPilotModerationToken: mocks.read, writePilotModerationToken: mocks.set, clearPilotModerationToken: mocks.clear }));
import { POST, DELETE, GET } from "@/app/api/participate/moderation-access/route";
import { CommitteeAdminError } from "@/lib/auth/committee-admin";
const origin = "https://participate.example.test";
const request = (body: unknown = { password: "synthetic-test-password" }, source = origin) => new Request(`${origin}/api/participate/moderation-access`, { method: "POST", headers: { origin: source, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("APP_BASE_URL", origin); vi.stubEnv("PARTICIPATE_COMMUNITY_ID", "host"); vi.stubEnv("PARTICIPATE_PUBLIC_DEMO", "true"); vi.stubEnv("PARTICIPATE_DEMO_COMMITTEE_ID", "committee"); mocks.session.mockResolvedValue({ subjectType: "user", userId: "admin", role: "ADMIN" }); mocks.unlock.mockResolvedValue("private-grant"); });
afterEach(() => vi.unstubAllEnvs());
it.each([null, { subjectType: "poll_voter_access", role: "ADMIN" }, { subjectType: "user", role: "USER" }])("denies unauthenticated and regular accounts", async session => {
  mocks.session.mockResolvedValue(session);
  expect((await POST(request())).status).toBe(403); expect(mocks.unlock).not.toHaveBeenCalled(); expect(mocks.set).not.toHaveBeenCalled();
});
it("uses the session identity and configured host and never returns the grant", async () => {
  const response = await POST(request());
  expect(await response.json()).toEqual({ ok: true });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.unlock).toHaveBeenCalledWith("admin", { password: "synthetic-test-password" });
  expect(mocks.set).toHaveBeenCalledWith("private-grant");
});
it("rejects cross-site writes, invalid bodies and missing scope", async () => {
  expect((await POST(request({}, "https://evil.test"))).status).toBe(403);
  expect((await DELETE(request({}, "https://evil.test"))).status).toBe(403);
  expect((await POST(request({ password: "x".repeat(3000) }))).status).toBe(413);
  mocks.unlock.mockRejectedValueOnce(new CommitteeAdminError("ADMIN_ACCESS_UNAVAILABLE", 503));
  expect((await POST(request())).status).toBe(503);
  expect(mocks.set).not.toHaveBeenCalled(); expect(mocks.clear).not.toHaveBeenCalled();
});
it("does not grant access after wrong passwords, rate limits or internal errors", async () => {
  for (const [cause, status, code] of [[new CommitteeAdminError("ADMIN_ACCESS_DENIED"), 403, "ADMIN_ACCESS_DENIED"], [new CommitteeAdminError("ADMIN_RATE_LIMITED", 429), 429, "ADMIN_RATE_LIMITED"], [new Error("private database details"), 503, "EMAIL_UNAVAILABLE"]] as const) {
    mocks.unlock.mockRejectedValueOnce(cause); const response = await POST(request());
    expect(response.status).toBe(status); expect(await response.json()).toEqual({ error: code });
  }
  expect(mocks.set).not.toHaveBeenCalled();
});
it("locks moderation without signing the participant out", async () => {
  expect((await DELETE(request())).status).toBe(200); expect(mocks.clear).toHaveBeenCalledOnce(); expect(mocks.set).not.toHaveBeenCalled();
});

it("reports status without exposing the credential", async () => {
  mocks.read.mockResolvedValue("private-token"); mocks.verify.mockResolvedValue(true);
  const response = await GET();
  expect(await response.json()).toEqual({ active: true });
  expect(mocks.verify).toHaveBeenCalledWith("admin", "host", "committee", "private-token");
  mocks.session.mockResolvedValue(null);
  expect(await (await GET()).json()).toEqual({ active: false });
});
