import { createHash } from "node:crypto";
import { Prisma, type ProposalSubmission } from "@prisma/client";
import { db } from "@/lib/db";
import { canonicalJson } from "@/lib/archive/format";
import { buildNativeProposalPackage } from "@/lib/archive/native-proposals";
import { isParticipationCreditSandbox } from "@/lib/services/participation-credits";
import { isVerifiedPilotAccount, publicPilotRequested, publicPilotScope, participantPublicationMode } from "@/lib/auth/public-pilot-policy";
import { saveSubmissionSchema, publishSubmissionSchema, deleteSubmissionSchema, abandonSubmissionSchema, submissionDraftSchema, submissionPublishableSchema, SUBMISSION_PRICE, type SubmissionDraft } from "@/lib/domain/proposal-submission";
import { recordProposalArrival } from "./discussion-notifications";
import { appendArchiveActivity, initializeArchiveActivity } from "./archive-activity";
import { abandonmentInclude, abandonmentView, lockProposalArchive, isLifecycleConflict } from "./proposal-lifecycle";

export class ProposalSubmissionError extends Error {
  constructor(public readonly code: string, public readonly status = 400) { super(code); }
}
const fail = (code: string, status = 400): never => { throw new ProposalSubmissionError(code, status); };
type Tx = Prisma.TransactionClient;
async function transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 }); }
    catch (error) {
      if (isLifecycleConflict(error) || error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  return fail("CONCURRENT_UPDATE", 409);
}
async function scope(tx: Tx, communityId: string, userId: string, writing = true) {
  const user = await tx.user.findFirst({ where: { id: userId, status: "ACTIVE" }, select: { id: true, email: true, emailVerifiedAt: true } });
  if (!user) return fail("unauthorized", 401);
  if (writing && publicPilotRequested() && !isVerifiedPilotAccount(user)) return fail("VERIFIED_EMAIL_REQUIRED", 403);
  // Resolve the committee from the configured host, never from client input or DAO balance.
  const records = await tx.proposalArchive.findMany({ where: { communityId, revisions: { some: {} } }, distinct: ["committeeId"], select: { committeeId: true } });
  const committeeId = records.length === 1 ? records[0].committeeId : null;
  if (!committeeId || !await tx.community.findFirst({ where: { id: committeeId, kind: "COMMITTEE" }, select: { id: true } })) return fail("PUBLICATION_UNAVAILABLE", 503);
  if (writing && publicPilotRequested()) {
    const pilot = publicPilotScope();
    if (!pilot || pilot.hostId !== communityId || pilot.committeeId !== committeeId) return fail("PUBLICATION_UNAVAILABLE", 503);
  }
  return committeeId;
}
function view(row: ProposalSubmission): SubmissionDraft {
  return { id: row.id, payload: submissionDraftSchema.parse(row.payload), version: row.version, contentHash: row.contentHash,
    state: row.state as SubmissionDraft["state"], recordId: row.recordId, updatedAt: row.updatedAt.toISOString() };
}
export async function listOwnSubmissions(communityId: string, userId: string) {
  return transaction(async tx => {
    await scope(tx, communityId, userId, false);
    const rows = await tx.proposalSubmission.findMany({ where: { communityId, authorId: userId }, include: { abandonment: { include: abandonmentInclude } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 50 });
    return Promise.all(rows.map(async row => ({ ...view(row), ...(row.abandonment ? { state: "ABANDONED" as const, abandonment: await abandonmentView(row.abandonment) } : {}) })));
  });
}
export async function saveProposalSubmission(communityId: string, userId: string, input: unknown) {
  const parsed = saveSubmissionSchema.safeParse(input);
  if (!parsed.success) return fail("INVALID_PROPOSAL_INPUT");
  const { id, expectedVersion, payload } = parsed.data;
  const contentHash = createHash("sha256").update(canonicalJson(payload)).digest("hex");
  return transaction(async tx => {
    const committeeId = await scope(tx, communityId, userId);
    if (await tx.proposalDraftDeletion.findUnique({ where: { id } })) return fail("DRAFT_NOT_FOUND", 404);
    const current = await tx.proposalSubmission.findUnique({ where: { id } });
    if (current) {
      if (current.authorId !== userId || current.communityId !== communityId || current.committeeId !== committeeId) return fail("DRAFT_NOT_FOUND", 404);
      if (current.state !== "DRAFT") return fail("ALREADY_PUBLISHED", 409);
      if (current.contentHash === contentHash) return view(current); // Safe retry after a lost response.
      if (current.version !== expectedVersion) return fail("DRAFT_CHANGED", 409);
      return view(await tx.proposalSubmission.update({ where: { id }, data: { payload, contentHash, version: { increment: 1 } } }));
    }
    if (expectedVersion !== 0) return fail("DRAFT_NOT_FOUND", 404);
    const recent = await tx.proposalSubmission.count({ where: { authorId: userId, createdAt: { gt: new Date(Date.now() - 60000) } } });
    const drafts = await tx.proposalSubmission.count({ where: { authorId: userId, communityId, state: "DRAFT" } });
    const deleted = await tx.proposalDraftDeletion.count({ where: { authorId: userId, createdAt: { gt: new Date(Date.now() - 60000) } } });
    if (recent + deleted >= 5 || drafts >= 30) return fail("DRAFT_LIMIT", 429);
    return view(await tx.proposalSubmission.create({ data: { id, authorId: userId, communityId, committeeId, payload, contentHash } }));
  });
}

/** Deletes private text. The database retains only an owner-bound retry tombstone. */
export async function deleteProposalDraft(communityId: string, userId: string, input: unknown) {
  const parsed = deleteSubmissionSchema.safeParse(input);
  if (!parsed.success) return fail("INVALID_PROPOSAL_INPUT");
  const { id, expectedVersion } = parsed.data;
  return transaction(async tx => {
    const committeeId = await scope(tx, communityId, userId);
    const deleted = await tx.proposalDraftDeletion.findUnique({ where: { id } });
    const current = deleted ?? await tx.proposalSubmission.findUnique({ where: { id } });
    if (!current || current.authorId !== userId || current.communityId !== communityId || current.committeeId !== committeeId) return fail("DRAFT_NOT_FOUND", 404);
    if (!deleted && "state" in current && current.state !== "DRAFT") return fail("ALREADY_PUBLISHED", 409);
    if (current.version !== expectedVersion) return fail("DRAFT_CHANGED", 409);
    if (!deleted) await tx.proposalSubmission.delete({ where: { id } });
    return { deletedId: id, replayed: Boolean(deleted) };
  });
}

/** Account-authorized, append-only withdrawal. No refund, wallet call or file rewrite. */
export async function abandonProposalSubmission(communityId: string, userId: string, input: unknown) {
  const parsed = abandonSubmissionSchema.safeParse(input);
  if (!parsed.success) return fail("INVALID_PROPOSAL_INPUT");
  const value = parsed.data;
  return transaction(async tx => {
    const committeeId = await scope(tx, communityId, userId);
    const current = await tx.proposalSubmission.findFirst({ where: { id: value.id, communityId, committeeId, authorId: userId } });
    if (!current) return fail("DRAFT_NOT_FOUND", 404);
    if (current.state === "DRAFT" || !current.recordId) return fail("PROPOSAL_NOT_PUBLISHED", 409);
    if (current.contentHash !== value.contentHash) return fail("DRAFT_CHANGED", 409);
    const archive = await tx.proposalArchive.findUniqueOrThrow({ where: { communityId_recordId: { communityId, recordId: current.recordId } } });
    await lockProposalArchive(tx, archive.id);
    const previous = await tx.proposalAbandonment.findUnique({ where: { archiveId: archive.id }, include: abandonmentInclude });
    if (previous) {
      const abandonment = await abandonmentView(previous);
      if (previous.requestKey !== value.requestKey || abandonment!.reason !== value.reason) return fail("ALREADY_ABANDONED", 409);
      return { draft: { ...view(current), state: "ABANDONED" as const, abandonment }, replayed: true };
    }
    // A row version fence for review creation and signature transactions.
    await tx.$executeRaw`UPDATE "ProposalArchive" SET "title" = "title" WHERE "id" = ${archive.id}`;
    await initializeArchiveActivity(tx, archive);
    const event = await appendArchiveActivity(tx, archive, userId, "proposal-abandoned", { kind: "PROPOSAL_ABANDONED", authority: "AUTHOR_ACCOUNT", reason: value.reason }, new Date());
    const row = await tx.proposalAbandonment.create({ data: { archiveId: archive.id, submissionId: current.id, eventId: event.id, requestKey: value.requestKey }, include: abandonmentInclude });
    return { draft: { ...view(current), state: "ABANDONED" as const, abandonment: await abandonmentView(row) }, replayed: false };
  });
}

/** Real public publication with free credits; official intake and anchoring have separate authority. */
export async function publishProposalSubmission(communityId: string, userId: string, input: unknown) {
  const parsed = publishSubmissionSchema.safeParse(input);
  if (!parsed.success) return fail("INVALID_PROPOSAL_INPUT");
  if (publicPilotRequested() ? publicPilotScope()?.hostId !== communityId : !isParticipationCreditSandbox()) return fail("DEMO_PUBLICATION_ONLY", 403);
  const value = parsed.data;
  return transaction(async tx => {
    const committeeId = await scope(tx, communityId, userId);
    const current = await tx.proposalSubmission.findFirst({ where: { id: value.id, communityId, committeeId, authorId: userId } });
    if (!current) return fail("DRAFT_NOT_FOUND", 404);
    if (current.contentHash !== value.contentHash || current.version !== value.expectedVersion) return fail("DRAFT_CHANGED", 409);
    if (value.priceVersion !== SUBMISSION_PRICE.version) return fail("PRICE_CHANGED", 409);
    if (current.state !== "DRAFT") {
      if (current.requestKey !== value.requestKey) return fail("ALREADY_PUBLISHED", 409);
      const abandoned = await tx.proposalAbandonment.findUnique({ where: { submissionId: current.id }, include: abandonmentInclude });
      return { draft: { ...view(current), ...(abandoned ? { state: "ABANDONED" as const, abandonment: await abandonmentView(abandoned) } : {}) }, replayed: true };
    }
    const payload = submissionPublishableSchema.safeParse(current.payload);
    if (!payload.success) return fail("INCOMPLETE_PROPOSAL");
    const account = await tx.creditAccount.findUnique({ where: { communityId_userId: { communityId: committeeId, userId } }, include: {
      operations: { where: { kind: "PREVIEW_GRANT" }, take: 1 }, purchases: { take: 1 }
    } });
    if (!account || account.balance < SUBMISSION_PRICE.credits) return fail("INSUFFICIENT_PARTICIPATION_CREDITS", 409);
    if (account.paymentReview) return fail("CREDIT_PAYMENT_REVIEW", 403);
    if (!account.operations.length || account.purchases.length) return fail("DEMO_CREDITS_REQUIRED", 403);
    const submittedAt = new Date();
    const mode = participantPublicationMode();
    const recordId = `${mode === "production" ? "proposal" : "pilot"}-${current.id}`;
    const publication = await buildNativeProposalPackage(recordId, payload.data, submittedAt.toISOString(), mode);
    const deducted = await tx.creditAccount.updateMany({ where: { id: account.id, balance: { gte: SUBMISSION_PRICE.credits }, paymentReview: false }, data: { balance: { decrement: SUBMISSION_PRICE.credits } } });
    if (deducted.count !== 1) return fail("INSUFFICIENT_PARTICIPATION_CREDITS", 409);
    const archive = await tx.proposalArchive.create({ data: { communityId, committeeId, recordId, title: payload.data.title, revisions: { create: {
      revision: 1, manifestHash: publication.manifestHash, packageJson: canonicalJson(publication.bundle)
    } } } });
    if (mode === "production") await recordProposalArrival(tx, archive);
    await tx.creditOperation.create({ data: { accountId: account.id, communityId: committeeId, userId, kind: "PROPOSAL_SUBMISSION", delta: -SUBMISSION_PRICE.credits,
      requestKey: `proposal-publication:${current.id}`, payloadHash: current.contentHash, targetId: archive.id, policyVersion: SUBMISSION_PRICE.version } });
    const published = await tx.proposalSubmission.update({ where: { id: current.id }, data: { state: mode === "production" ? "PUBLISHED" : "PUBLISHED_DEMO", submittedAt, recordId, requestKey: value.requestKey } });
    return { draft: view(published), replayed: false };
  });
}

/** Backward-compatible operator/test entry point; the server owns the publication mode. */
export const publishDemoSubmission = publishProposalSubmission;
