import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { readSession, findCommunity, findCommunities, findMembers, communityMembers } = vi.hoisted(() => ({
  readSession: vi.fn(),
  findCommunity: vi.fn(),
  findCommunities: vi.fn(),
  findMembers: vi.fn(),
  communityMembers: vi.fn(() => null)
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); },
  notFound: () => { throw new Error("NOT_FOUND"); }
}));
vi.mock("@/lib/auth/session", () => ({ readSession }));
vi.mock("@/lib/db", () => ({
  db: {
    community: { findFirst: findCommunity, findMany: findCommunities },
    daoMember: { findMany: findMembers }
  }
}));
vi.mock("@/components/community-members", () => ({ CommunityMembers: communityMembers }));
vi.mock("@/components/community-workspace", () => ({ WorkspaceFrame: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/membership-proposal-form", () => ({ MembershipProposalForm: () => null }));
vi.mock("@/lib/services/account-membership", () => ({ readMembershipRequests: vi.fn(async () => []) }));

import CommunityMembersPage from "@/app/communities/[communityId]/members/page";
import AdminMembersPage from "@/app/admin/members/page";
import MembershipChangePage from "@/app/communities/[communityId]/members/change/page";

const alpha = { id: "alpha", name: "Alpha", slug: "alpha" };
const beta = { id: "beta", name: "Beta", slug: "beta" };
const session = { subjectType: "user", userId: "leader", nick: "Leader", role: "USER" };
const members = [
  { id: "member-a", nick: "Alice", signalUsername: "alice.42", status: "ACTIVE", addedByPollId: null, removedByPollId: null },
  { id: "member-b", nick: "Bob", signalUsername: "bob.42", status: "REMOVED", addedByPollId: "add-bob", removedByPollId: "remove-bob" }
];
const activeLeaderScope = {
  kind: "DAO",
  memberships: {
    some: { userId: "leader", role: { in: ["OWNER", "MANAGER"] }, status: "ACTIVE", user: { status: "ACTIVE" } }
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  readSession.mockResolvedValue(session);
  findCommunity.mockResolvedValue({ ...alpha, memberships: [{ role: "OWNER" }] });
  findCommunities.mockResolvedValue([alpha, beta]);
  findMembers.mockResolvedValue(members);
});

describe("community members page", () => {
  it("loads only active members for a scoped membership proposal", async () => {
    render(await MembershipChangePage({ params: Promise.resolve({ communityId: "alpha" }) }));
    expect(findCommunity).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "alpha", ...activeLeaderScope } }));
    expect(findMembers).toHaveBeenCalledWith({ where: { communityId: "alpha", status: "ACTIVE" }, orderBy: [{ nick: "asc" }, { id: "asc" }], select: { id: true, nick: true } });
  });

  it("rejects an unavailable DAO before rendering the membership change form", async () => {
    findCommunity.mockResolvedValue(null);
    await expect(MembershipChangePage({ params: Promise.resolve({ communityId: "foreign" }) })).rejects.toThrow("NOT_FOUND");
    expect(findMembers).not.toHaveBeenCalled();
  });

  it("requires a user session before reading membership-change candidates", async () => {
    readSession.mockResolvedValue(null);
    await expect(MembershipChangePage({ params: Promise.resolve({ communityId: "alpha" }) })).rejects.toThrow("REDIRECT:/login");
    expect(findMembers).not.toHaveBeenCalled();
  });
  it.each(["OWNER", "MANAGER"])("loads only the authorized community roster for an active %s", async role => {
    findCommunity.mockResolvedValue({ ...alpha, memberships: [{ role }] });

    render(await CommunityMembersPage({ params: Promise.resolve({ communityId: "alpha" }) }));

    expect(findCommunity).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "alpha", ...activeLeaderScope }
    }));
    expect(findCommunities).toHaveBeenCalledWith(expect.objectContaining({ where: activeLeaderScope }));
    expect(findMembers).toHaveBeenCalledWith({
      where: { communityId: "alpha" },
      orderBy: [{ status: "asc" }, { nick: "asc" }],
      select: { id: true, nick: true, signalUsername: true, userId: true, status: true, addedByPollId: true, removedByPollId: true }
    });
    expect(communityMembers).toHaveBeenCalledWith(expect.objectContaining({
      community: alpha,
      communities: [alpha, beta],
      viewer: { nick: "Leader", role },
      members
    }), undefined);
  });

  it("redirects unsigned visitors and invited voters before reading community or member data", async () => {
    readSession.mockResolvedValue(null);
    await expect(CommunityMembersPage({ params: Promise.resolve({ communityId: "alpha" }) })).rejects.toThrow("REDIRECT:/login?next=%2Fcommunities%2Falpha");
    readSession.mockResolvedValue({ subjectType: "poll_voter_access", pollId: "invited-poll", role: "VOTER_TEMP" });
    await expect(CommunityMembersPage({ params: Promise.resolve({ communityId: "alpha" }) })).rejects.toThrow("REDIRECT:/polls/invited-poll");
    expect(findCommunity).not.toHaveBeenCalled();
    expect(findCommunities).not.toHaveBeenCalled();
    expect(findMembers).not.toHaveBeenCalled();
  });

  it("does not load a guessed community roster even for a global administrator", async () => {
    readSession.mockResolvedValue({ ...session, role: "ADMIN" });
    findCommunity.mockResolvedValue(null);

    await expect(CommunityMembersPage({ params: Promise.resolve({ communityId: "foreign" }) })).rejects.toThrow("NOT_FOUND");

    expect(findCommunity).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "foreign", ...activeLeaderScope }
    }));
    expect(findMembers).not.toHaveBeenCalled();
    expect(communityMembers).not.toHaveBeenCalled();
  });

  it("does not load the roster if no active membership remains", async () => {
    findCommunity.mockResolvedValue({ ...alpha, memberships: [] });
    await expect(CommunityMembersPage({ params: Promise.resolve({ communityId: "alpha" }) })).rejects.toThrow("NOT_FOUND");
    expect(findMembers).not.toHaveBeenCalled();
  });
});

