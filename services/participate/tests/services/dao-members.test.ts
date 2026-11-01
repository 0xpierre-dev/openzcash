import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({ dbMock: {} as Record<string, unknown> }));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import {
  applyDaoMembershipActionForPoll,
  bootstrapDaoMemberBasket,
  readActiveDaoMemberVoters
} from "@/lib/services/dao-members";

function passedPoll(overrides: Record<string, unknown> = {}) {
  return {
    id: "poll_1",
    communityId: "community_1",
    status: "FINALIZED",
    voteModel: "SINGLE_CHOICE",
    quorumPercent: 40,
    passingThresholdPercent: 67,
    tally: { totalConfirmed: 1, countA: 1 },
    _count: { eligibility: 0, voterAccesses: 1 },
    membershipAction: {
      id: "action_1",
      type: "ADD_MEMBER",
      status: "PENDING",
      nick: "alice",
      signalUsername: "alice_user.99",
      targetMemberId: null
    },
    ...overrides
  };
}

function mockActionTransaction(poll = passedPoll()) {
  const tx = {
    poll: { findUnique: vi.fn(async () => poll) },
    daoMember: {
      create: vi.fn(),
      findFirst: vi.fn(async () => null as { id: string; communityId?: string } | null),
      updateMany: vi.fn(async () => ({ count: 1 }))
    },
    daoMembershipAction: { updateMany: vi.fn(async () => ({ count: 1 })) }
  };
  Object.assign(dbMock, {
    $transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx))
  });
  return tx;
}

beforeEach(() => {
  for (const key of Object.keys(dbMock)) delete dbMock[key];
});

describe("DAO member scope", () => {
  it("rejects missing scope without any read or write", async () => {
    const findMany = vi.fn();
    const transaction = vi.fn();
    Object.assign(dbMock, { daoMember: { findMany }, $transaction: transaction });
    await expect(readActiveDaoMemberVoters(" ")).rejects.toMatchObject({ code: "COMMUNITY_REQUIRED" });
    await expect(bootstrapDaoMemberBasket({ communityId: "", voters: [] }))
      .rejects.toMatchObject({ code: "COMMUNITY_REQUIRED" });
    expect(findMany).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("reads only the selected community's active voter roster", async () => {
    const findMany = vi.fn(async () => []);
    Object.assign(dbMock, { daoMember: { findMany } });
    await readActiveDaoMemberVoters("community_1");
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { communityId: "community_1", status: "ACTIVE" }
    }));
  });

  it("initializes baskets independently and excludes unassigned legacy rows", async () => {
    const rows = [
      { communityId: null, nick: "legacy", signalUsername: "legacy.42", status: "ACTIVE" },
      { communityId: "community_1", nick: "alice", signalUsername: "alice_user.99", status: "ACTIVE" }
    ];
    const tx = {
      daoMember: {
        count: vi.fn(async ({ where }) => rows.filter((row) => row.communityId === where.communityId).length),
        createMany: vi.fn(async ({ data }) => { rows.push(...data); }),
        findMany: vi.fn(async ({ where }) => rows.filter((row) => row.communityId === where.communityId))
      }
    };
    Object.assign(dbMock, { $transaction: vi.fn(async (callback) => callback(tx)) });
    await expect(bootstrapDaoMemberBasket({
      communityId: "community_2", voters: [{ nick: "alice", signalUsername: "alice_user.99" }]
    })).resolves.toEqual([{ communityId: "community_2", nick: "alice", signalUsername: "alice_user.99", status: "ACTIVE" }]);
    await expect(bootstrapDaoMemberBasket({
      communityId: "community_1", voters: [{ nick: "bob", signalUsername: "bob_user.42" }]
    })).rejects.toMatchObject({ status: 409, code: "DAO_MEMBER_BOOTSTRAP_LOCKED" });
    expect(tx.daoMember.createMany).toHaveBeenCalledOnce();
    expect(rows).toHaveLength(3);
  });
});

