import { createHash } from "node:crypto";
import { Prisma, type PollComment, type PollStatus, type User } from "@prisma/client";
import { z } from "zod";
import type { SessionPayload } from "@/lib/auth/guards";
import { pollManagementWhere } from "@/lib/auth/poll-ownership";
import { db } from "@/lib/db";
import { getDefaultPollFeeZat } from "@/lib/config/polls";
import { daoRosterSelection, snapshotDaoRoster } from "@/lib/domain/dao-roster";
import { getPollOptionEntries } from "@/lib/domain/options";
import { MIN_POLL_WINDOW_MS } from "@/lib/domain/poll-window";
import { UNPUBLISHED_POLL_STATUSES } from "@/lib/domain/polls";
import { proposalContentHash, PROPOSAL_CONTENT_HASH_VERSION } from "@/lib/domain/proposal-content";
import { normalizeProposalTags, proposalTagsSchema, type ProposalTagId } from "@/lib/domain/proposal-tags";
import { formatTreasuryZec, type TreasuryKindValue } from "@/lib/domain/treasury";
import { parseProposalUsdCents, proposalUsdDecimal } from "@/lib/domain/proposal-funding";
import { DEFAULT_PASSING_THRESHOLD_PERCENT, DEFAULT_QUORUM_PERCENT, DEFAULT_VOTE_MODEL, normalizeGovernanceRules } from "@/lib/domain/governance";
import { manageableCommunityWhere } from "@/lib/services/communities";
import { debitParticipationCredits, getParticipationContext } from "@/lib/services/participation-credits";

export class ProposalDiscussionError extends Error {
  constructor(message: string, public readonly status: 400 | 404 | 409 | 429, public readonly code: string) {
    super(message);
    this.name = "ProposalDiscussionError";
  }
}

export type ProposalDetail = {
  id: string;
  community: { id: string; name: string; slug: string };
  title: string;
  body: string;
  tags: ProposalTagId[];
  status: PollStatus;
  opensAt: string;
  closesAt: string;
  treasury: { id: string; kind: TreasuryKindValue; currency: string } | null;
  requestedAmountZec: string | null;
  requestedAmountUsd: string | null;
  canEditDraft: boolean;
  governance: ReturnType<typeof normalizeGovernanceRules>;
  membershipChange: { type: "ADD_MEMBER" | "REMOVE_MEMBER"; status: "PENDING" | "APPLIED" | "REJECTED"; nick?: string; request?: { status: string } | null } | null;
};

export type ProposalCommentView = {
  id: string;
  parentId: string | null;
  authorLabel: string;
  authorNick: string;
  authorAvatarUrl: string | null;
  createdAt: string;
  body: string | null;
  hidden: boolean;
  moderation: { reason: string; moderatorLabel: string; hiddenAt: string } | null;
  reaction: { count: number; likedByMe: boolean; chargedBefore: boolean };
};

export type DiscussionParticipationView = {
  communityId: string;
  mode: "FREE" | "CREDITS";
  commentCost: number;
  reactionCost: number;
  version: number;
  availableCredits: number | null;
  paymentReview?: boolean;
  sponsored: boolean;
  sandbox: boolean;
};

export type ProposalDiscussionView = {
  comments: ProposalCommentView[];
  capabilities: { canPost: boolean; canModerate: boolean; canReact: boolean };
  policy: { visibility: "INVITED_PARTICIPANTS"; immutable: true; maxLength: 4000; readOnly: boolean; participation: DiscussionParticipationView };
};

