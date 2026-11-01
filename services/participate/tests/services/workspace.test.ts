import { beforeEach, describe, expect, it, vi } from "vitest";

const { readSession, findCommunity, findPoll, readCommunities, findMember, notFound, redirect } = vi.hoisted(() => ({
  readSession: vi.fn(), findCommunity: vi.fn(), findPoll: vi.fn(), readCommunities: vi.fn(),
  findMember: vi.fn(async () => null as { id: string } | null),
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }), redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); })
}));
vi.mock("next/navigation", () => ({ notFound, redirect }));
vi.mock("@/lib/auth/session", () => ({ readSession }));
vi.mock("@/lib/db", () => ({ db: { community: { findFirst: findCommunity }, poll: { findFirst: findPoll }, daoMember: { findFirst: findMember } } }));
vi.mock("@/lib/services/communities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/communities")>();
  return { ...actual, readManagedCommunities: readCommunities };
});
import { readBrowsingWorkspaceContext, readBrowsingWorkspaceContextWithSession, readPublicProposalDetail, publicWorkspacePollWhere, readWorkspaceContext } from "@/lib/services/workspace";

beforeEach(() => {
  vi.clearAllMocks();
  findMember.mockResolvedValue(null);
  readSession.mockResolvedValue({ subjectType: "user", userId: "owner", nick: "Current name", role: "USER" });
  findCommunity.mockResolvedValue({ id: "alpha", name: "Alpha", slug: "alpha", memberships: [{ role: "OWNER" }] });
  readCommunities.mockResolvedValue([{ id: "alpha", name: "Alpha", slug: "alpha" }]);
});

describe("community workspace admission", () => {
  it("redirects unsigned visitors and temporary voters before looking up community data", async () => {
    readSession.mockResolvedValue(null);
    await expect(readWorkspaceContext("alpha")).rejects.toThrow("REDIRECT:/login?next=%2Fcommunities%2Falpha");
    readSession.mockResolvedValue({ subjectType: "poll_voter_access", pollId: "invited-poll", role: "VOTER_TEMP" });
    await expect(readWorkspaceContext("alpha")).rejects.toThrow("REDIRECT:/polls/invited-poll");
    expect(findCommunity).not.toHaveBeenCalled();
    expect(readCommunities).not.toHaveBeenCalled();
  });

  it("uses current active scoped leader membership even for a global administrator", async () => {
    readSession.mockResolvedValue({ subjectType: "user", userId: "outsider", nick: "Outsider", role: "ADMIN" });
    findCommunity.mockResolvedValue(null);
    await expect(readWorkspaceContext("foreign")).rejects.toThrow("NOT_FOUND");
    expect(findCommunity).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: "foreign", kind: "DAO", memberships: { some: { userId: "outsider", role: { in: ["OWNER", "MANAGER"] }, status: "ACTIVE", user: { status: "ACTIVE" } } }
    } }));
  });

  it("returns only managed communities and membership-derived leader role", async () => {
    const context = await readWorkspaceContext("alpha");
    expect(context.community).toEqual({ id: "alpha", name: "Alpha", slug: "alpha" });
    expect(context.viewer).toEqual({ nick: "Current name", role: "OWNER" });
    expect(readCommunities).toHaveBeenCalledWith("owner");
    expect(findCommunity).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ memberships: { where: { userId: "owner", status: "ACTIVE" }, select: { role: true } } }) }));
  });
});


