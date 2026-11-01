import {
  DaoMembershipActionType,
  DaoMemberStatus,
  PollAudience,
  PollStatus
} from "@prisma/client";
import { z } from "zod";
import { buildAnchorMemo, normalizeQuestion, questionHash } from "@/lib/domain/polls";
import { generateInviteToken } from "@/lib/domain/invites";
import { getDefaultPollFeeZat } from "@/lib/config/polls";
import { db } from "@/lib/db";
import { getPollOptionEntries, normalizeOptionLabel } from "@/lib/domain/options";
import { hasValidProposalContentHash, isProposalContentHashVersion } from "@/lib/domain/proposal-content";
import { signalUsernameSchema } from "@/lib/domain/signal";
import {
  DEFAULT_PASSING_THRESHOLD_PERCENT,
  DEFAULT_QUORUM_PERCENT,
  DEFAULT_VOTE_MODEL
} from "@/lib/domain/governance";
import { MIN_POLL_WINDOW_HOURS, MIN_POLL_WINDOW_MS } from "@/lib/domain/poll-window";
import { recordPollCreatedAuditEvent } from "@/lib/services/public-audit-events";
import { readActiveDaoMemberVoters } from "@/lib/services/dao-members";
import { findManagedCommunity } from "@/lib/services/communities";
import { snapshotDaoRoster } from "@/lib/domain/dao-roster";
import { MEMBERSHIP_CONTENT_VERSION, validMembershipCommitment } from "@/lib/domain/membership-content";

export class PollServiceError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 409,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "PollServiceError";
  }
}

export const pollVoterInputSchema = z.object({
  nick: z.string().trim().min(1),
  signalUsername: signalUsernameSchema
});

const membershipActionInputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ADD_MEMBER"),
    nick: z.string().trim().min(1),
    signalUsername: signalUsernameSchema
  }),
  z.object({
    type: z.literal("REMOVE_MEMBER"),
    targetMemberId: z.string().min(1)
  })
]);

export const createDraftPollInputSchema = z
  .object({
    communityId: z.string().trim().min(1),
    question: z.string().min(12),
    opensAt: z.string().datetime(),
    closesAt: z.string().datetime(),
    optionALabel: z.string().min(1),
    optionBLabel: z.string().min(1),
    optionCLabel: z.string().optional().default(""),
    optionDLabel: z.string().optional().default(""),
    optionELabel: z.string().optional().default(""),
    audience: z.nativeEnum(PollAudience).default(PollAudience.CUSTOM),
    voters: z.array(pollVoterInputSchema).default([]),
    membershipAction: membershipActionInputSchema.optional()
  })
  .superRefine((value, ctx) => {
    const opensAtMs = new Date(value.opensAt).getTime();
    const closesAtMs = new Date(value.closesAt).getTime();

    if (closesAtMs <= opensAtMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["closesAt"],
        message: "closesAt must be after opensAt"
      });
    } else if (closesAtMs - opensAtMs < MIN_POLL_WINDOW_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["closesAt"],
        message: `Poll window must be at least ${MIN_POLL_WINDOW_HOURS} hours for global voters`
      });
    }

    if (value.audience === PollAudience.CUSTOM && value.voters.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["voters"],
        message: "Add at least one voter or use the DAO member basket"
      });
    }

    if (value.membershipAction && value.audience !== PollAudience.DAO_MEMBERS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["membershipAction"],
        message: "membership proposals must use the DAO member basket"
      });
    }

    const seenNicks = new Set<string>();
    const seenSignalUsernames = new Set<string>();

    value.voters.forEach((voter, index) => {
      if (
        seenNicks.has(voter.nick) ||
        seenSignalUsernames.has(voter.signalUsername)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["voters", index],
          message: "duplicate voter"
        });
        return;
      }

      seenNicks.add(voter.nick);
      seenSignalUsernames.add(voter.signalUsername);
    });

    if (normalizeOptionLabel(value.optionDLabel) || normalizeOptionLabel(value.optionELabel)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["optionDLabel"],
        message: "single-choice polls support A/B and optional C abstain only"
      });
    }
  })
  .transform((value) => {
    const question = normalizeQuestion(value.question);
    const optionALabel = normalizeOptionLabel(value.optionALabel);
    const optionBLabel = normalizeOptionLabel(value.optionBLabel);
    const optionCLabel = normalizeOptionLabel(value.optionCLabel);
    const optionDLabel = normalizeOptionLabel(value.optionDLabel);
    const optionELabel = normalizeOptionLabel(value.optionELabel);
    const optionLabels = [
      optionALabel,
      optionBLabel,
      optionCLabel,
      optionDLabel,
      optionELabel
    ].filter(Boolean);

    return {
      ...value,
      question,
      optionALabel,
      optionBLabel,
      optionCLabel: optionCLabel || undefined,
      optionDLabel: optionDLabel || undefined,
      optionELabel: optionELabel || undefined,
      questionHash: questionHash(question, optionLabels)
    };
  });