describe("DAO membership actions", () => {
  it("applies an add-member action only at FINALIZED, within its community", async () => {
    const tx = mockActionTransaction();
    await expect(applyDaoMembershipActionForPoll("poll_1")).resolves.toMatchObject({
      status: "APPLIED", outcome: "Passed"
    });
    expect(tx.daoMember.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        communityId: "community_1",
        userId: null,
        OR: [{ signalUsername: "alice_user.99" }, { nick: "alice" }]
      }
    }));
    expect(tx.daoMember.create).toHaveBeenCalledWith({ data: {
      communityId: "community_1", nick: "alice", signalUsername: "alice_user.99",
      status: "ACTIVE", addedByPollId: "poll_1", removedByPollId: null
    } });
    expect(tx.daoMembershipAction.updateMany).toHaveBeenCalledWith({
      where: { id: "action_1", pollId: "poll_1", status: "PENDING", poll: { communityId: "community_1", status: "FINALIZED" } },
      data: { status: "APPLIED", appliedAt: expect.any(Date) }
    });
  });

  it("rejects failed governance without changing the member roster", async () => {
    const tx = mockActionTransaction(passedPoll({ tally: { totalConfirmed: 0, countA: 0 } }));
    await expect(applyDaoMembershipActionForPoll("poll_1")).resolves.toMatchObject({
      status: "REJECTED", outcome: "Quorum not met"
    });
    expect(tx.daoMember.create).not.toHaveBeenCalled();
    expect(tx.daoMember.updateMany).not.toHaveBeenCalled();
  });

  it("refuses unassigned legacy actions without assigning records or altering action history", async () => {
    const tx = mockActionTransaction(passedPoll({ communityId: null }));
    await expect(applyDaoMembershipActionForPoll("poll_1"))
      .rejects.toMatchObject({ status: 409, code: "LEGACY_POLL_UNASSIGNED" });
    expect(tx.daoMembershipAction.updateMany).not.toHaveBeenCalled();
    expect(tx.daoMember.create).not.toHaveBeenCalled();
  });

  it.each([true, false])("rejects a cross-community removal before any update (passed=%s)", async (passed) => {
    const poll = passedPoll({
      tally: passed ? { totalConfirmed: 1, countA: 1 } : { totalConfirmed: 0, countA: 0 },
      membershipAction: { ...passedPoll().membershipAction, type: "REMOVE_MEMBER", targetMemberId: "foreign_member" }
    });
    const tx = mockActionTransaction(poll);
    tx.daoMember.findFirst.mockResolvedValue({ id: "foreign_member", communityId: "community_2" });
    await expect(applyDaoMembershipActionForPoll("poll_1"))
      .rejects.toMatchObject({ status: 404, code: "DAO_MEMBER_NOT_FOUND" });
    expect(tx.daoMember.findFirst).toHaveBeenCalledWith({
      where: { id: "foreign_member", communityId: "community_1" },
      select: { id: true, communityId: true }
    });
    expect(tx.daoMembershipAction.updateMany).not.toHaveBeenCalled();
    expect(tx.daoMember.updateMany).not.toHaveBeenCalled();
  });

  it("removes only the explicit member ID in the poll's community", async () => {
    const tx = mockActionTransaction(passedPoll({
      membershipAction: { ...passedPoll().membershipAction, type: "REMOVE_MEMBER", targetMemberId: "member_1" }
    }));
    tx.daoMember.findFirst.mockResolvedValue({ id: "member_1", communityId: "community_1" });
    await applyDaoMembershipActionForPoll("poll_1");
    expect(tx.daoMember.updateMany).toHaveBeenCalledWith({
      where: { id: "member_1", communityId: "community_1", status: "ACTIVE" },
      data: { status: "REMOVED", removedByPollId: "poll_1" }
    });
  });

  it("does not mutate members when another call has already claimed the action", async () => {
    const tx = mockActionTransaction();
    tx.daoMembershipAction.updateMany.mockResolvedValue({ count: 0 });
    await expect(applyDaoMembershipActionForPoll("poll_1")).resolves.toBeNull();
    expect(tx.daoMember.create).not.toHaveBeenCalled();
    expect(tx.daoMember.updateMany).not.toHaveBeenCalled();
  });

  it.each(["OPEN", "CLOSED", "ARCHIVED"])("keeps %s polls pending without executing membership", async (status) => {
    const tx = mockActionTransaction(passedPoll({ status }));
    await expect(applyDaoMembershipActionForPoll("poll_1")).resolves.toMatchObject({ status: "PENDING" });
    expect(tx.daoMembershipAction.updateMany).not.toHaveBeenCalled();
    expect(tx.daoMember.create).not.toHaveBeenCalled();
    expect(tx.daoMember.updateMany).not.toHaveBeenCalled();
  });
});
