// @vitest-environment node
const mocks = vi.hoisted(() => ({ readSession: vi.fn(), readCommitteeWorkspace: vi.fn(), mutateCommittee: vi.fn() }));
vi.mock("@/lib/auth/committee-admin-cookie", () => ({ readCommitteePreviewToken: async () => "test-token" }));
vi.mock("@/lib/auth/session", () => ({ readSession: mocks.readSession }));
vi.mock("@/lib/services/committee", () => mocks);
import { GET, POST } from "@/app/api/participate/committee/route";
import { CommitteeError } from "@/lib/services/committee-access";
const origin = "http://localhost:4411", invite = { action: "invite", email: "new@example.test", role: "REVIEWER" };
const request = (body: unknown = invite, source = origin) => new Request(`${origin}/api/participate/committee`, { method: "POST", headers: { "content-type": "application/json", origin: source }, body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("APP_BASE_URL", origin); vi.stubEnv("PARTICIPATE_COMMUNITY_ID", "host-from-server"); vi.stubEnv("PASSKEY_ORIGIN", undefined); mocks.readSession.mockResolvedValue({ subjectType: "user", userId: "actor", role: "USER" }); mocks.readCommitteeWorkspace.mockResolvedValue({ access: "MEMBER" }); });
afterEach(() => vi.unstubAllEnvs());
it("uses the configured scope and session identity with private no-store responses", async () => {
  const response = await GET(new Request(`${origin}/api/participate/committee?before=10`));
  expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(response.headers.get("vary")).toBe("Cookie");
  expect(mocks.readCommitteeWorkspace).toHaveBeenCalledWith("host-from-server", "actor", expect.any(Object), 10, "test-token");
  await POST(request()); expect(mocks.mutateCommittee).toHaveBeenCalledWith("host-from-server", "actor", invite);
});
it.each([null, { subjectType: "poll_voter_access", userId: "" }])("requires permanent authentication for mutations", async session => {
  mocks.readSession.mockResolvedValue(session);
  expect((await POST(request())).status).toBe(session ? 403 : 401);
  expect(mocks.mutateCommittee).not.toHaveBeenCalled();
});
it("rejects CSRF, scope injection, excessive bodies and invalid roles", async () => {
  expect((await POST(request(invite, "https://foreign.example"))).status).toBe(403);
  for (const body of [{ ...invite, communityId: "other" }, { ...invite, userId: "other" }, { ...invite, role: "OWNER" }, { action: "accept", invitationId: "bad", consent: false }]) expect((await POST(request(body))).status).toBe(400);
  expect((await POST(request({ ...invite, padding: "x".repeat(70000) }))).status).toBe(413);
  expect(mocks.mutateCommittee).not.toHaveBeenCalled();
});
it("sanitizes internal failures and returns actionable permission errors", async () => {
  mocks.mutateCommittee.mockRejectedValue(new Error("private database contents"));
  expect(await (await POST(request())).json()).toEqual({ error: "PASSKEY_UNAVAILABLE" });
  mocks.mutateCommittee.mockRejectedValue(new CommitteeError("COMMITTEE_OWNER_PROTECTED", 403));
  expect(await (await POST(request())).json()).toEqual({ error: "COMMITTEE_OWNER_PROTECTED" });
});