const proposalInputSchema = z.object({
  title: z.string().trim().min(12).max(200),
  body: z.string().trim().min(20).max(40_000),
  tags: proposalTagsSchema.optional(),
  treasuryId: z.string().trim().min(1).nullable().optional(),
  requestedAmountUsd: z.string().trim().max(32).nullable().optional(),
  opensAt: z.string().datetime(),
  closesAt: z.string().datetime()
}).strict().superRefine((value, ctx) => {
  if (new Date(value.closesAt).getTime() - new Date(value.opensAt).getTime() < MIN_POLL_WINDOW_MS) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["closesAt"], message: "Voting must remain open for at least 24 hours" });
  }
  if (Boolean(value.treasuryId) !== Boolean(value.requestedAmountUsd)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["requestedAmountUsd"], message: "Choose a fund and a positive USD amount together" });
  }
  if (value.requestedAmountUsd) {
    try { parseProposalUsdCents(value.requestedAmountUsd); } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["requestedAmountUsd"], message: "Enter a positive USD amount with up to two decimal places" });
    }
  }
});
export type CommunityProposalInput = z.input<typeof proposalInputSchema>;

const proposalSelection = {
  id: true, communityId: true, question: true, proposalBody: true, proposalTags: true, status: true,
  opensAt: true, closesAt: true, requestedAmountZat: true, requestedAmountUsdCents: true,
  voteModel: true, quorumPercent: true, passingThresholdPercent: true,
  membershipAction: { select: { type: true, status: true, nick: true, request: { select: { status: true } } } },
  community: { select: { id: true, name: true, slug: true } },
  treasury: { select: { id: true, kind: true, currency: true } }
} satisfies Prisma.PollSelect;
type ProposalRow = Prisma.PollGetPayload<{ select: typeof proposalSelection }>;
type Actor = { userId: string; authorLabel: string; accessId?: never } | { accessId: string; authorLabel: string; userId?: never };

function notFound(): never {
  throw new ProposalDiscussionError("Proposal not found", 404, "PROPOSAL_NOT_FOUND");
}

function proposalView(poll: ProposalRow, manager: boolean): ProposalDetail {
  if (!poll.communityId || !poll.community) return notFound();
  return {
    id: poll.id, community: poll.community, title: poll.question, body: poll.proposalBody ?? "",
    tags: normalizeProposalTags(poll.proposalTags ?? []),
    status: poll.status, opensAt: poll.opensAt.toISOString(), closesAt: poll.closesAt.toISOString(),
    treasury: poll.treasury,
    requestedAmountZec: poll.requestedAmountZat == null ? null : formatTreasuryZec(poll.requestedAmountZat),
    requestedAmountUsd: poll.requestedAmountUsdCents == null ? null : proposalUsdDecimal(poll.requestedAmountUsdCents),
    governance: normalizeGovernanceRules(poll),
    membershipChange: poll.membershipAction ?? null,
    canEditDraft: manager && poll.status === "DRAFT" && !poll.membershipAction
  };
}

const commentProfileInclude = {
  authorUser: { select: { displayName: true, avatarUrl: true, shareProfileInDiscussion: true, status: true } }
} satisfies Prisma.PollCommentInclude;
type CommentWithProfile = PollComment & {
  authorUser?: Pick<User, "displayName" | "avatarUrl" | "shareProfileInDiscussion" | "status"> | null;
};

function commentView(comment: CommentWithProfile, reaction = { count: 0, likedByMe: false, chargedBefore: false }): ProposalCommentView {
  const profile = comment.authorUserId && !comment.authorPollVoterAccessId
    && comment.authorUser?.status === "ACTIVE" && comment.authorUser.shareProfileInDiscussion
    ? comment.authorUser : null;
  return {
    id: comment.id, parentId: comment.parentId,
    authorLabel: profile?.displayName || comment.authorLabel,
    authorNick: comment.authorLabel, authorAvatarUrl: profile?.avatarUrl ?? null,
    createdAt: comment.createdAt.toISOString(), body: comment.hiddenAt ? null : comment.body,
    hidden: Boolean(comment.hiddenAt), reaction: comment.hiddenAt ? { count: 0, likedByMe: false, chargedBefore: false } : reaction,
    moderation: comment.hiddenAt ? {
      reason: comment.hideReason!, moderatorLabel: comment.hiddenByLabel!, hiddenAt: comment.hiddenAt.toISOString()
    } : null
  };
}

