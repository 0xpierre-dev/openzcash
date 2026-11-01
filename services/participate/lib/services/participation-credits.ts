import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { committeeOperationsEnabled } from "@/lib/auth/committee-policy";
import { isDemoAccount } from "@/lib/auth/email-policy";
import { isPublicPilotCommittee, isVerifiedPilotAccount, publicPilotRequested, publicPilotScope } from "@/lib/auth/public-pilot-policy";
import { isCreditFundingConfigured } from "@/lib/zcash/credit-receivers";
import { UNPUBLISHED_POLL_STATUSES } from "@/lib/domain/polls";
import {
  MAX_CREDIT_BALANCE, PREVIEW_CREDIT_GRANT, participationDebitInputSchema,
  participationPolicyInputSchema, type AccountCreditsView, type ParticipationActor,
  type ParticipationContext, type ParticipationDebitInput, type ParticipationDebitResult,
  type ParticipationPolicyView
} from "@/lib/domain/participation-credits";

export class ParticipationCreditError extends Error {
  constructor(message: string, public readonly status: 400 | 403 | 404 | 409, public readonly code: string) {
    super(message);
    this.name = "ParticipationCreditError";
  }
}

const policySelection = { id: true, name: true, kind: true, participationMode: true, commentCost: true, reactionCost: true, participationPolicyVersion: true } as const;
const PREVIEW_KEY = "preview-grant:v1";

export function isParticipationCreditSandbox() {
  if (process.env.WORKSPACE_PREVIEW !== "true" || process.env.NODE_ENV === "production" || !process.env.DATABASE_URL) return false;
  try {
    const url = new URL(process.env.DATABASE_URL);
    return ["postgres:", "postgresql:"].includes(url.protocol) && url.hostname === "127.0.0.1" && url.port === (process.env.NODE_ENV === "test" ? (process.env.PARTICIPATE_TEST_PORT ?? "55438") : "55438")
      && (url.pathname === "/community_workspace"
        || (process.env.NODE_ENV === "test" && ["/community_treasury_tests", "/community_credit_tests"].includes(url.pathname)));
  } catch { return false; }
}

function notFound(): never { throw new ParticipationCreditError("Community not found", 404, "COMMUNITY_NOT_FOUND"); }
function unavailable(): never { throw new ParticipationCreditError("Credits are unavailable for this account or scope", 403, "PARTICIPATION_CREDITS_UNAVAILABLE"); }
function invalid(): never { throw new ParticipationCreditError("Enter valid participation settings", 400, "INVALID_PARTICIPATION_INPUT"); }

async function activeUser(tx: Prisma.TransactionClient, userId: string) {
  const user = userId?.trim() ? await tx.user.findFirst({ where: { id: userId, status: "ACTIVE" }, select: { id: true, email: true, emailVerifiedAt: true } }) : null;
  if (!user) return notFound();
  return user;
}

export function usesDemoCredits(community: { id: string; kind: string }) {
  return publicPilotRequested() ? isPublicPilotCommittee(community) : isParticipationCreditSandbox();
}

function fundingConfigured(communityId: string) {
  return !publicPilotRequested() && isCreditFundingConfigured(communityId);
}

function requirePilotAccount(user: Parameters<typeof isVerifiedPilotAccount>[0]) {
  if (publicPilotRequested() && !isVerifiedPilotAccount(user)) throw new ParticipationCreditError("Sign in with your verified email to use free demo credits", 403, "VERIFIED_EMAIL_REQUIRED");
}

