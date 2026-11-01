import {
  DaoMembershipActionStatus,
  DaoMembershipActionType,
  DaoMemberStatus,
  Prisma
} from "@prisma/client";
import { db } from "@/lib/db";
import {
  calculateSingleChoiceOutcome,
  isFinalizedPollStatus,
  presentGovernanceOutcome
} from "@/lib/domain/governance";
import type { PollVoterInput } from "@/lib/domain/poll-voters";
import { normalizeSignalUsername } from "@/lib/domain/signal";
import { daoRosterSelection } from "@/lib/domain/dao-roster";
import { MEMBERSHIP_CONTENT_VERSION, validMembershipCommitment } from "@/lib/domain/membership-content";

export class DaoMemberServiceError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 409,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "DaoMemberServiceError";
  }
}

function normalizeDaoMemberInput(voter: PollVoterInput) {
  return {
    nick: voter.nick.trim(),
    signalUsername: normalizeSignalUsername(voter.signalUsername)
  };
}

function requireCommunityId(value: string) {
  const communityId = value?.trim();
  if (!communityId) {
    throw new DaoMemberServiceError(
      "A community is required",
      400,
      "COMMUNITY_REQUIRED"
    );
  }
  return communityId;
}

export async function readActiveDaoMemberVoters(scope: string) {
  const communityId = requireCommunityId(scope);
  const members = await db.daoMember.findMany({
    where: {
      communityId,
      status: DaoMemberStatus.ACTIVE
    },
    orderBy: {
      nick: "asc"
    },
    select: daoRosterSelection
  });

  return members;
}