describe("legacy members compatibility route", () => {
  it("redirects the requested managed community without loading its roster", async () => {
    await expect(AdminMembersPage({ searchParams: Promise.resolve({ communityId: "beta" }) })).rejects.toThrow("REDIRECT:/communities/beta/members");
    expect(findCommunities).toHaveBeenCalledWith(expect.objectContaining({ where: activeLeaderScope }));
    expect(findMembers).not.toHaveBeenCalled();
  });

  it("retains the first managed community as the default destination", async () => {
    await expect(AdminMembersPage({})).rejects.toThrow("REDIRECT:/communities/alpha/members");
  });

  it("rejects an inaccessible requested community instead of falling back to another roster", async () => {
    await expect(AdminMembersPage({ searchParams: Promise.resolve({ communityId: "foreign" }) })).rejects.toThrow("NOT_FOUND");
    expect(findMembers).not.toHaveBeenCalled();
  });

  it("retains setup navigation when the user has no managed communities", async () => {
    findCommunities.mockResolvedValue([]);
    await expect(AdminMembersPage({})).rejects.toThrow("REDIRECT:/admin/communities");
  });

  it("preserves the legacy login and temporary-voter redirects without querying private data", async () => {
    readSession.mockResolvedValue(null);
    await expect(AdminMembersPage({})).rejects.toThrow("REDIRECT:/login?next=%2Fadmin%2Fmembers");
    readSession.mockResolvedValue({ subjectType: "poll_voter_access", pollId: "invited-poll", role: "VOTER_TEMP" });
    await expect(AdminMembersPage({})).rejects.toThrow("REDIRECT:/polls");
    expect(findCommunities).not.toHaveBeenCalled();
    expect(findMembers).not.toHaveBeenCalled();
  });
});