export function accessibleCreditCommunityWhere(userId: string, includeExistingAccounts: boolean): Prisma.CommunityWhereInput {
  return { OR: [
    { proposalArchives: { some: { committeeId: null, revisions: { some: {} } } } },
    { kind: "COMMITTEE", committeeArchives: { some: { revisions: { some: {} } } } },
    { daoMembers: { some: { userId, status: "ACTIVE", user: { status: "ACTIVE" } } } },
    { memberships: { some: { userId, status: "ACTIVE", role: { in: ["OWNER", "MANAGER"] }, user: { status: "ACTIVE" } } } },
    { polls: { some: { status: { notIn: UNPUBLISHED_POLL_STATUSES }, eligibility: { some: { userId, user: { status: "ACTIVE" } } } } } },
    ...(includeExistingAccounts ? [{ creditAccounts: { some: { userId, user: { status: "ACTIVE" as const } } } }] : [])
  ] };
}

async function policyMembership(tx: Prisma.TransactionClient, communityId: string, userId: string, owner = false) {
  if (!communityId?.trim() || !userId?.trim()) return notFound();
  const membership = await tx.communityMembership.findFirst({
    where: { communityId, userId, status: "ACTIVE", role: { in: ["OWNER", "MANAGER"] }, user: { status: "ACTIVE" } }, select: { role: true }
  });
  if (!membership) return notFound();
  if (owner && membership.role !== "OWNER") throw new ParticipationCreditError("Only a community owner can change participation settings", 403, "POLICY_OWNER_REQUIRED");
  return membership;
}

function policyView(community: Prisma.CommunityGetPayload<{ select: typeof policySelection }>, canManage: boolean): ParticipationPolicyView {
  const sandbox = usesDemoCredits(community);
  return { communityId: community.id, mode: community.participationMode, commentCost: community.commentCost, reactionCost: community.reactionCost,
    version: community.participationPolicyVersion, canManage, sandbox, fundingConfigured: fundingConfigured(community.id), canActivateCredits: sandbox || fundingConfigured(community.id) };
}

async function serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await db.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) {
        if (attempt < 2) continue;
        throw new ParticipationCreditError("Participation changed while saving. Please try again", 409, "PARTICIPATION_CONCURRENT_UPDATE");
      }
      throw error;
    }
  }
  throw new Error("Unreachable transaction retry");
}

export async function getParticipationContext(tx: Prisma.TransactionClient, communityId: string, actor: ParticipationActor): Promise<ParticipationContext> {
  if (!communityId?.trim()) return notFound();
  const sponsored = Boolean(actor.accessId);
  if (sponsored) {
    if (actor.userId || !await tx.pollVoterAccess.findFirst({
      where: { id: actor.accessId, status: "ACTIVE", expiresAt: { gt: new Date() }, poll: { communityId, status: { notIn: UNPUBLISHED_POLL_STATUSES } } }, select: { id: true }
    })) return notFound();
  } else {
    await activeUser(tx, actor.userId!);
  }
  const community = await tx.community.findFirst({
    where: { id: communityId, ...(sponsored ? {} : accessibleCreditCommunityWhere(actor.userId!, false)) }, select: policySelection
  });
  if (!community) return notFound();
  const account = sponsored ? null : await tx.creditAccount.findUnique({ where: { communityId_userId: { communityId, userId: actor.userId! } }, select: { balance: true, paymentReview: true } });
  const free = sponsored || community.participationMode === "FREE";
  return { communityId, mode: community.participationMode, commentCost: community.commentCost, reactionCost: community.reactionCost,
    version: community.participationPolicyVersion, balance: sponsored ? null : account?.balance ?? 0,
    sandbox: usesDemoCredits(community), sponsored, paymentReview: account?.paymentReview ?? false, effectiveCommentCost: free ? 0 : community.commentCost, effectiveReactionCost: free ? 0 : community.reactionCost };
}