async function serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) {
        if (attempt < 2) continue;
        throw new ProposalDiscussionError("Another update occurred. Please try again", 409, "CONCURRENT_UPDATE");
      }
      throw error;
    }
  }
  throw new Error("Unreachable transaction retry");
}

async function authorize(tx: Prisma.TransactionClient, pollId: string, session: SessionPayload, expectedCommunityId?: string) {
  const now = new Date();
  let actor: Actor;
  let scope: Prisma.PollWhereInput;
  if (session.subjectType === "user") {
    const user = await tx.user.findFirst({ where: { id: session.userId, status: "ACTIVE" }, select: { id: true, nick: true } });
    if (!user) return notFound();
    actor = { userId: user.id, authorLabel: user.nick };
    scope = { OR: [pollManagementWhere(user.id), {
      status: { notIn: UNPUBLISHED_POLL_STATUSES }, eligibility: { some: { userId: user.id, user: { status: "ACTIVE" } } }
    }] };
  } else {
    if (session.pollId !== pollId) return notFound();
    const access = await tx.pollVoterAccess.findFirst({
      where: { id: session.pollVoterAccessId, pollId, status: "ACTIVE", expiresAt: { gt: now } }, select: { id: true, nick: true }
    });
    if (!access) return notFound();
    actor = { accessId: access.id, authorLabel: access.nick };
    scope = { status: { notIn: UNPUBLISHED_POLL_STATUSES }, voterAccesses: { some: { id: access.id, status: "ACTIVE", expiresAt: { gt: now } } } };
  }
  const poll = await tx.poll.findFirst({
    where: { id: pollId, communityId: expectedCommunityId ?? { not: null }, ...scope }, select: proposalSelection
  });
  if (!poll?.communityId || !poll.community || (expectedCommunityId && poll.communityId !== expectedCommunityId)) return notFound();
  const manager = actor.userId ? Boolean(await tx.communityMembership.findFirst({
    where: { communityId: poll.communityId, userId: actor.userId, status: "ACTIVE", role: { in: ["OWNER", "MANAGER"] }, user: { status: "ACTIVE" } }, select: { id: true }
  })) : false;
  return { poll, actor, manager };
}

export async function readProposalDetail(pollId: string, session: SessionPayload, expectedCommunityId?: string): Promise<ProposalDetail> {
  return db.$transaction(async (tx) => {
    const { poll, manager } = await authorize(tx, pollId, session, expectedCommunityId);
    return proposalView(poll, manager);
  });
}

function parseProposalInput(input: unknown) {
  const parsed = proposalInputSchema.safeParse(input);
  if (!parsed.success) throw new ProposalDiscussionError("Enter a title, proposal text, valid funding request and voting dates", 400, "INVALID_PROPOSAL_INPUT");
  return parsed.data;
}

async function managedCommunity(tx: Prisma.TransactionClient, communityId: string, userId: string) {
  if (!communityId.trim() || !userId.trim()) return notFound();
  const community = await tx.community.findFirst({ where: { id: communityId, ...manageableCommunityWhere(userId) }, select: { id: true, name: true, slug: true } });
  if (!community) return notFound();
  return community;
}

async function proposalFunding(tx: Prisma.TransactionClient, communityId: string, input: z.output<typeof proposalInputSchema>) {
  if (!input.treasuryId) return { treasuryId: null, requestedAmountZat: null, requestedAmountUsdCents: null };
  const treasury = await tx.communityTreasury.findFirst({ where: { id: input.treasuryId, communityId, currency: "ZEC" }, select: { id: true } });
  if (!treasury) throw new ProposalDiscussionError("Fund not found", 404, "TREASURY_NOT_FOUND");
  return { treasuryId: treasury.id, requestedAmountZat: null, requestedAmountUsdCents: parseProposalUsdCents(input.requestedAmountUsd!) };
}

