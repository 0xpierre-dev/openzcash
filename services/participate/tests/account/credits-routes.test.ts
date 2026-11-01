// @vitest-environment node
const mocks = vi.hoisted(() => ({ session: vi.fn(), read: vi.fn(), grant: vi.fn(), policy: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ readSession: mocks.session }));
vi.mock("@/lib/services/participation-credits", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/services/participation-credits")>(),
  readAccountCredits: mocks.read, claimPreviewCredits: mocks.grant,
  readParticipationPolicy: mocks.policy, updateParticipationPolicy: mocks.update
}));
import { GET } from "@/app/api/account/credits/route";
import { POST } from "@/app/api/account/credits/preview/route";
import { GET as policyGET, PATCH } from "@/app/api/admin/communities/[communityId]/participation/route";
import { ParticipationCreditError } from "@/lib/services/participation-credits";

const context = { params: Promise.resolve({ communityId: "community-a" }) };
const view = { accounts: [], sandbox: true, history: [] };
const policyInput = { mode: "FREE", commentCost: 1, reactionCost: 1, expectedVersion: 1 };
const request = (body: unknown = { communityId: "community-a" }, origin: string | null = "http://localhost") => new Request("http://localhost/api/account/credits/preview", {
  method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ subjectType: "user", userId: "alice", role: "ADMIN" });
  mocks.read.mockResolvedValue(view); mocks.grant.mockResolvedValue({ replayed: false, balance: 25 });
  mocks.policy.mockResolvedValue({ mode: "FREE", canManage: false }); mocks.update.mockResolvedValue({ mode: "FREE", version: 2 });
});

describe("private participation credit API", () => {
  it("uses only the session actor, scopes optional reads, and returns private data without caching", async () => {
    const response = await GET(new Request("http://localhost/api/account/credits?communityId=community-a&userId=bob"));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ credits: view });
    expect(mocks.read).toHaveBeenCalledWith("alice", "community-a");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
  });

  it.each([ [null, 401], [{ subjectType: "poll_voter_access", role: "VOTER_TEMP" }, 403] ])("rejects guests and temporary credit accounts for every endpoint", async (session, status) => {
    mocks.session.mockResolvedValue(session);
    for (const response of [await GET(new Request("http://localhost")), await POST(request()), await policyGET(new Request("http://localhost"), context), await PATCH(request(policyInput), context)]) {
      expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.grant).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each(["https://other.example", null])("rejects untrusted writes before session or service access", async origin => {
    expect((await POST(request({ communityId: "community-a" }, origin))).status).toBe(403);
    expect((await PATCH(request(policyInput, origin), context)).status).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled(); expect(mocks.grant).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });

  it("issues only the server's one-time preview grant and reports an idempotent replay", async () => {
    const first = await POST(request()); expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ credits: view, replayed: false });
    expect(mocks.grant).toHaveBeenCalledWith("alice", "community-a");
    mocks.grant.mockResolvedValue({ replayed: true, balance: 10 });
    const replay = await POST(request()); expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ credits: view, replayed: true });
  });

  it.each([ { communityId: "community-a", amount: 1000 }, { communityId: "community-a", userId: "bob" }, { communityId: "community-a", treasuryId: "fund" }, { communityId: "" } ])("rejects client-controlled issuance or account targeting %j", async input => {
    expect((await POST(request(input))).status).toBe(400); expect(mocks.grant).not.toHaveBeenCalled();
  });

  it("rejects duplicate community selectors and malformed or oversized JSON", async () => {
    expect((await GET(new Request("http://localhost/api/account/credits?communityId=a&communityId=b"))).status).toBe(400);
    const headers = { origin: "http://localhost", "content-type": "application/json", "content-length": "1" };
    expect((await POST(new Request("http://localhost", { method: "POST", body: "{", headers }))).status).toBe(400);
    expect((await POST(new Request("http://localhost", { method: "POST", body: "a".repeat(16 * 1024 + 1), headers }))).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.grant).not.toHaveBeenCalled();
  });

  it("scopes policy reads and writes to route community and actor, with no global administrator bypass", async () => {
    expect((await policyGET(new Request("http://localhost"), context)).status).toBe(200);
    expect(mocks.policy).toHaveBeenCalledWith("community-a", "alice");
    mocks.update.mockRejectedValue(new ParticipationCreditError("Owner required", 403, "POLICY_OWNER_REQUIRED"));
    const response = await PATCH(request(policyInput), context);
    expect(response.status).toBe(403); expect(mocks.update).toHaveBeenCalledWith("community-a", "alice", policyInput);
  });

  it("retains scoped service rejections and hides unexpected database errors", async () => {
    mocks.read.mockRejectedValue(new ParticipationCreditError("Community not found", 404, "COMMUNITY_NOT_FOUND"));
    expect((await GET(new Request("http://localhost"))).status).toBe(404);
    mocks.grant.mockRejectedValue(new ParticipationCreditError("Unavailable", 403, "PARTICIPATION_CREDITS_UNAVAILABLE"));
    expect((await POST(request())).status).toBe(403);
    mocks.read.mockRejectedValue(new Error("private connection details"));
    const failed = await GET(new Request("http://localhost")); expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "PARTICIPATION_REQUEST_FAILED" });
  });
});