export async function bootstrapDaoMemberBasket(input: {
  communityId: string;
  voters: PollVoterInput[];
}) {
  const communityId = requireCommunityId(input.communityId);
  const normalized = input.voters.map(normalizeDaoMemberInput);
  const seenNicks = new Set<string>();
  const seenSignalUsernames = new Set<string>();

  for (const voter of normalized) {
    if (!voter.nick || !voter.signalUsername) {
      throw new DaoMemberServiceError(
        "DAO member rows require nick and Signal username",
        400,
        "INVALID_DAO_MEMBER_INPUT"
      );
    }

    if (
      seenNicks.has(voter.nick) ||
      seenSignalUsernames.has(voter.signalUsername)
    ) {
      throw new DaoMemberServiceError(
        "duplicate DAO member",
        400,
        "DUPLICATE_DAO_MEMBER"
      );
    }

    seenNicks.add(voter.nick);
    seenSignalUsernames.add(voter.signalUsername);
  }

  if (normalized.length === 0) {
    throw new DaoMemberServiceError(
      "DAO member basket requires at least one member",
      400,
      "DAO_MEMBER_BASKET_EMPTY"
    );
  }

  return db.$transaction(async (tx) => {
    const existingCount = await tx.daoMember.count({ where: { communityId } });

    if (existingCount > 0) {
      throw new DaoMemberServiceError(
        "DAO member basket is already initialized",
        409,
        "DAO_MEMBER_BOOTSTRAP_LOCKED"
      );
    }

    await tx.daoMember.createMany({
      data: normalized.map((voter) => ({
        communityId,
        nick: voter.nick,
        signalUsername: voter.signalUsername,
        status: DaoMemberStatus.ACTIVE
      }))
    });

    return tx.daoMember.findMany({
      where: { communityId },
      orderBy: {
        nick: "asc"
      },
      select: {
        id: true,
        nick: true,
        signalUsername: true,
        status: true
      }
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function applyDaoMembershipActionForPoll(pollId: string): Promise<Awaited<ReturnType<typeof applyMembershipAction>>> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await applyMembershipAction(pollId); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 3) continue;
      throw error;
    }
  }
  throw new Error("Unreachable transaction retry");
}

async function applyMembershipAction(pollId: string) {
  return db.$transaction(async (tx) => {
    const poll = await tx.poll.findUnique({
      where: { id: pollId },
      select: {
        id: true,
        communityId: true,
        status: true,
        question: true, questionHash: true, contentHashVersion: true, opensAt: true, closesAt: true,
        optionALabel: true, optionBLabel: true, optionCLabel: true,
        voteModel: true,
        quorumPercent: true,
        passingThresholdPercent: true,
        tally: { select: { totalConfirmed: true, countA: true } },
        _count: { select: { eligibility: true, voterAccesses: true } },
        membershipAction: {
          select: {
            id: true,
            type: true,
            status: true,
            nick: true,
            signalUsername: true,
            targetMemberId: true,
            userId: true, requestId: true
          }
        }
      }
    });

    const action = poll?.membershipAction;
    if (!poll || !action || action.status !== DaoMembershipActionStatus.PENDING) {
      return null;
    }

    if (!poll.communityId) {
      throw new DaoMemberServiceError(
        "Legacy poll must be explicitly assigned to a community before executing a membership action",
        409,
        "LEGACY_POLL_UNASSIGNED"
      );
    }
    const communityId = poll.communityId;
    const accountAction = poll.contentHashVersion === MEMBERSHIP_CONTENT_VERSION || Boolean(action.userId);
    if (accountAction && !validMembershipCommitment(poll)) {
      throw new DaoMemberServiceError("Membership target commitment is invalid", 409, "MEMBERSHIP_COMMITMENT_INVALID");
    }

    // Check the target before every action update, including rejection. Never fall back to a global Signal lookup.
    if (action.type === DaoMembershipActionType.REMOVE_MEMBER) {
      if (!action.targetMemberId) {
        throw new DaoMemberServiceError(
          "Membership removal requires an explicit target member",
          400,
          "DAO_MEMBER_TARGET_REQUIRED"
        );
      }
      const target = await tx.daoMember.findFirst({
        where: { id: action.targetMemberId, communityId, ...(accountAction ? { userId: action.userId } : {}) },
        select: { id: true, communityId: true }
      });
      if (!target || target.communityId !== communityId) {
        throw new DaoMemberServiceError("DAO member not found", 404, "DAO_MEMBER_NOT_FOUND");
      }
    }

    const outcome = calculateSingleChoiceOutcome({
      isClosed: isFinalizedPollStatus(poll.status),
      totalEligible: poll._count.eligibility + poll._count.voterAccesses,
      totalConfirmed: poll.tally?.totalConfirmed ?? 0,
      countA: poll.tally?.countA ?? 0,
      voteModel: poll.voteModel,
      quorumPercent: poll.quorumPercent,
      passingThresholdPercent: poll.passingThresholdPercent
    });

    if (outcome.outcome === "PENDING") {
      return {
        pollId,
        actionId: action.id,
        status: DaoMembershipActionStatus.PENDING,
        outcome: presentGovernanceOutcome(outcome.outcome)
      };
    }

    let passed = outcome.outcome === "PASSED";
    if (accountAction && action.type === DaoMembershipActionType.ADD_MEMBER) {
      const request = action.requestId && action.userId ? await tx.daoMembershipRequest.findFirst({
        where: { id: action.requestId, communityId, userId: action.userId, action: { pollId } },
        select: { status: true, user: { select: { status: true } } }
      }) : null;
      if (!request || !["PROPOSED", "WITHDRAWN"].includes(request.status)) {
        throw new DaoMemberServiceError("Membership request is unavailable", 409, "REQUEST_NOT_AVAILABLE");
      }
      // Withdrawal or account revocation cancels admission even if the ballot passed.
      passed = passed && request.status === "PROPOSED" && request.user.status === "ACTIVE";
    }
    const status = passed ? DaoMembershipActionStatus.APPLIED : DaoMembershipActionStatus.REJECTED;
    const claimed = await tx.daoMembershipAction.updateMany({
      where: {
        id: action.id,
        pollId,
        status: DaoMembershipActionStatus.PENDING,
        poll: { communityId, status: "FINALIZED" }
      },
      data: { status, ...(passed ? { appliedAt: new Date() } : {}) }
    });

    if (claimed.count !== 1) {
      return null;
    }

    if (passed && action.type === DaoMembershipActionType.ADD_MEMBER && action.userId) {
      const existing = await tx.daoMember.findUnique({ where: { communityId_userId: { communityId, userId: action.userId } }, select: { id: true } });
      const data = { nick: action.nick, status: DaoMemberStatus.ACTIVE, addedByPollId: pollId, removedByPollId: null };
      if (existing) await tx.daoMember.update({ where: { id: existing.id }, data });
      else await tx.daoMember.create({ data: { ...data, communityId, userId: action.userId } });
    } else if (passed && action.type === DaoMembershipActionType.ADD_MEMBER) {
      if (!action.signalUsername) throw new DaoMemberServiceError("Membership identity is missing", 409, "MEMBER_IDENTITY_MISSING");
      const existing = await tx.daoMember.findFirst({
        where: {
          communityId,
          userId: null,
          OR: [{ signalUsername: action.signalUsername }, { nick: action.nick }]
        },
        select: { id: true }
      });
      const memberData = {
        nick: action.nick,
        signalUsername: action.signalUsername,
        status: DaoMemberStatus.ACTIVE,
        addedByPollId: pollId,
        removedByPollId: null
      };
      if (existing) {
        await tx.daoMember.updateMany({
          where: { id: existing.id, communityId },
          data: memberData
        });
      } else {
        await tx.daoMember.create({ data: { communityId, ...memberData } });
      }
    } else if (passed) {
      await tx.daoMember.updateMany({
        where: {
          id: action.targetMemberId!,
          communityId,
          status: DaoMemberStatus.ACTIVE
        },
        data: { status: DaoMemberStatus.REMOVED, removedByPollId: pollId }
      });
    }

    if (accountAction && action.requestId) await tx.daoMembershipRequest.updateMany({
      where: { id: action.requestId, communityId, userId: action.userId!, status: "PROPOSED" },
      data: { status: passed ? "ADMITTED" : "DECLINED" }
    });

    return {
      pollId,
      actionId: action.id,
      status,
      outcome: presentGovernanceOutcome(outcome.outcome)
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