export async function createCommunityProposal(communityId: string, userId: string, input: CommunityProposalInput): Promise<ProposalDetail> {
  const parsed = parseProposalInput(input);
  const tags = normalizeProposalTags(parsed.tags ?? []);
  return serializable(async (tx) => {
    const community = await managedCommunity(tx, communityId, userId);
    const funding = await proposalFunding(tx, community.id, parsed);
    const members = await tx.daoMember.findMany({
      where: { communityId: community.id, status: "ACTIVE" }, orderBy: [{ nick: "asc" }, { id: "asc" }], select: daoRosterSelection
    });
    const roster = snapshotDaoRoster(members, new Date(parsed.closesAt));
    if (!roster.eligibility.create.length && !roster.voterAccesses.create.length) throw new ProposalDiscussionError("Add community members before creating a proposal", 409, "DAO_MEMBER_BASKET_EMPTY");
    const poll = await tx.poll.create({
      data: {
        communityId: community.id, createdById: userId, question: parsed.title, proposalBody: parsed.body, proposalTags: tags,
        ...funding, contentHashVersion: PROPOSAL_CONTENT_HASH_VERSION,
        questionHash: proposalContentHash({ communityId: community.id, title: parsed.title, body: parsed.body, tags, optionLabels: ["Approve", "Reject", "Abstain"], ...funding }),
        optionALabel: "Approve", optionBLabel: "Reject", optionCLabel: "Abstain", audience: "DAO_MEMBERS",
        voteModel: DEFAULT_VOTE_MODEL, quorumPercent: DEFAULT_QUORUM_PERCENT, passingThresholdPercent: DEFAULT_PASSING_THRESHOLD_PERCENT,
        feeZat: getDefaultPollFeeZat(), opensAt: new Date(parsed.opensAt), closesAt: new Date(parsed.closesAt),
        ...roster,
        tally: { create: {} }
      }, select: proposalSelection
    });
    return proposalView(poll, true);
  });
}

export async function saveCommunityProposalDraft(communityId: string, pollId: string, userId: string, input: CommunityProposalInput): Promise<ProposalDetail> {
  const parsed = parseProposalInput(input);
  return serializable(async (tx) => {
    const community = await managedCommunity(tx, communityId, userId);
    const poll = await tx.poll.findFirst({ where: { id: pollId, communityId: community.id }, select: { ...proposalSelection, optionALabel: true, optionBLabel: true, optionCLabel: true, optionDLabel: true, optionELabel: true } });
    if (!poll) return notFound();
    if (poll.status !== "DRAFT") throw new ProposalDiscussionError("Only a draft can be edited", 409, "PROPOSAL_NOT_DRAFT");
    if (poll.membershipAction) throw new ProposalDiscussionError("Membership drafts cannot be changed with the general proposal editor", 409, "MEMBERSHIP_PROPOSAL_EDIT_UNSUPPORTED");
    // Older clients omit tags; only an explicit empty array removes the draft's tags.
    const tags = normalizeProposalTags(parsed.tags ?? poll.proposalTags ?? []);
    const funding = await proposalFunding(tx, community.id, parsed);
    const updated = await tx.poll.updateMany({
      where: { id: poll.id, communityId: community.id, status: "DRAFT" },
      data: {
        question: parsed.title, proposalBody: parsed.body, proposalTags: tags, ...funding,
        contentHashVersion: PROPOSAL_CONTENT_HASH_VERSION,
        questionHash: proposalContentHash({ communityId: community.id, title: parsed.title, body: parsed.body, tags, optionLabels: getPollOptionEntries(poll).map(({ label }) => label), ...funding }),
        opensAt: new Date(parsed.opensAt), closesAt: new Date(parsed.closesAt)
      }
    });
    if (updated.count !== 1) throw new ProposalDiscussionError("Only a draft can be edited", 409, "PROPOSAL_NOT_DRAFT");
    await tx.pollVoterAccess.updateMany({ where: { pollId: poll.id }, data: { expiresAt: new Date(parsed.closesAt) } });
    const saved = await tx.poll.findFirst({ where: { id: poll.id, communityId: community.id }, select: proposalSelection });
    if (!saved) return notFound();
    return proposalView(saved, true);
  });
}

