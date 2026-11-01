import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), read: vi.fn(), run: vi.fn(),
  CheckError: class extends Error { constructor(message: string, public status: number, public code: string) { super(message); } }
}));
vi.mock("@/lib/auth/session", () => ({ readSession: mocks.session }));
vi.mock("@/lib/services/poll-collection-checks", () => ({ readCollectionChecks: mocks.read, runCollectionCheck: mocks.run, CollectionCheckError: mocks.CheckError }));
import { GET, POST } from "@/app/api/admin/communities/[communityId]/proposals/[pollId]/collection-checks/route";
const ctx = { params: Promise.resolve({ communityId: "dao-a", pollId: "poll-a" }) };
const request = (origin: string | null = "http://localhost", body = "{}") => new Request("http://localhost/api/collection", { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body });
beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ subjectType: "user", userId: "owner" }); });
describe("private collection check API", () => {
  it.each([null, { subjectType: "poll_voter_access" }])("rejects guests and invitation sessions", async session => {
    mocks.session.mockResolvedValue(session);
    expect((await GET(new Request("http://localhost"), ctx)).status).toBe(401);
    expect((await POST(request(), ctx)).status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each([null, "https://foreign.example"])("denies untrusted origins before reading a wallet", async origin => {
    expect((await POST(request(origin), ctx)).status).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled(); expect(mocks.run).not.toHaveBeenCalled();
  });
  it("uses the session actor and DAO scope, without caching snapshots", async () => {
    mocks.read.mockResolvedValue({ checks: [] });
    const response = await GET(new Request("http://localhost"), ctx);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.read).toHaveBeenCalledWith("dao-a", "poll-a", "owner");
    mocks.run.mockResolvedValueOnce({ replayed: false }).mockResolvedValueOnce({ replayed: true });
    expect((await POST(request(), ctx)).status).toBe(201);
    expect((await POST(request(), ctx)).status).toBe(200);
    expect(mocks.run).toHaveBeenCalledWith("dao-a", "poll-a", "owner", {});
  });
  it("rejects oversized/malformed requests and sanitizes unexpected failures", async () => {
    expect((await POST(request("http://localhost", "x".repeat(129)), ctx)).status).toBe(400);
    expect((await POST(request("http://localhost", "{"), ctx)).status).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
    mocks.run.mockRejectedValue(new Error("wallet-secret"));
    const response = await POST(request(), ctx);
    expect(response.status).toBe(500); expect(JSON.stringify(await response.json())).not.toContain("wallet-secret");
  });
  it.each([404, 409, 429])("preserves service denial %s", async status => {
    mocks.run.mockRejectedValue(new mocks.CheckError("Unavailable", status, "DENIED"));
    expect((await POST(request(), ctx)).status).toBe(status);
  });
});
