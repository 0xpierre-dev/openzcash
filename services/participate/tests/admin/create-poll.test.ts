import { beforeEach, describe, expect, it, vi } from "vitest";
import { questionHash } from "@/lib/domain/polls";

const { communityFindFirstMock, daoMemberFindFirstMock, daoMemberFindManyMock, pollCreateMock } =
  vi.hoisted(() => ({
    communityFindFirstMock: vi.fn(),
    daoMemberFindFirstMock: vi.fn(),
    daoMemberFindManyMock: vi.fn(),
    pollCreateMock: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  db: {
    community: { findFirst: communityFindFirstMock },
    daoMember: {
      findFirst: daoMemberFindFirstMock,
      findMany: daoMemberFindManyMock
    },
    poll: {
      create: pollCreateMock
    }
  }
}));

import {
  createDraftPoll,
  createDraftPollInputSchema
} from "@/lib/services/polls";

beforeEach(() => {
  communityFindFirstMock.mockReset();
  communityFindFirstMock.mockResolvedValue({ id: "community_1", name: "Community One", slug: "community-one" });
  daoMemberFindFirstMock.mockReset();
  daoMemberFindManyMock.mockReset();
  pollCreateMock.mockReset();
});

describe("createDraftPollInputSchema", () => {
  it("rejects missing or blank community scope", () => {
    for (const communityId of [undefined, "", "   "]) {
      expect(createDraftPollInputSchema.safeParse({
        communityId,
        question: "Should we fund the next community meeting?",
        opensAt: "2026-04-21T12:00:00.000Z",
        closesAt: "2026-04-22T12:00:00.000Z",
        optionALabel: "Approve",
        optionBLabel: "Reject",
        audience: "DAO_MEMBERS"
      }).success).toBe(false);
    }
  });

  it("derives the question hash from the submitted question and active option labels", () => {
    const parsed = createDraftPollInputSchema.parse({
      communityId: "community_1",
      question: "Which option should we fund?",
      opensAt: "2026-05-01T10:00:00.000Z",
        closesAt: "2026-05-03T10:00:00.000Z",
        optionALabel: "Approve",
        optionBLabel: "Reject",
        optionCLabel: "Abstain",
        voters: [{ nick: "michae2xl", signalUsername: "michae2xl.42" }]
      });

    expect(parsed.questionHash).toBe(
      questionHash("Which option should we fund?", ["Approve", "Reject", "Abstain"])
    );
  });

  it("rejects poll windows that close before they open", () => {
    expect(() =>
      createDraftPollInputSchema.parse({
        communityId: "community_1",
        question: "Which option should we fund?",
        opensAt: "2026-05-03T10:00:00.000Z",
        closesAt: "2026-05-01T10:00:00.000Z",
        optionALabel: "Approve",
        optionBLabel: "Reject",
        voters: [{ nick: "michae2xl", signalUsername: "michae2xl.42" }]
      })
    ).toThrowError(/closesAt must be after opensAt/i);
  });

  it("rejects poll windows shorter than the global minimum", () => {
    expect(() =>
      createDraftPollInputSchema.parse({
        communityId: "community_1",
        question: "Which option should we fund?",
        opensAt: "2026-05-01T10:00:00.000Z",
        closesAt: "2026-05-01T12:00:00.000Z",
        optionALabel: "Approve",
        optionBLabel: "Reject",
        voters: [{ nick: "michae2xl", signalUsername: "michae2xl.42" }]
      })
    ).toThrowError(/at least 24 hours/i);
  });
});

