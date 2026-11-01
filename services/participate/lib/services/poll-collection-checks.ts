import { createHash } from "node:crypto";
import { Prisma, type PollCollectionCheck } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { COLLECTION_LEASE_MS, CollectionObserverError, type CollectionCheckHistory, type CollectionCheckView, type CollectionReason, type CollectionSnapshot } from "@/lib/domain/poll-collection";
import { manageableCommunityWhere } from "@/lib/services/communities";
import { observePollHistory, readPollHistoryConfig } from "@/lib/zcash/poll-history-observer";

export class CollectionCheckError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 | 429, readonly code: string) { super(message); }
}
const inputSchema = z.object({ requestKey: z.string().uuid().transform(value => value.toLowerCase()) }).strict();
// Stable across PostgreSQL JSONB key ordering, for offline evidence reproduction.
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b, "en"))) : item
)).digest("hex");

async function managedPoll(tx: Prisma.TransactionClient, communityId: string, pollId: string, actorId: string) {
  const poll = await tx.poll.findFirst({ where: { id: pollId, communityId, community: { is: manageableCommunityWhere(actorId) } },
    select: { id: true, status: true, questionHash: true, opensAt: true, closesAt: true,
      quorumPercent: true, passingThresholdPercent: true, voteModel: true,
      tickets: { orderBy: { id: "asc" }, select: { id: true, ticketHash: true, status: true,
        requests: { orderBy: { id: "asc" }, select: { id: true, shieldedAddress: true, optionLetter: true, status: true } } } } } });
  if (!poll) throw new CollectionCheckError("Proposal not found", 404, "PROPOSAL_NOT_FOUND");
  return poll;
}
type ManagedPoll = Awaited<ReturnType<typeof managedPoll>>;
const canCheck = (poll: ManagedPoll) => poll.status === "CLOSED" || (poll.status === "OPEN" && +poll.closesAt <= Date.now());
const scopeHash = (poll: ManagedPoll) => digest({ ...poll, status: undefined });
function view(row: PollCollectionCheck): CollectionCheckView {
  const interrupted = row.status === "RUNNING" && +row.leaseExpiresAt <= Date.now();
  return { id: row.id, status: interrupted ? "BLOCKED" : row.status as CollectionCheckView["status"],
    reason: interrupted ? "CHECK_INTERRUPTED" : row.reason as CollectionReason | null,
    startedAt: row.startedAt.toISOString(), finishedAt: row.finishedAt?.toISOString() ?? null, leaseExpiresAt: row.leaseExpiresAt.toISOString(),
    network: row.network, tipHeight: row.tipHeight, scannedHeight: row.scannedHeight, transactionCount: row.transactionCount,
    outputCount: row.outputCount, evidenceHash: row.evidenceHash };
}
async function serializable<T>(action: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await db.$transaction(action, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || !["P2034", "P2002"].includes(error.code)) throw error;
      if (attempt === 3) throw new CollectionCheckError("Retry the same check shortly", 409, "CHECK_RETRY_REQUIRED");
    }
  }
  throw new CollectionCheckError("Retry the same check shortly", 409, "CHECK_RETRY_REQUIRED");
}

export async function readCollectionChecks(communityId: string, pollId: string, actorId: string): Promise<CollectionCheckHistory> {
  return db.$transaction(async tx => {
    const poll = await managedPoll(tx, communityId, pollId, actorId);
    const checks = await tx.pollCollectionCheck.findMany({ where: { pollId }, orderBy: [{ startedAt: "desc" }, { id: "desc" }], take: 5 });
    return { canCheck: canCheck(poll), checks: checks.map(view), finalization: "POLICY_AND_CUTOFF_REQUIRED" };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function runCollectionCheck(communityId: string, pollId: string, actorId: string, input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new CollectionCheckError("Invalid check request", 400, "INVALID_CHECK_INPUT");
  const key = { pollId_actorId_requestKey: { pollId, actorId, requestKey: parsed.data.requestKey } };
  const claim = await serializable(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Poll" WHERE "id" = ${pollId} FOR UPDATE`;
    const poll = await managedPoll(tx, communityId, pollId, actorId);
    const existing = await tx.pollCollectionCheck.findUnique({ where: key });
    if (existing) return { check: existing, poll, replayed: true };
    if (!canCheck(poll)) throw new CollectionCheckError("History checks are available after voting ends", 409, "VOTING_NOT_CLOSED");
    const now = new Date();
    const last = await tx.pollCollectionCheck.findFirst({ where: { pollId }, orderBy: { startedAt: "desc" } });
    if (last && +last.leaseExpiresAt > +now) throw new CollectionCheckError("Wait a minute before starting another check", 429, "CHECK_RATE_LIMITED");
    await tx.pollCollectionCheck.updateMany({ where: { pollId, status: "RUNNING", leaseExpiresAt: { lte: now } }, data: {
      status: "BLOCKED", reason: "CHECK_INTERRUPTED", finishedAt: now
    } });
    const check = await tx.pollCollectionCheck.create({ data: { pollId, actorId, requestKey: parsed.data.requestKey,
      scopeHash: scopeHash(poll), startedAt: now, leaseExpiresAt: new Date(+now + COLLECTION_LEASE_MS) } });
    return { check, poll, replayed: false };
  });
  if (claim.replayed) return { check: view(claim.check), replayed: true };
  let snapshot: CollectionSnapshot | undefined;
  let reason: CollectionReason | undefined;
  try {
    snapshot = await observePollHistory(readPollHistoryConfig(), claim.poll.tickets.flatMap(ticket => ticket.requests.map(request => ({ id: request.id, address: request.shieldedAddress }))));
  } catch (error) { reason = error instanceof CollectionObserverError ? error.code : "SOURCE_UNAVAILABLE"; }
  return serializable(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Poll" WHERE "id" = ${pollId} FOR UPDATE`;
    const poll = await managedPoll(tx, communityId, pollId, actorId);
    const now = new Date();
    const current = await tx.pollCollectionCheck.findUniqueOrThrow({ where: { id: claim.check.id } });
    if (current.status !== "RUNNING") return { check: view(current), replayed: true };
    const blocked: CollectionReason | undefined = +current.leaseExpiresAt <= +now ? "CHECK_INTERRUPTED"
      : !canCheck(poll) || scopeHash(poll) !== current.scopeHash ? "PROPOSAL_CHANGED" : reason;
    const data = blocked || !snapshot ? { status: "BLOCKED", reason: blocked ?? "SOURCE_UNAVAILABLE", finishedAt: now }
      : { status: "OBSERVED", finishedAt: now, sourceVersion: snapshot.sourceVersion, sourceFingerprint: snapshot.sourceFingerprint,
        network: snapshot.network, tipHeight: snapshot.tipHeight, scannedHeight: snapshot.scannedHeight, transactionCount: snapshot.transactionCount,
        outputCount: snapshot.outputs.length, evidenceHash: digest(snapshot), evidence: snapshot as unknown as Prisma.InputJsonValue };
    const check = await tx.pollCollectionCheck.update({ where: { id: current.id }, data });
    return { check: view(check), replayed: false };
  });
}