describe("public workspace browsing", () => {
  it("uses one already verified session for parallel public page reads", async () => {
    findCommunity.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "alpha", name: "Alpha", slug: "alpha" });
    const context = await readBrowsingWorkspaceContextWithSession("alpha", { subjectType: "user", userId: "visitor", nick: "Visitor", role: "USER" });
    expect(context).toMatchObject({ session: { userId: "visitor" }, viewer: { nick: "Visitor", role: "VISITOR" }, canManage: false });
    expect(readSession).not.toHaveBeenCalled();
    expect(findCommunity).toHaveBeenCalledTimes(2);
  });
  it("selects public membership action and rule fields without exposing the private member identity", async () => {
    findPoll.mockResolvedValue({ id: "p", community: { id: "alpha", name: "Alpha", slug: "alpha" }, question: "Membership proposal", proposalTags: [], status: "CLOSED", opensAt: new Date("2026-01-01"), closesAt: new Date("2026-01-02"), quorumPercent: 45, passingThresholdPercent: 70, membershipAction: { type: "REMOVE_MEMBER", status: "PENDING" } });
    const detail = await readPublicProposalDetail("p", "alpha");
    expect(detail?.governance).toMatchObject({ quorumPercent: 45, passingThresholdPercent: 70 });
    expect(detail?.membershipChange).toEqual({ type: "REMOVE_MEMBER", status: "PENDING" });
    expect(findPoll.mock.calls[0][0].select.membershipAction).toEqual({ select: { type: true, status: true } });
  });
  it("admits an anonymous visitor only through published polls or preserved revisions", async () => {
    readSession.mockResolvedValue(null);
    findCommunity.mockResolvedValue({ id: "alpha", name: "Alpha", slug: "alpha" });
    const context = await readBrowsingWorkspaceContext("alpha");
    expect(context).toMatchObject({ viewer: null, session: null, canManage: false, community: { id: "alpha" } });
    expect(findCommunity).toHaveBeenCalledWith({ where: {
      id: "alpha", kind: "DAO", OR: [{ polls: { some: { OR: [
        { status: "OPEN", closesAt: { gt: expect.any(Date) } },
        { status: { in: ["CLOSED", "FINALIZED", "ARCHIVED"] } }
      ] } } }, { proposalArchives: { some: { revisions: { some: {} } } } }]
    }, select: { id: true, name: true, slug: true } });
    expect(readCommunities).not.toHaveBeenCalled();
  });

  it("keeps positional sample outcomes out of filtered public boards while preserving the owner preview", async () => {
    vi.stubEnv("WORKSPACE_PREVIEW", "true");
    vi.stubEnv("NODE_ENV", "development");
    try {
      expect(await readBrowsingWorkspaceContext("alpha")).toMatchObject({ canManage: true, isDemo: true });
      readSession.mockResolvedValue(null);
      findCommunity.mockResolvedValue({ id: "alpha", name: "Alpha", slug: "alpha" });
      expect(await readBrowsingWorkspaceContext("alpha")).toMatchObject({ canManage: false, isDemo: false });
      readSession.mockResolvedValue({ subjectType: "user", userId: "visitor", nick: "Visitor", role: "USER" });
      findCommunity.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "alpha", name: "Alpha", slug: "alpha" });
      expect(await readBrowsingWorkspaceContext("alpha")).toMatchObject({ canManage: false, isDemo: false });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("does not admit a community that has only private drafts or scheduled ballots", async () => {
    readSession.mockResolvedValue(null);
    findCommunity.mockResolvedValue(null);
    await expect(readBrowsingWorkspaceContext("private")).rejects.toThrow("NOT_FOUND");
    expect(readCommunities).not.toHaveBeenCalled();
  });

  it("keeps leader access and permissions scoped to an active membership", async () => {
    const context = await readBrowsingWorkspaceContext("alpha");
    expect(context).toMatchObject({ viewer: { nick: "Current name", role: "OWNER" }, canManage: true });
    expect(findCommunity).toHaveBeenCalledTimes(1);
    expect(readCommunities).toHaveBeenCalledWith("owner");
  });

  it("falls back to public access after a manager loses membership without retaining the role", async () => {
    findCommunity.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "alpha", name: "Alpha", slug: "alpha" });
    const context = await readBrowsingWorkspaceContext("alpha");
    expect(context).toMatchObject({ viewer: { nick: "Current name", role: "VISITOR" }, canManage: false });
    expect(readCommunities).not.toHaveBeenCalled();
  });

  it("lets a temporary voter read a public community without impersonating a manager", async () => {
    readSession.mockResolvedValue({ subjectType: "poll_voter_access", userId: "", nick: "Invited", pollId: "vote" });
    findCommunity.mockResolvedValue({ id: "alpha", name: "Alpha", slug: "alpha" });
    expect(await readBrowsingWorkspaceContext("alpha")).toMatchObject({ viewer: { role: "VISITOR", canEditProfile: false }, canManage: false });
    expect(readCommunities).not.toHaveBeenCalled();
  });

  it("keeps the public time boundary explicit and excludes unpublished statuses", () => {
    const now = new Date("2026-10-09T12:00:00Z");
    expect(publicWorkspacePollWhere(now)).toEqual({ OR: [
      { status: "OPEN", closesAt: { gt: now } },
      { status: { in: ["CLOSED", "FINALIZED", "ARCHIVED"] } }
    ] });
  });

  it("returns published proposal content without reading comments, membership, or identities", async () => {
    findPoll.mockResolvedValue({ id: "p1", question: "A public proposal", proposalBody: "Published body", proposalTags: ["education"],
      status: "FINALIZED", opensAt: new Date("2026-09-01Z"), closesAt: new Date("2026-09-02Z"),
      requestedAmountZat: 125000000n, treasury: null, community: { id: "alpha", name: "Alpha", slug: "alpha" } });
    const detail = await readPublicProposalDetail("p1", "alpha");
    expect(detail).toMatchObject({ title: "A public proposal", body: "Published body", canEditDraft: false, requestedAmountZec: "1.25" });
    expect(findPoll).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p1", communityId: "alpha", OR: [ { status: "OPEN", closesAt: { gt: expect.any(Date) } }, { status: { in: ["CLOSED", "FINALIZED", "ARCHIVED"] } } ] } }));
    expect(findCommunity).not.toHaveBeenCalled();
    expect(readCommunities).not.toHaveBeenCalled();
  });

  it("does not reveal a foreign or unpublished proposal", async () => {
    findPoll.mockResolvedValue(null);
    expect(await readPublicProposalDetail("draft", "alpha")).toBeNull();
    expect(findPoll).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "draft", communityId: "alpha" }) }));
  });
});