function discussionActorKey(actor: Actor) {
  return actor.userId ? `user:${actor.userId}` : `access:${actor.accessId}`;
}

function creditActor(actor: Actor) {
  return actor.userId ? { userId: actor.userId } : { accessId: actor.accessId! };
}

function requestHash(payload: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function participationView(context: Awaited<ReturnType<typeof getParticipationContext>>): DiscussionParticipationView {
  return {
    communityId: context.communityId, mode: context.mode,
    commentCost: context.commentCost, reactionCost: context.reactionCost,
    version: context.version, availableCredits: context.balance, paymentReview: context.paymentReview ?? false,
    sponsored: context.sponsored, sandbox: context.sandbox
  };
}

async function reactionsForComments(tx: Prisma.TransactionClient, comments: CommentWithProfile[], actor: Actor) {
  const ids = comments.filter((comment) => !comment.hiddenAt).map((comment) => comment.id);
  const reactions = new Map<string, ProposalCommentView["reaction"]>();
  if (ids.length === 0) return reactions;
  const counts = await tx.pollCommentReaction.groupBy({
    by: ["commentId"], where: { commentId: { in: ids }, active: true }, _count: { _all: true }
  });
  const own = await tx.pollCommentReaction.findMany({
    where: { commentId: { in: ids }, actorKey: discussionActorKey(actor) },
    select: { commentId: true, active: true, chargedBefore: true }
  });
  for (const id of ids) {
    const reaction = own.find((entry) => entry.commentId === id);
    reactions.set(id, {
      count: counts.find((entry) => entry.commentId === id)?._count._all ?? 0,
      likedByMe: reaction?.active ?? false, chargedBefore: reaction?.chargedBefore ?? false
    });
  }
  return reactions;
}

async function actorCommentView(tx: Prisma.TransactionClient, comment: CommentWithProfile, actor: Actor) {
  return commentView(comment, (await reactionsForComments(tx, [comment], actor)).get(comment.id));
}

const requestKeySchema = z.string().trim().min(8).max(128).regex(/^[^\u0000-\u001f\u007f]+$/);
const policyVersionSchema = z.number().int().positive().max(2_147_483_647);
const commentInputSchema = z.object({
  body: z.string().trim().min(1).max(4000), parentId: z.string().min(1).nullable().optional(),
  requestKey: requestKeySchema.optional(), policyVersion: policyVersionSchema.optional()
}).strict();
const reactionInputSchema = z.object({
  liked: z.boolean(), requestKey: requestKeySchema, policyVersion: policyVersionSchema.optional()
}).strict();

export async function readProposalDiscussion(pollId: string, session: SessionPayload): Promise<ProposalDiscussionView> {
  return db.$transaction(async (tx) => {
    const { poll, actor, manager } = await authorize(tx, pollId, session);
    const comments = await tx.pollComment.findMany({ where: { pollId: poll.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: commentProfileInclude });
    const reactions = await reactionsForComments(tx, comments, actor);
    const participation = participationView(await getParticipationContext(tx, poll.communityId!, creditActor(actor)));
    const readOnly = poll.status === "ARCHIVED";
    return {
      comments: comments.map((comment) => commentView(comment, reactions.get(comment.id))),
      capabilities: { canPost: !readOnly, canModerate: manager && !readOnly, canReact: !readOnly },
      policy: { visibility: "INVITED_PARTICIPANTS", immutable: true, maxLength: 4000, readOnly, participation }
    };
  });
}

export async function postProposalComment(pollId: string, session: SessionPayload, input: unknown): Promise<ProposalCommentView> {
  const parsed = commentInputSchema.safeParse(input);
  if (!parsed.success) throw new ProposalDiscussionError("Enter a comment between 1 and 4,000 characters", 400, "INVALID_COMMENT_INPUT");
  return serializable(async (tx) => {
    const { poll, actor } = await authorize(tx, pollId, session);
    const author = actor.userId ? { authorUserId: actor.userId } : { authorPollVoterAccessId: actor.accessId };
    const hash = requestHash({ pollId: poll.id, body: parsed.data.body, parentId: parsed.data.parentId ?? null });
    if (parsed.data.requestKey) {
      const existing = await tx.pollComment.findFirst({
        where: { pollId: poll.id, ...author, requestKey: parsed.data.requestKey }, include: commentProfileInclude
      });
      if (existing) {
        if (existing.requestHash !== hash) throw new ProposalDiscussionError("This request key was used for another comment", 409, "COMMENT_IDEMPOTENCY_CONFLICT");
        return actorCommentView(tx, existing, actor);
      }
    }
    if (poll.status === "ARCHIVED") throw new ProposalDiscussionError("Archived discussions are read only", 409, "DISCUSSION_READ_ONLY");
    if (parsed.data.parentId) {
      const parent = await tx.pollComment.findFirst({ where: { id: parsed.data.parentId, pollId: poll.id }, select: { id: true, parentId: true, hiddenAt: true } });
      if (!parent || parent.hiddenAt) throw new ProposalDiscussionError("Parent comment not found", 404, "PARENT_COMMENT_NOT_FOUND");
    }
    const participation = await getParticipationContext(tx, poll.communityId!, creditActor(actor));
    if (participation.effectiveCommentCost > 0 && !parsed.data.requestKey) {
      throw new ProposalDiscussionError("Provide a request key for a paid comment", 400, "COMMENT_REQUEST_KEY_REQUIRED");
    }
    const recentCount = await tx.pollComment.count({ where: { pollId: poll.id, ...author, createdAt: { gte: new Date(Date.now() - 60_000) } } });
    if (recentCount >= 5) throw new ProposalDiscussionError("Wait a minute before adding another comment", 429, "COMMENT_RATE_LIMIT");
    if (participation.effectiveCommentCost > 0 && actor.userId) {
      await debitParticipationCredits(tx, {
        communityId: poll.communityId!, userId: actor.userId, cost: participation.effectiveCommentCost,
        kind: "COMMENT", targetId: poll.id, requestKey: `comment:${requestHash({ requestKey: parsed.data.requestKey! })}`,
        payloadHash: hash, policyVersion: parsed.data.policyVersion
      });
    }
    const comment = await tx.pollComment.create({
      data: {
        pollId: poll.id, parentId: parsed.data.parentId ?? null, ...author,
        authorLabel: actor.authorLabel, body: parsed.data.body,
        ...(parsed.data.requestKey ? { requestKey: parsed.data.requestKey, requestHash: hash } : {})
      }, include: commentProfileInclude
    });
    return actorCommentView(tx, comment, actor);
  });
}

export async function setProposalCommentReaction(pollId: string, commentId: string, session: SessionPayload, input: unknown): Promise<ProposalCommentView> {
  const parsed = reactionInputSchema.safeParse(input);
  if (!parsed.success) throw new ProposalDiscussionError("Provide a reaction state and request key", 400, "INVALID_REACTION_INPUT");
  return serializable(async (tx) => {
    const { poll, actor } = await authorize(tx, pollId, session);
    const actorKey = discussionActorKey(actor);
    const comment = await tx.pollComment.findFirst({ where: { id: commentId, pollId: poll.id }, include: commentProfileInclude });
    if (!comment || comment.hiddenAt) throw new ProposalDiscussionError("Comment not found", 404, "COMMENT_NOT_FOUND");
    const hash = requestHash({ pollId: poll.id, commentId, liked: parsed.data.liked });
    const replay = await tx.pollCommentReactionRequest.findUnique({
      where: { pollId_actorKey_requestKey: { pollId: poll.id, actorKey, requestKey: parsed.data.requestKey } }
    });
    if (replay) {
      if (replay.payloadHash !== hash) throw new ProposalDiscussionError("This request key was used for another reaction", 409, "REACTION_IDEMPOTENCY_CONFLICT");
      return actorCommentView(tx, comment, actor);
    }
    if (poll.status === "ARCHIVED") throw new ProposalDiscussionError("Archived discussions are read only", 409, "DISCUSSION_READ_ONLY");
    const recentCount = await tx.pollCommentReactionRequest.count({
      where: { pollId: poll.id, actorKey, createdAt: { gte: new Date(Date.now() - 60_000) } }
    });
    if (recentCount >= 30) throw new ProposalDiscussionError("Wait a minute before adding another reaction", 429, "REACTION_RATE_LIMIT");
    const reaction = await tx.pollCommentReaction.findUnique({ where: { commentId_actorKey: { commentId, actorKey } } });
    let chargedBefore = reaction?.chargedBefore ?? false;
    if (parsed.data.liked && !reaction?.active && !chargedBefore) {
      const participation = await getParticipationContext(tx, poll.communityId!, creditActor(actor));
      if (participation.effectiveReactionCost > 0 && actor.userId) {
        await debitParticipationCredits(tx, {
          communityId: poll.communityId!, userId: actor.userId, cost: participation.effectiveReactionCost,
          kind: "REACTION", targetId: commentId, requestKey: `reaction:${commentId}`,
          payloadHash: requestHash({ pollId: poll.id, commentId, actorKey }), policyVersion: parsed.data.policyVersion
        });
        chargedBefore = true;
      }
    }
    const author = actor.userId ? { authorUserId: actor.userId } : { authorPollVoterAccessId: actor.accessId };
    await tx.pollCommentReaction.upsert({
      where: { commentId_actorKey: { commentId, actorKey } },
      create: { pollId: poll.id, commentId, actorKey, ...author, active: parsed.data.liked, chargedBefore },
      update: { active: parsed.data.liked, chargedBefore }
    });
    await tx.pollCommentReactionRequest.create({
      data: { pollId: poll.id, commentId, actorKey, requestKey: parsed.data.requestKey, payloadHash: hash, liked: parsed.data.liked }
    });
    return actorCommentView(tx, comment, actor);
  });
}

export async function hideProposalComment(pollId: string, commentId: string, session: SessionPayload, input: unknown): Promise<ProposalCommentView> {
  const parsed = z.object({ reason: z.string().trim().min(1).max(500) }).strict().safeParse(input);
  if (!parsed.success) throw new ProposalDiscussionError("Give a moderation reason between 1 and 500 characters", 400, "INVALID_MODERATION_INPUT");
  return serializable(async (tx) => {
    const { poll, actor, manager } = await authorize(tx, pollId, session);
    if (!manager || !actor.userId) throw new ProposalDiscussionError("Comment not found", 404, "COMMENT_NOT_FOUND");
    if (poll.status === "ARCHIVED") throw new ProposalDiscussionError("Archived discussions are read only", 409, "DISCUSSION_READ_ONLY");
    const comment = await tx.pollComment.findFirst({ where: { id: commentId, pollId: poll.id }, include: commentProfileInclude });
    if (!comment) throw new ProposalDiscussionError("Comment not found", 404, "COMMENT_NOT_FOUND");
    if (comment.hiddenAt) throw new ProposalDiscussionError("Comment is already hidden", 409, "COMMENT_ALREADY_HIDDEN");
    const hiddenAt = new Date();
    const result = await tx.pollComment.updateMany({
      where: { id: comment.id, pollId: poll.id, hiddenAt: null },
      data: { hiddenAt, hiddenByUserId: actor.userId, hiddenByLabel: actor.authorLabel, hideReason: parsed.data.reason }
    });
    if (result.count !== 1) throw new ProposalDiscussionError("Comment is already hidden", 409, "COMMENT_ALREADY_HIDDEN");
    return commentView({ ...comment, hiddenAt, hiddenByUserId: actor.userId, hiddenByLabel: actor.authorLabel, hideReason: parsed.data.reason });
  });
}