export async function createDraftPoll(
  input: z.input<typeof createDraftPollInputSchema>,
  createdById: string
) {
  const parsed = createDraftPollInputSchema.parse(input);
  const community = await findManagedCommunity(parsed.communityId, createdById);
  if (!community) {
    throw new PollServiceError("Community not found", 404, "COMMUNITY_NOT_FOUND");
  }
  const voters = parsed.voters;
  let accountRoster: ReturnType<typeof snapshotDaoRoster> | undefined;
  let membershipActionCreate:
    | {
        type: DaoMembershipActionType;
        nick: string;
        signalUsername: string | null;
        targetMemberId?: string;
      }
    | undefined;

  if (parsed.audience === PollAudience.DAO_MEMBERS) {
    accountRoster = snapshotDaoRoster(await readActiveDaoMemberVoters(community.id), new Date(parsed.closesAt));
    if (!accountRoster.eligibility.create.length && !accountRoster.voterAccesses.create.length) {
      throw new PollServiceError(
        "DAO member basket is empty",
        409,
        "DAO_MEMBER_BASKET_EMPTY"
      );
    }
  }

  if (parsed.membershipAction?.type === "ADD_MEMBER") {
    const existingActiveMember = await db.daoMember.findFirst({
      where: {
        communityId: community.id,
        status: DaoMemberStatus.ACTIVE,
        OR: [
          { nick: parsed.membershipAction.nick },
          { signalUsername: parsed.membershipAction.signalUsername }
        ]
      },
      select: {
        id: true
      }
    });

    if (existingActiveMember) {
      throw new PollServiceError(
        "DAO member is already active",
        409,
        "DAO_MEMBER_ALREADY_ACTIVE"
      );
    }

    membershipActionCreate = {
      type: DaoMembershipActionType.ADD_MEMBER,
      nick: parsed.membershipAction.nick,
      signalUsername: parsed.membershipAction.signalUsername
    };
  } else if (parsed.membershipAction?.type === "REMOVE_MEMBER") {
    const targetMember = await db.daoMember.findFirst({
      where: {
        id: parsed.membershipAction.targetMemberId,
        communityId: community.id,
        status: DaoMemberStatus.ACTIVE
      },
      select: {
        id: true,
        nick: true,
        signalUsername: true
      }
    });

    if (!targetMember) {
      throw new PollServiceError(
        "DAO member not found",
        404,
        "DAO_MEMBER_NOT_FOUND"
      );
    }

    membershipActionCreate = {
      type: DaoMembershipActionType.REMOVE_MEMBER,
      nick: targetMember.nick,
      signalUsername: targetMember.signalUsername,
      targetMemberId: targetMember.id
    };
  }

  return db.poll.create({
    data: {
      communityId: community.id,
      question: parsed.question,
      optionALabel: parsed.optionALabel,
      optionBLabel: parsed.optionBLabel,
      optionCLabel: parsed.optionCLabel,
      optionDLabel: parsed.optionDLabel,
      optionELabel: parsed.optionELabel,
      voteModel: DEFAULT_VOTE_MODEL,
      quorumPercent: DEFAULT_QUORUM_PERCENT,
      passingThresholdPercent: DEFAULT_PASSING_THRESHOLD_PERCENT,
      audience: parsed.audience,
      questionHash: parsed.questionHash,
      feeZat: getDefaultPollFeeZat(),
      opensAt: new Date(parsed.opensAt),
      closesAt: new Date(parsed.closesAt),
      createdById,
      voterAccesses: {
        create: voters.map((voter) => ({
          nick: voter.nick,
          signalUsername: voter.signalUsername,
          inviteToken: generateInviteToken(),
          expiresAt: new Date(parsed.closesAt)
        }))
      },
      ...accountRoster,
      membershipAction: membershipActionCreate
        ? {
            create: membershipActionCreate
          }
        : undefined,
      tally: {
        create: {}
      }
    }
  });
}

