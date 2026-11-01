import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: vi.fn(), polls: vi.fn(), archives: vi.fn(), members: vi.fn(), treasury: vi.fn(),
  session: vi.fn(), communities: vi.fn(), publishedCommunity: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); })
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ readSession: mocks.session }));
vi.mock("@/lib/db", () => ({ db: {
  poll: { findMany: mocks.polls }, proposalArchive: { findMany: mocks.archives }, daoMember: { count: mocks.members },
  community: { findFirst: mocks.publishedCommunity }
} }));
vi.mock("@/lib/services/workspace", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/services/workspace")>(),
  readBrowsingWorkspaceContext: mocks.context
}));
vi.mock("@/lib/services/communities", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/services/communities")>(),
  readManagedCommunities: mocks.communities
}));
vi.mock("@/lib/services/treasuries", () => ({ readCommunityTreasuries: mocks.treasury }));
vi.mock("@/components/community-workspace", () => ({ CommunityWorkspace: () => null }));
import CommunityWorkspacePage from "@/app/communities/[communityId]/dao/page";
import CommunityEntryPage from "@/app/communities/page";

const community = { id: "alpha", name: "Alpha", slug: "alpha" };
const owner = { subjectType: "user", userId: "owner", nick: "Owner", role: "USER" };
const poll = { id: "published", question: "Published proposal", status: "FINALIZED", proposalTags: [],
  createdAt: new Date("2026-09-01T00:00:00Z"), opensAt: new Date("2026-09-01T00:00:00Z"), closesAt: new Date("2026-09-02T00:00:00Z"),
  requestedAmountZat: null, treasury: null
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ session: null, viewer: null, community, communities: [community], canManage: false, isDemo: false });
  mocks.polls.mockResolvedValue([poll]);
  mocks.archives.mockResolvedValue([]);
  mocks.session.mockResolvedValue(null);
  mocks.communities.mockResolvedValue([]);
  mocks.publishedCommunity.mockResolvedValue(community);
  mocks.treasury.mockResolvedValue({ funds: [] });
  mocks.members.mockResolvedValue(4);
});

describe("public proposal board", () => {
  it("renders guests without querying private member, treasury, or comment data", async () => {
    const page = await CommunityWorkspacePage({ params: Promise.resolve({ communityId: "alpha" }) });
    expect(page.props).toMatchObject({ viewer: null, treasury: null, memberCount: null });
    expect(page.props.proposals[0].commentCount).toBeNull();
    expect(mocks.treasury).not.toHaveBeenCalled();
    expect(mocks.members).not.toHaveBeenCalled();
    expect(mocks.archives).not.toHaveBeenCalled();
    expect(mocks.polls).toHaveBeenCalledWith(expect.objectContaining({
      where: { communityId: "alpha", OR: [
        { status: "OPEN", closesAt: { gt: expect.any(Date) } },
        { status: { in: ["CLOSED", "FINALIZED", "ARCHIVED"] } }
      ] },
      select: expect.objectContaining({ _count: false })
    }));
  });

  it("keeps authenticated outsiders in the same public scope", async () => {
    mocks.context.mockResolvedValue({ session: owner, viewer: { nick: "Owner", role: "VISITOR" }, community, communities: [community], canManage: false, isDemo: false });
    const page = await CommunityWorkspacePage({ params: Promise.resolve({ communityId: "alpha" }) });
    expect(page.props.treasury).toBeNull();
    expect(mocks.treasury).not.toHaveBeenCalled();
    expect(mocks.members).not.toHaveBeenCalled();
    expect(mocks.polls.mock.calls[0][0].where).toHaveProperty("OR");
    expect(mocks.polls.mock.calls[0][0].where).not.toHaveProperty("community");
  });

  it("preserves scoped leader queries and private dashboard data", async () => {
    mocks.context.mockResolvedValue({ session: owner, viewer: { nick: "Owner", role: "OWNER" }, community, communities: [community], canManage: true, isDemo: false });
    mocks.polls.mockResolvedValue([{ ...poll, _count: { comments: 2 } }]);
    const page = await CommunityWorkspacePage({ params: Promise.resolve({ communityId: "alpha" }) });
    expect(page.props.proposals[0].commentCount).toBe(2);
    expect(page.props.memberCount).toBe(4);
    expect(mocks.treasury).toHaveBeenCalledWith("alpha", "owner");
    expect(mocks.polls.mock.calls[0][0].where).toHaveProperty("community.is.memberships.some.userId", "owner");
    expect(mocks.polls.mock.calls[0][0].where).not.toHaveProperty("OR");
  });

  it("does not query page data after the workspace denies access", async () => {
    mocks.context.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(CommunityWorkspacePage({ params: Promise.resolve({ communityId: "private" }) })).rejects.toThrow("NOT_FOUND");
    expect(mocks.polls).not.toHaveBeenCalled();
    expect(mocks.treasury).not.toHaveBeenCalled();
    expect(mocks.members).not.toHaveBeenCalled();
  });
});

describe("community landing", () => {
  it("sends an anonymous visitor directly to a published community", async () => {
    await expect(CommunityEntryPage()).rejects.toThrow("REDIRECT:/communities/alpha");
    expect(mocks.communities).not.toHaveBeenCalled();
    expect(mocks.publishedCommunity.mock.calls[0][0].where.OR[0]).toHaveProperty("polls.some.OR");
    expect(mocks.publishedCommunity.mock.calls[0][0].where.OR[1]).toEqual({ proposalArchives: { some: { revisions: { some: {} } } } });
  });

  it("retains a leader's own workspace as the default destination", async () => {
    mocks.session.mockResolvedValue(owner);
    mocks.communities.mockResolvedValue([{ id: "managed" }]);
    await expect(CommunityEntryPage()).rejects.toThrow("REDIRECT:/communities/managed");
    expect(mocks.publishedCommunity).not.toHaveBeenCalled();
  });

  it("falls back to the public poll board when nothing is published", async () => {
    mocks.publishedCommunity.mockResolvedValue(null);
    await expect(CommunityEntryPage()).rejects.toThrow("REDIRECT:/polls");
    expect(mocks.redirect).not.toHaveBeenCalledWith(expect.stringContaining("login"));
  });
});
