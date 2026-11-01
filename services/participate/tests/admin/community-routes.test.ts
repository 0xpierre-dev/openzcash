import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), create: vi.fn(), list: vi.fn(), find: vi.fn(), bootstrap: vi.fn(),
  CommunityError: class extends Error {
    constructor(public readonly code: string, public readonly status: 400 | 404 | 409) { super(code); }
  },
  MemberError: class extends Error {}
}));

vi.mock("@/lib/auth/session", () => ({ readSession: mocks.session }));
vi.mock("@/lib/services/communities", () => ({
  createCommunity: mocks.create, readManagedCommunities: mocks.list,
  findManagedCommunity: mocks.find, CommunityServiceError: mocks.CommunityError
}));
vi.mock("@/lib/services/dao-members", () => ({
  bootstrapDaoMemberBasket: mocks.bootstrap, DaoMemberServiceError: mocks.MemberError
}));

import { GET, POST } from "@/app/api/admin/communities/route";
import { POST as bootstrap } from "@/app/api/admin/dao-members/bootstrap/route";

const request = (path: string, body: unknown, origin = "http://localhost") => new Request(`http://localhost${path}`, {
  method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body)
}) as never;

beforeEach(() => {
  Object.values(mocks).filter((value) => vi.isMockFunction(value)).forEach((value) => value.mockReset());
  mocks.session.mockResolvedValue({ subjectType: "user", userId: "user_a", role: "USER" });
});

describe("community boundaries", () => {
  it("lists only the authenticated user's manageable communities", async () => {
    mocks.list.mockResolvedValue([{ id: "community_a" }]);
    expect(await (await GET()).json()).toEqual({ communities: [{ id: "community_a" }] });
    expect(mocks.list).toHaveBeenCalledWith("user_a");
  });

  it.each([null, { subjectType: "poll_voter_access", role: "VOTER_TEMP" }])("rejects community creation without a permanent session", async (session) => {
    mocks.session.mockResolvedValue(session);
    expect((await POST(request("/api/admin/communities", { name: "Alpha", slug: "alpha" }))).status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates a community for a permanent user without trusting a supplied owner", async () => {
    mocks.create.mockResolvedValue({ id: "community_a" });
    const body = { name: "Alpha", slug: "alpha" };
    const response = await POST(request("/api/admin/communities", body));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(body, "user_a");
  });

  it("rejects cross-origin creation before invoking the service", async () => {
    expect((await POST(request("/api/admin/communities", {}, "https://foreign.example"))).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("returns a conflict for a duplicate community slug", async () => {
    mocks.create.mockRejectedValue(new mocks.CommunityError("COMMUNITY_SLUG_TAKEN", 409));
    const response = await POST(request("/api/admin/communities", { name: "Alpha", slug: "alpha" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "COMMUNITY_SLUG_TAKEN" });
  });

  it("rejects a guessed community before parsing or bootstrapping its roster", async () => {
    mocks.find.mockResolvedValue(null);
    const response = await bootstrap(request("/api/admin/dao-members/bootstrap", { communityId: "community_b", members: "malformed" }));
    expect(response.status).toBe(404);
    expect(mocks.bootstrap).not.toHaveBeenCalled();
    expect(mocks.find).toHaveBeenCalledWith("community_b", "user_a");
  });

  it("requires an explicit community for a new roster", async () => {
    const response = await bootstrap(request("/api/admin/dao-members/bootstrap", { members: "alice,alice.01" }));
    expect(response.status).toBe(400);
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });

  it("scopes an authorized roster write to the selected community", async () => {
    mocks.find.mockResolvedValue({ id: "community_a" });
    mocks.bootstrap.mockResolvedValue([{ id: "member_a" }]);
    const response = await bootstrap(request("/api/admin/dao-members/bootstrap", { communityId: "community_a", members: "alice,alice.01" }));
    expect(response.status).toBe(200);
    expect(mocks.bootstrap).toHaveBeenCalledWith({ communityId: "community_a", voters: [{ nick: "alice", signalUsername: "alice.01" }] });
  });
});