export async function buildAndStoreAnchorMemo(pollId: string) {
  const poll = await db.poll.findUnique({
    where: { id: pollId }, include: { membershipAction: true }
  });

  if (!poll) {
    throw new PollServiceError("poll not found", 404, "POLL_NOT_FOUND");
  }

  if (poll.status !== PollStatus.DRAFT) {
    throw new PollServiceError(
      "poll must be draft before anchoring",
      409,
      "POLL_NOT_DRAFT"
    );
  }

  const isMembershipCommitment = poll.contentHashVersion === MEMBERSHIP_CONTENT_VERSION;
  if (isMembershipCommitment && !validMembershipCommitment(poll)) {
    throw new PollServiceError("Membership target commitment is invalid", 409, "MEMBERSHIP_COMMITMENT_INVALID");
  }
  const hasContentCommitment = !isMembershipCommitment && Boolean(poll.contentHashVersion || poll.proposalBody || poll.treasuryId ||
    (poll.proposalTags?.length ?? 0) > 0 || poll.requestedAmountZat != null || poll.requestedAmountUsdCents != null);
  if (hasContentCommitment) {
    if (!poll.communityId || !poll.proposalBody || !hasValidProposalContentHash({
        communityId: poll.communityId,
        title: poll.question,
        body: poll.proposalBody,
        tags: poll.proposalTags ?? [],
        optionLabels: getPollOptionEntries(poll).map(({ label }) => label),
        treasuryId: poll.treasuryId,
        requestedAmountZat: poll.requestedAmountZat,
        requestedAmountUsdCents: poll.requestedAmountUsdCents
      }, poll.contentHashVersion, poll.questionHash)) {
      throw new PollServiceError("Proposal content must have a verified content commitment before anchoring", 409, "PROPOSAL_CONTENT_COMMITMENT_INVALID");
    }
  }

  const started = await db.poll.updateMany({
    where: {
      id: pollId,
      status: PollStatus.DRAFT,
      questionHash: poll.questionHash,
      opensAt: poll.opensAt,
      closesAt: poll.closesAt,
      ...(isMembershipCommitment ? {
        contentHashVersion: MEMBERSHIP_CONTENT_VERSION, question: poll.question,
        voteModel: poll.voteModel, quorumPercent: poll.quorumPercent, passingThresholdPercent: poll.passingThresholdPercent,
        optionALabel: poll.optionALabel, optionBLabel: poll.optionBLabel, optionCLabel: poll.optionCLabel,
        membershipAction: { is: {
          type: poll.membershipAction!.type, nick: poll.membershipAction!.nick,
          userId: poll.membershipAction!.userId, requestId: poll.membershipAction!.requestId, targetMemberId: poll.membershipAction!.targetMemberId
        } }
      } : {}),
      ...(hasContentCommitment ? {
        contentHashVersion: poll.contentHashVersion,
        communityId: poll.communityId,
        question: poll.question,
        proposalBody: poll.proposalBody,
        proposalTags: { equals: poll.proposalTags ?? [] },
        treasuryId: poll.treasuryId,
        requestedAmountZat: poll.requestedAmountZat,
        requestedAmountUsdCents: poll.requestedAmountUsdCents ?? null,
        optionALabel: poll.optionALabel,
        optionBLabel: poll.optionBLabel,
        optionCLabel: poll.optionCLabel,
        optionDLabel: poll.optionDLabel,
        optionELabel: poll.optionELabel
      } : {})
    },
    data: {
      status: PollStatus.ANCHORING
    }
  });

  if (started.count !== 1) {
    throw new PollServiceError(
      "poll must be draft before anchoring",
      409,
      "POLL_NOT_DRAFT"
    );
  }

  const memo = buildAnchorMemo({
    pollId: poll.id,
    questionHash: poll.questionHash,
    opensAt: poll.opensAt.toISOString(),
    closesAt: poll.closesAt.toISOString(),
    voteModel: poll.voteModel,
    quorumPercent: poll.quorumPercent,
    passingThresholdPercent: poll.passingThresholdPercent
  });
  return isProposalContentHashVersion(poll.contentHashVersion) || isMembershipCommitment
    ? `${memo}|CONTENT=${poll.contentHashVersion}`
    : memo;
}

export async function markPollAnchoring(pollId: string, txid: string) {
  const updated = await db.poll.updateMany({
    where: {
      id: pollId,
      status: PollStatus.ANCHORING
    },
    data: {
      status: PollStatus.SCHEDULED,
      anchorTxid: txid
    }
  });

  if (updated.count !== 1) {
    throw new PollServiceError(
      "poll must be anchoring before it can be marked anchored",
      409,
      "POLL_NOT_ANCHORING"
    );
  }

  try {
    await recordPollCreatedAuditEvent({
      pollId,
      txid
    });
  } catch (error) {
    console.error("Failed to record public audit poll-created event", {
      pollId,
      txid,
      error
    });
  }

  return updated;
}

export async function releasePollAnchoring(pollId: string) {
  const updated = await db.poll.updateMany({
    where: {
      id: pollId,
      status: PollStatus.ANCHORING,
      anchorTxid: null
    },
    data: {
      status: PollStatus.DRAFT
    }
  });

  if (updated.count !== 1) {
    throw new PollServiceError(
      "poll must be anchoring without an anchor txid to be released",
      409,
      "POLL_NOT_RELEASEABLE"
    );
  }

  return updated;
}