describe("createDraftPoll", () => {
  it("refuses unauthorized community creation before reading a roster or inserting a poll", async () => {
    communityFindFirstMock.mockResolvedValue(null);
    await expect(createDraftPoll({
      communityId: "other_community",
      question: "Should we fund the next community meeting?",
      opensAt: "2026-04-21T12:00:00.000Z",
      closesAt: "2026-04-22T12:00:00.000Z",
      optionALabel: "Approve",
      optionBLabel: "Reject",
      audience: "DAO_MEMBERS"
    }, "admin_1")).rejects.toMatchObject({ status: 404, code: "COMMUNITY_NOT_FOUND" });
    expect(daoMemberFindManyMock).not.toHaveBeenCalled();
    expect(daoMemberFindFirstMock).not.toHaveBeenCalled();
    expect(pollCreateMock).not.toHaveBeenCalled();
    expect(communityFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "other_community",
        memberships: { some: {
          userId: "admin_1",
          role: { in: ["OWNER", "MANAGER"] },
          status: "ACTIVE",
          user: { status: "ACTIVE" }
        } }
      })
    }));
  });

  it("refuses removal targets outside the selected community", async () => {
    daoMemberFindManyMock.mockResolvedValue([{ nick: "alice", signalUsername: "alice.42" }]);
    daoMemberFindFirstMock.mockResolvedValue(null);
    await expect(createDraftPoll({
      communityId: "community_1",
      question: "Should we remove this community member?",
      opensAt: "2026-04-21T12:00:00.000Z",
      closesAt: "2026-04-22T12:00:00.000Z",
      optionALabel: "Approve",
      optionBLabel: "Reject",
      audience: "DAO_MEMBERS",
      membershipAction: { type: "REMOVE_MEMBER", targetMemberId: "foreign_member" }
    }, "admin_1")).rejects.toMatchObject({ status: 404, code: "DAO_MEMBER_NOT_FOUND" });
    expect(daoMemberFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "foreign_member", communityId: "community_1", status: "ACTIVE" }
    }));
    expect(pollCreateMock).not.toHaveBeenCalled();
  });

  it("creates temporary voter access rows on draft poll creation", async () => {
    pollCreateMock.mockResolvedValue({ id: "poll_1" });

    await createDraftPoll(
      {
        communityId: "community_1",
        question: "Should the next shielded rollout proceed on mainnet?",
        opensAt: "2026-04-21T12:00:00.000Z",
        closesAt: "2026-04-22T12:00:00.000Z",
        optionALabel: "Approve",
        optionBLabel: "Reject",
        optionCLabel: "",
        optionDLabel: "",
        optionELabel: "",
        voters: [{ nick: "michae2xl", signalUsername: "michae2xl.42" }]
      },
      "admin_1"
    );

    expect(pollCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          communityId: "community_1",
          optionALabel: "Approve",
          optionBLabel: "Reject",
          optionCLabel: undefined,
          optionDLabel: undefined,
          optionELabel: undefined,
          voteModel: "SINGLE_CHOICE",
          quorumPercent: 40,
          passingThresholdPercent: 67,
          feeZat: 10000n,
          voterAccesses: {
            create: [
              expect.objectContaining({
                nick: "michae2xl",
                signalUsername: "michae2xl.42",
                inviteToken: expect.any(String),
                expiresAt: new Date("2026-04-22T12:00:00.000Z")
              })
            ]
          }
        })
      })
    );
  });

  it("rejects duplicate voters before insert", async () => {
    await expect(
      createDraftPoll(
        {
          communityId: "community_1",
          question: "Should the next shielded rollout proceed on mainnet?",
          opensAt: "2026-04-21T12:00:00.000Z",
          closesAt: "2026-04-22T12:00:00.000Z",
          optionALabel: "Approve",
          optionBLabel: "Reject",
          voters: [
            { nick: "michae2xl", signalUsername: "michae2xl.42" },
            { nick: "michae2xl", signalUsername: "other_user.99" }
          ]
        },
        "admin_1"
      )
    ).rejects.toThrow(/duplicate voter/i);

    expect(pollCreateMock).not.toHaveBeenCalled();
  });

  it("rejects extra answers outside the single-choice A/B/abstain shape", () => {
    expect(() =>
      createDraftPollInputSchema.parse({
        communityId: "community_1",
        question: "Should the next shielded rollout proceed on mainnet?",
        opensAt: "2026-04-21T12:00:00.000Z",
        closesAt: "2026-04-22T12:00:00.000Z",
        optionALabel: "Approve",
        optionBLabel: "Reject",
        optionCLabel: "Abstain",
        optionDLabel: "Maybe",
        voters: [{ nick: "michae2xl", signalUsername: "michae2xl.42" }]
      })
    ).toThrowError(/single-choice/i);
  });

  it("uses the active DAO member basket for DAO member polls", async () => {
    daoMemberFindManyMock.mockResolvedValue([
      { nick: "michae2xl", signalUsername: "michae2xl.42" }
    ]);
    pollCreateMock.mockResolvedValue({ id: "poll_1" });

    await createDraftPoll(
      {
        communityId: "community_1",
        question: "Should the next shielded rollout proceed on mainnet?",
        opensAt: "2026-04-21T12:00:00.000Z",
        closesAt: "2026-04-22T12:00:00.000Z",
        optionALabel: "Approve",
        optionBLabel: "Reject",
        audience: "DAO_MEMBERS"
      },
      "admin_1"
    );

    expect(daoMemberFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { communityId: "community_1", status: "ACTIVE" }
    }));
    expect(pollCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          communityId: "community_1",
          audience: "DAO_MEMBERS",
          voterAccesses: {
            create: [
              expect.objectContaining({
                nick: "michae2xl",
                signalUsername: "michae2xl.42"
              })
            ]
          }
        })
      })
    );
  });

  it("stores membership actions on DAO member poll drafts", async () => {
    daoMemberFindManyMock.mockResolvedValue([
      { nick: "michae2xl", signalUsername: "michae2xl.42" }
    ]);
    daoMemberFindFirstMock.mockResolvedValue(null);
    pollCreateMock.mockResolvedValue({ id: "poll_1" });

    await createDraftPoll(
      {
        communityId: "community_1",
        question: "Should alice join the Zechub DAO voter basket?",
        opensAt: "2026-04-21T12:00:00.000Z",
        closesAt: "2026-04-22T12:00:00.000Z",
        optionALabel: "Approve",
        optionBLabel: "Reject",
        audience: "DAO_MEMBERS",
        membershipAction: {
          type: "ADD_MEMBER",
          nick: "alice",
          signalUsername: "alice_user.99"
        }
      },
      "admin_1"
    );

    expect(pollCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          membershipAction: {
            create: {
              type: "ADD_MEMBER",
              nick: "alice",
              signalUsername: "alice_user.99"
            }
          }
        })
      })
    );
  });
});