export async function readAccountCredits(userId: string, communityId?: string): Promise<AccountCreditsView> {
  if (communityId !== undefined && (!communityId.trim() || communityId.length > 128)) return invalid();
  return db.$transaction(async tx => {
    const user = await activeUser(tx, userId);
    const pilot = communityId && publicPilotScope();
    if (pilot && communityId === pilot.committeeId) {
      // The public pilot has one fixed committee scope. Avoid loading unrelated
      // DAO membership, poll and archive relations for every profile opening.
      const community = await tx.community.findFirst({
        where: { id: communityId, kind: "COMMITTEE", committeeArchives: { some: { communityId: pilot.hostId, revisions: { some: {} } } } },
        select: { ...policySelection, creditAccounts: { where: { userId }, select: {
          balance: true, paymentReview: true,
          purchases: { take: 1, select: { id: true } },
          operations: { where: { kind: "PREVIEW_GRANT" }, take: 1, select: { id: true } }
        } } }
      });
      if (!community) return notFound();
      const history = await tx.creditOperation.findMany({
        where: { userId, communityId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20,
        select: { id: true, communityId: true, kind: true, delta: true, createdAt: true }
      });
      const account = community.creditAccounts[0];
      return { sandbox: true, accounts: [{
        communityId, communityName: community.name, kind: community.kind, balance: account?.balance ?? 0,
        sandbox: true, mode: community.participationMode, commentCost: community.commentCost, reactionCost: community.reactionCost,
        policyVersion: community.participationPolicyVersion, paymentReview: account?.paymentReview ?? false,
        fundingConfigured: false, canManage: false,
        canClaimPreview: isVerifiedPilotAccount(user) && !account?.balance && !account?.purchases.length && !account?.operations.length
      }], history: history.map(operation => ({ ...operation, createdAt: operation.createdAt.toISOString() })) };
    }
    const communities = await tx.community.findMany({
      where: { ...accessibleCreditCommunityWhere(userId, true), ...(communityId ? { id: communityId } : {}) }, orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { ...policySelection,
        memberships: { where: { userId, status: "ACTIVE", role: { in: ["OWNER", "MANAGER"] }, user: { status: "ACTIVE" } }, select: { role: true } },
        polls: { where: { status: { notIn: UNPUBLISHED_POLL_STATUSES }, eligibility: { some: { userId, user: { status: "ACTIVE" } } } }, take: 1, select: { id: true } },
        proposalArchives: { where: { committeeId: null, revisions: { some: {} } }, take: 1, select: { id: true } },
        committeeArchives: { where: { revisions: { some: {} } }, take: 1, select: { id: true } },
        daoMembers: { where: { userId, status: "ACTIVE" }, take: 1, select: { id: true } },
        creditAccounts: { where: { userId }, select: { balance: true, paymentReview: true, purchases: { take: 1, select: { id: true } }, operations: { where: { kind: "PREVIEW_GRANT" }, take: 1, select: { id: true } } } }
      }
    });
    if (communityId && !communities.length) return notFound();
    const sandbox = communities.length > 0 && communities.every(usesDemoCredits);
    const history = await tx.creditOperation.findMany({
      where: { userId, communityId: { in: communities.map(community => community.id) } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20,
      select: { id: true, communityId: true, kind: true, delta: true, createdAt: true }
    });
    return { sandbox, accounts: communities.map(community => ({
      communityId: community.id, communityName: community.name, kind: community.kind ?? "DAO", balance: community.creditAccounts[0]?.balance ?? 0,
      sandbox: usesDemoCredits(community),
      mode: community.participationMode, commentCost: community.commentCost, reactionCost: community.reactionCost,
      policyVersion: community.participationPolicyVersion, paymentReview: community.creditAccounts[0]?.paymentReview ?? false, fundingConfigured: fundingConfigured(community.id), canManage: community.memberships.some(membership => membership.role === "OWNER") && !(community.kind === "COMMITTEE" && (isDemoAccount(userId) || !committeeOperationsEnabled())),
      canClaimPreview: usesDemoCredits(community) && (!publicPilotRequested() || isVerifiedPilotAccount(user) && !community.creditAccounts[0]?.balance) && !community.creditAccounts[0]?.purchases?.length && !(community.creditAccounts[0]?.operations.length) && (community.memberships.length > 0 || community.polls.length > 0 || (community.proposalArchives?.length ?? 0) > 0 || (community.committeeArchives?.length ?? 0) > 0 || (community.daoMembers?.length ?? 0) > 0)
    })), history: history.map(operation => ({ ...operation, createdAt: operation.createdAt.toISOString() })) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function claimPreviewCredits(userId: string, communityId: string): Promise<{ replayed: boolean; balance: number }> {
  if (publicPilotRequested() ? publicPilotScope()?.committeeId !== communityId : !isParticipationCreditSandbox()) return unavailable();
  return serializable(async tx => {
    const user = await activeUser(tx, userId);
    requirePilotAccount(user);
    const community = await tx.community.findFirst({ where: { id: communityId, ...accessibleCreditCommunityWhere(userId, false),
      ...(publicPilotRequested() ? { kind: "COMMITTEE", committeeArchives: { some: { communityId: publicPilotScope()!.hostId, revisions: { some: {} } } } } : {})
    }, select: policySelection });
    if (!community) return notFound();
    if (!usesDemoCredits(community)) return unavailable();
    const account = await tx.creditAccount.upsert({ where: { communityId_userId: { communityId, userId } }, create: { communityId, userId }, update: {}, select: { id: true, balance: true, purchases: { take: 1, select: { id: true } } } });
    if (account.purchases?.length) throw new ParticipationCreditError("Accounts with payment requests cannot receive demo credits", 403, "PREVIEW_CREDITS_UNAVAILABLE");
    const existing = await tx.creditOperation.findUnique({ where: { accountId_requestKey: { accountId: account.id, requestKey: PREVIEW_KEY } } });
    const payloadHash = createHash("sha256").update(JSON.stringify({ version: PREVIEW_KEY, communityId, userId, amount: PREVIEW_CREDIT_GRANT })).digest("hex");
    if (existing) {
      if (existing.kind !== "PREVIEW_GRANT" || existing.payloadHash !== payloadHash) throw new ParticipationCreditError("This request key was used for a different action", 409, "CREDIT_IDEMPOTENCY_CONFLICT");
      return { replayed: true, balance: account.balance };
    }
    if (publicPilotRequested() && account.balance !== 0) throw new ParticipationCreditError("Existing balances cannot receive a demo allowance", 403, "PREVIEW_CREDITS_UNAVAILABLE");
    const increment = await tx.creditAccount.updateMany({ where: { id: account.id, communityId, userId, balance: { lte: MAX_CREDIT_BALANCE - PREVIEW_CREDIT_GRANT } }, data: { balance: { increment: PREVIEW_CREDIT_GRANT } } });
    if (increment.count !== 1) throw new ParticipationCreditError("The credit balance limit was reached", 409, "CREDIT_BALANCE_LIMIT");
    await tx.creditOperation.create({ data: { accountId: account.id, communityId, userId, kind: "PREVIEW_GRANT", delta: PREVIEW_CREDIT_GRANT, requestKey: PREVIEW_KEY, payloadHash, policyVersion: community.participationPolicyVersion } });
    return { replayed: false, balance: account.balance + PREVIEW_CREDIT_GRANT };
  });
}

export async function readParticipationPolicy(communityId: string, userId: string): Promise<ParticipationPolicyView> {
  return db.$transaction(async tx => {
    const membership = await policyMembership(tx, communityId, userId);
    const community = await tx.community.findFirst({ where: { id: communityId }, select: policySelection });
    if (!community) return notFound();
    return policyView(community, membership.role === "OWNER" && !(community.kind === "COMMITTEE" && (isDemoAccount(userId) || !committeeOperationsEnabled())));
  });
}

export async function updateParticipationPolicy(communityId: string, userId: string, input: unknown): Promise<ParticipationPolicyView> {
  const parsed = participationPolicyInputSchema.safeParse(input);
  if (!parsed.success) return invalid();
  return serializable(async tx => {
    await policyMembership(tx, communityId, userId, true);
    const community = await tx.community.findFirst({ where: { id: communityId }, select: policySelection });
    if (!community) return notFound();
    if (community.kind === "COMMITTEE" && !committeeOperationsEnabled()) throw new ParticipationCreditError("Committee settings are awaiting authorization", 403, "COMMITTEE_NOT_ENABLED");
    if (community.kind === "COMMITTEE" && isDemoAccount(userId)) throw new ParticipationCreditError("Demo profiles cannot change committee credit settings", 403, "POLICY_PERSONAL_ACCOUNT_REQUIRED");
    const value = parsed.data;
    if (community.participationPolicyVersion !== value.expectedVersion) throw new ParticipationCreditError("Participation settings changed. Reload before saving", 409, "PARTICIPATION_POLICY_CHANGED");
    if (value.mode === "CREDITS" && !usesDemoCredits(community) && !fundingConfigured(communityId)) return unavailable();
    if (value.mode === community.participationMode && value.commentCost === community.commentCost && value.reactionCost === community.reactionCost) return policyView(community, true);
    const result = await tx.community.updateMany({ where: { id: communityId, participationPolicyVersion: value.expectedVersion }, data: {
      participationMode: value.mode, commentCost: value.commentCost, reactionCost: value.reactionCost, participationPolicyVersion: { increment: 1 }
    } });
    if (result.count !== 1) throw new ParticipationCreditError("Participation settings changed. Reload before saving", 409, "PARTICIPATION_POLICY_CHANGED");
    return policyView({ ...community, participationMode: value.mode, commentCost: value.commentCost, reactionCost: value.reactionCost, participationPolicyVersion: value.expectedVersion + 1 }, true);
  });
}

/** Called inside the transaction that writes the authorized discussion action. */
export async function debitParticipationCredits(tx: Prisma.TransactionClient, input: ParticipationDebitInput): Promise<ParticipationDebitResult> {
  const parsed = participationDebitInputSchema.safeParse(input);
  if (!parsed.success) return invalid();
  const result = await debitWithCurrentPolicy(tx, parsed.data);
  return { replayed: result.replayed, balance: result.balance, operationId: result.operationId };
}

/** Server-priced actions still validate the supplied policy version, account and target.
 * Resolve everything inside the caller's transaction instead of reading it once to
 * discover the cost and then reading it again when debiting.
 */
export async function debitParticipationCreditsAtCurrentPrice(tx: Prisma.TransactionClient, input: Omit<ParticipationDebitInput, "cost">) {
  const parsed = participationDebitInputSchema.omit({ cost: true }).safeParse(input);
  if (!parsed.success) return invalid();
  return debitWithCurrentPolicy(tx, parsed.data);
}

async function debitWithCurrentPolicy(tx: Prisma.TransactionClient, value: Omit<ParticipationDebitInput, "cost"> & { cost?: number }) {
  const user = await activeUser(tx, value.userId);
  const community = await tx.community.findFirst({
    where: { id: value.communityId, ...accessibleCreditCommunityWhere(value.userId, false) }, select: policySelection
  });
  if (!community) return notFound();
  const sandbox = usesDemoCredits(community);
  if (publicPilotRequested()) {
    if (!sandbox) return unavailable();
    requirePilotAccount(user);
  }
  const account = await tx.creditAccount.findUnique({ where: { communityId_userId: { communityId: value.communityId, userId: value.userId } }, select: { id: true, balance: true, paymentReview: true, purchases: { take: 1, select: { id: true } }, operations: { where: { kind: "PREVIEW_GRANT" }, take: 1, select: { id: true } } } });
  const receipt = (result: ParticipationDebitResult) => ({ ...result,
    participation: { communityId: community.id, creditScope: { id: community.id, name: community.name, kind: community.kind },
      mode: community.participationMode, commentCost: community.commentCost, reactionCost: community.reactionCost,
      version: community.participationPolicyVersion, availableCredits: result.balance, sandbox, sponsored: false, paymentReview: account?.paymentReview ?? false } });
  const existing = account ? await tx.creditOperation.findUnique({ where: { accountId_requestKey: { accountId: account.id, requestKey: value.requestKey } } }) : null;
  if (existing) {
    if (existing.payloadHash !== value.payloadHash || existing.kind !== value.kind || existing.targetId !== value.targetId) throw new ParticipationCreditError("This request key was used for a different action", 409, "CREDIT_IDEMPOTENCY_CONFLICT");
    return receipt({ replayed: true, balance: account!.balance, operationId: existing.id });
  }
  const expectedCost = community.participationMode === "FREE" ? 0 : value.kind === "COMMENT" ? community.commentCost : community.reactionCost;
  if ((value.cost !== undefined && value.cost !== expectedCost) || (expectedCost > 0 && value.policyVersion !== community.participationPolicyVersion)
    || (value.policyVersion !== undefined && value.policyVersion !== community.participationPolicyVersion)) throw new ParticipationCreditError("Participation settings changed. Reload before submitting", 409, "PARTICIPATION_POLICY_CHANGED");
  const type = value.targetType ?? (value.kind === "COMMENT" ? "POLL" : "POLL_COMMENT");
  if (value.kind === "COMMENT" && !["POLL", "ARCHIVE"].includes(type)) return invalid();
  const target = type === "ARCHIVE"
    ? await tx.proposalArchive.findFirst({ where: { id: value.targetId, OR: [{ committeeId: value.communityId }, { committeeId: null, communityId: value.communityId }], revisions: { some: {} } }, select: { id: true } })
    : type === "ARCHIVE_COMMENT"
      ? await tx.archiveComment.findFirst({ where: { id: value.targetId, hiddenAt: null, archive: { OR: [{ committeeId: value.communityId }, { committeeId: null, communityId: value.communityId }], revisions: { some: {} } } }, select: { id: true } })
      : type === "POLL"
        ? await tx.poll.findFirst({ where: { id: value.targetId, communityId: value.communityId }, select: { id: true } })
        : await tx.pollComment.findFirst({ where: { id: value.targetId, hiddenAt: null, poll: { communityId: value.communityId } }, select: { id: true } });
  if (!target) return notFound();
  if (expectedCost === 0) return receipt({ replayed: false, balance: account?.balance ?? 0, operationId: null });
  if (account?.paymentReview) throw new ParticipationCreditError("A payment on this account needs review before credits can be spent", 403, "CREDIT_PAYMENT_REVIEW");
  if (!sandbox && (!fundingConfigured(value.communityId) || account?.operations?.length)) return unavailable();
  if (publicPilotRequested() && account && (!account.operations.length || account.purchases.length)) return unavailable();
  if (!account || account.balance < expectedCost) throw new ParticipationCreditError("You need more participation credits for this action", 409, "INSUFFICIENT_PARTICIPATION_CREDITS");
  const deduction = await tx.creditAccount.updateMany({ where: { id: account.id, communityId: value.communityId, userId: value.userId, balance: { gte: expectedCost } }, data: { balance: { decrement: expectedCost } } });
  if (deduction.count !== 1) throw new ParticipationCreditError("You need more participation credits for this action", 409, "INSUFFICIENT_PARTICIPATION_CREDITS");
  const operation = await tx.creditOperation.create({ data: { accountId: account.id, communityId: value.communityId, userId: value.userId, kind: value.kind, delta: -expectedCost,
    requestKey: value.requestKey, payloadHash: value.payloadHash, targetId: value.targetId, policyVersion: community.participationPolicyVersion }, select: { id: true } });
  return receipt({ replayed: false, balance: account.balance - expectedCost, operationId: operation.id });
}
