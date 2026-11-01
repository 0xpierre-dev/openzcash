import { committeeOperationsEnabled } from "@/lib/auth/committee-policy";
import { randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { generateAuthenticationOptions, verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { PasskeyError, type PasskeyContext } from "@/lib/auth/passkey-policy";
import { canonicalJson, sha256, verifyArchivePackage } from "@/lib/archive/format";
import { decisionChallenge, decisionChoice, decisionRationale, decisionHash, roundSchema, tallyDecisions, ZCG_REVIEW_RULES, type DecisionBallot, type DecisionEnvelope, type DecisionRound } from "@/lib/decisions/format";
import { verifyDecisionBallot, type DecisionReceipt } from "@/lib/decisions/verify";
import { isDemoAccount } from "@/lib/auth/email-policy";
import { reviewerRoles } from "@/lib/domain/committee";
import { appendCommitteeEvent, lockCommittee } from "./committee-access";
import { abandonmentInclude, abandonmentView, lockProposalArchive, isLifecycleConflict } from "./proposal-lifecycle";
import { decisionReceiptFromRows, reviewIsPublic } from "@/lib/decisions/publication";
import { appendArchiveActivity, initializeArchiveActivity } from "./archive-activity";
import { zcgSourceWithdrawal } from "@/lib/data/zcg-source-metadata";
import { demoRosterScope } from "@/lib/demo/seats";

type Tx = Prisma.TransactionClient;
const fail = (code: string, status = 409): never => { throw new PasskeyError(code, status); };
const createBase = z.object({ revision: z.number().int().positive().max(10000) });
const createInput = z.union([
  createBase.extend({ policy: z.literal("ZCG_MAJORITY") }).strict(),
  createBase.extend({ quorum: z.number().int().min(1).max(200), approvalPercent: z.number().int().min(1).max(100), durationHours: z.number().int().min(1).max(720) }).strict()
]);
async function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await db.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 }); }
    catch (error) { if (!isLifecycleConflict(error)) throw error; }
  }
  return fail("DECISION_REFRESH_REQUIRED");
}

async function archiveAccess(tx: Tx, communityId: string, recordId: string, userId?: string) {
  const archive = await tx.proposalArchive.findUnique({ where: { communityId_recordId: { communityId, recordId } }, include: { abandonment: { include: abandonmentInclude } } });
  if (!archive) return fail("DECISION_NOT_FOUND", 404);
  const scopeId = archive.committeeId ?? communityId;
  const user = userId ? await tx.user.findFirst({ where: { id: userId, status: "ACTIVE" } }) : null;
  const manager = user && (!archive.committeeId || committeeOperationsEnabled()) ? await tx.communityMembership.findFirst({ where: { communityId: scopeId, userId: user.id, status: "ACTIVE", role: { in: ["OWNER", "MANAGER"] } } }) : null;
  return { archive, scopeId, user, manager };
}

async function roster(tx: Tx, scopeId: string, context: PasskeyContext, viewerId?: string) {
  const scope = await tx.community.findUniqueOrThrow({ where: { id: scopeId } });
  // Committee reviewers are its active workspace members. DAO voting membership
  // uses the explicitly account-linked DAO roster, not management permissions.
  // Demo deployments only: demoRosterScope keeps the viewer plus the four TEST seats. No-op elsewhere.
  const entries = scope.kind === "COMMITTEE"
    ? await demoRosterScope(await tx.communityMembership.findMany({ where: { communityId: scopeId, status: "ACTIVE", role: { in: reviewerRoles } }, select: { userId: true, publicName: true }, orderBy: { userId: "asc" }, take: 201 }), viewerId)
    : await tx.daoMember.findMany({ where: { communityId: scopeId, status: "ACTIVE" }, select: { userId: true }, orderBy: { id: "asc" }, take: 201 });
  const people = await tx.user.findMany({ where: { id: { in: entries.flatMap(e => e.userId ? [e.userId] : []) } }, include: { passkeys: { where: { revokedAt: null, rpId: context.rpId }, orderBy: { id: "asc" } } } });
  return entries.map((entry, i) => {
    const user = people.find(p => p.id === entry.userId);
    const ready = Boolean(user?.status === "ACTIVE" && !isDemoAccount(user.id) && user.emailVerifiedAt && user.email && user.passkeys.length && user.passkeys.length <= 10);
    const publicName = "publicName" in entry ? entry.publicName : null;
    return { user, ready, label: typeof publicName === "string" && publicName ? publicName : user?.shareProfileInDiscussion && user.displayName ? user.displayName.slice(0, 80) : `Reviewer ${i + 1}` };
  });
}

function checkedRound(row: { manifestJson: string }) {
  const round = roundSchema.parse(JSON.parse(row.manifestJson));
  if (canonicalJson(round) !== row.manifestJson) throw new Error("Noncanonical round");
  return round;
}

export async function createDecisionRound(communityId: string, recordId: string, userId: string, input: unknown, context: PasskeyContext) {
  const data = createInput.parse(input);
  return transaction(async tx => {
    const actor = await archiveAccess(tx, communityId, recordId, userId);
    if (actor.archive.committeeId && !committeeOperationsEnabled()) return fail("COMMITTEE_NOT_ENABLED", 403);
    if (!actor.manager) return fail("DECISION_MANAGER_REQUIRED", 403);
    if (!actor.user?.emailVerifiedAt || !actor.user.email || isDemoAccount(userId)) return fail("DECISION_VERIFIED_ACCOUNT_REQUIRED", 403);
    await lockProposalArchive(tx, actor.archive.id);
    if (await tx.proposalAbandonment.findUnique({ where: { archiveId: actor.archive.id } })) return fail("PROPOSAL_ABANDONED");
    await lockCommittee(tx, actor.scopeId);
    const revision = await tx.archiveRevision.findFirst({ where: { archiveId: actor.archive.id }, orderBy: { revision: "desc" }, include: { decision: true } });
    if (!revision || revision.revision !== data.revision) return fail("DECISION_REVISION_CHANGED");
    if (revision.decision) return fail("DECISION_ALREADY_EXISTS");
    const proposal = await verifyArchivePackage(JSON.parse(revision.packageJson), revision.manifestHash);
    if (actor.archive.committeeId && zcgSourceWithdrawal(proposal.manifest)) return fail("PROPOSAL_SOURCE_WITHDRAWN");
    const scope = await tx.community.findUniqueOrThrow({ where: { id: actor.scopeId } });
    const committee = scope.kind === "COMMITTEE";
    if (committee !== ("policy" in data)) return fail("DECISION_INVALID_POLICY", 400);
    const people = await roster(tx, actor.scopeId, context, userId);
    if (committee && people.length !== 5) return fail("DECISION_FIVE_MEMBERS_REQUIRED");
    if (!people.length || people.length > 200 || people.some(p => !p.ready)) return fail("DECISION_ROSTER_NOT_READY");
    const rules = "policy" in data ? ZCG_REVIEW_RULES : { quorum: data.quorum, approvalPercent: data.approvalPercent, abstentions: "COUNT_FOR_QUORUM_ONLY", changes: "ONE_FINAL_BALLOT" };
    if (rules.quorum > people.length) return fail("DECISION_INVALID_QUORUM", 400);
    const now = new Date(), id = randomUUID();
    const members = await Promise.all(people.map(async p => ({ id: randomUUID(), label: p.label, keyHashes: await Promise.all(p.user!.passkeys.map(key => sha256(new Uint8Array(key.publicKey)))) })));
    const round = roundSchema.parse({ ...("policy" in data ? { schema: "PARTICIPATE_DECISION_ROUND_V4", policy: "ZCG_MAJORITY", approvalBasis: "FULL_ROSTER", completion: "ALL_RESPONSES", closesAt: null } : { schema: "PARTICIPATE_DECISION_ROUND_V2", closesAt: new Date(+now + data.durationHours * 3600000).toISOString() }), rationale: "PUBLIC_REQUIRED", id, purpose: "INDEPENDENT_PILOT_REVIEW", authority: "APPLICATION_MANAGED_ROSTER",
      proposal: { recordId, revision: data.revision, manifestHash: revision.manifestHash, title: proposal.manifest.title },
      ...context, opensAt: now.toISOString(),
      rules, members });
    await tx.signedDecisionRound.create({ data: { id, revisionId: revision.id, scopeId: actor.scopeId, manifestJson: canonicalJson(round), manifestHash: await decisionHash(round), closesAt: round.closesAt === null ? null : new Date(round.closesAt),
      voters: { create: people.map((p, i) => ({ id: members[i].id, userId: p.user!.id, keyIds: p.user!.passkeys.map(key => key.id) })) } } });
    if (actor.archive.committeeId) await appendCommitteeEvent(tx, actor.scopeId, userId, "REVIEW_OPENED", { roundId: id, recordId, revision: data.revision, summary: `Opened revision ${data.revision}: ${round.proposal.title}` });
    return { id };
  });
}

async function scopedRound(tx: Tx, communityId: string, recordId: string, roundId: string) {
  const row = await tx.signedDecisionRound.findFirst({ where: { id: roundId, revision: { archive: { communityId, recordId } } } });
  if (!row) return fail("DECISION_NOT_FOUND", 404);
  const round = checkedRound(row);
  if (await decisionHash(round) !== row.manifestHash || round.id !== row.id || round.closesAt !== (row.closesAt?.toISOString() ?? null)) throw new Error("Round integrity failure");
  return { row, round };
}

async function signer(tx: Tx, roundId: string, userId: string, context: PasskeyContext, round: DecisionRound) {
  if (round.origin !== context.origin || round.rpId !== context.rpId) return fail("forbidden_origin", 403);
  const user = await tx.user.findFirst({ where: { id: userId, status: "ACTIVE", emailVerifiedAt: { not: null }, email: { not: null } } });
  if (!user || isDemoAccount(userId)) return fail("DECISION_VERIFIED_ACCOUNT_REQUIRED", 403);
  const voter = await tx.signedDecisionVoter.findUnique({ where: { roundId_userId: { roundId, userId } }, include: { ballot: true } });
  if (!voter) return fail("DECISION_NOT_ELIGIBLE", 403);
  if (voter.ballot) return fail("DECISION_ALREADY_SIGNED");
  if (round.closesAt !== null && new Date() >= new Date(round.closesAt)) return fail("DECISION_CLOSED");
  const keys = await tx.passkey.findMany({ where: { id: { in: voter.keyIds }, userId, rpId: context.rpId, revokedAt: null } });
  const hashes = round.members.find(m => m.id === voter.id)!.keyHashes;
  const eligible = [];
  for (const key of keys) if (hashes.includes(await sha256(new Uint8Array(key.publicKey)))) eligible.push(key);
  if (!eligible.length) return fail("DECISION_KEY_UNAVAILABLE", 403);
  return { voter, keys: eligible };
}

async function activeRound(tx: Tx, revisionId: string) {
  const revision = await tx.archiveRevision.findUniqueOrThrow({ where: { id: revisionId }, select: { archiveId: true, packageJson: true, manifestHash: true, archive: { select: { committeeId: true } } } });
  if (revision.archive.committeeId && !committeeOperationsEnabled()) return fail("COMMITTEE_NOT_ENABLED", 403);
  await lockProposalArchive(tx, revision.archiveId);
  if (await tx.proposalAbandonment.findUnique({ where: { archiveId: revision.archiveId } })) return fail("PROPOSAL_ABANDONED");
  if (revision.archive.committeeId && zcgSourceWithdrawal((await verifyArchivePackage(JSON.parse(revision.packageJson), revision.manifestHash)).manifest)) return fail("PROPOSAL_SOURCE_WITHDRAWN");
}

export async function beginDecisionSignature(communityId: string, recordId: string, roundId: string, userId: string, input: unknown, context: PasskeyContext) {
  const { choice, rationale } = z.object({ choice: decisionChoice, rationale: decisionRationale.optional() }).strict().parse(input);
  return transaction(async tx => {
    const { row, round } = await scopedRound(tx, communityId, recordId, roundId);
    await activeRound(tx, row.revisionId);
    const { voter, keys } = await signer(tx, roundId, userId, context, round);
    if (round.schema !== "PARTICIPATE_DECISION_ROUND_V1" && !rationale) return fail("DECISION_RATIONALE_REQUIRED", 400);
    if (round.schema === "PARTICIPATE_DECISION_ROUND_V1" && rationale !== undefined) return fail("DECISION_REFRESH_REQUIRED");
    const now = new Date(), throttleId = `decision:${userId}`;
    const deadline = row.closesAt?.getTime() ?? Infinity;
    await tx.passkeyThrottle.updateMany({ where: { id: throttleId, resetsAt: { lte: now } }, data: { attempts: 0, resetsAt: new Date(+now + 60000) } });
    const throttle = await tx.passkeyThrottle.upsert({ where: { id: throttleId }, create: { id: throttleId, attempts: 1, resetsAt: new Date(+now + 60000) }, update: { attempts: { increment: 1 } } });
    if (throttle.attempts > 10) return fail("PASSKEY_RATE_LIMITED", 429);
    const envelope: DecisionEnvelope = { ...(round.schema !== "PARTICIPATE_DECISION_ROUND_V1" ? { schema: "PARTICIPATE_DECISION_SIGNATURE_V2" as const, rationale: rationale! } : { schema: "PARTICIPATE_DECISION_SIGNATURE_V1" as const }), roundHash: row.manifestHash, voterId: voter.id, choice,
      nonce: randomBytes(32).toString("base64url"), issuedAt: now.toISOString(), expiresAt: new Date(Math.min(+now + 300000, deadline)).toISOString() };
    const options = await generateAuthenticationOptions({ rpID: context.rpId, timeout: Math.min(60000, deadline - +now), userVerification: "required",
      allowCredentials: keys.map(key => ({ id: key.credentialId, transports: key.transports })) });
    options.challenge = await decisionChallenge(envelope);
    await tx.signedDecisionChallenge.deleteMany({ where: { OR: [{ expiresAt: { lte: now } }, { roundId, userId }] } });
    const ceremonyId = randomUUID();
    await tx.signedDecisionChallenge.create({ data: { id: ceremonyId, roundId, userId, envelope: canonicalJson(envelope), expiresAt: new Date(envelope.expiresAt) } });
    return { options, ceremonyId, envelope, roundHash: row.manifestHash };
  });
}

export async function finishDecisionSignature(communityId: string, recordId: string, roundId: string, userId: string, ceremonyId: string, response: AuthenticationResponseJSON, context: PasskeyContext) {
  // Claim outside the ballot transaction: invalid and concurrent attempts cannot reuse a ceremony.
  const saved = await db.signedDecisionChallenge.findFirst({ where: { id: ceremonyId, roundId, userId } });
  const claim = await db.signedDecisionChallenge.deleteMany({ where: { id: ceremonyId, roundId, userId } });
  if (!saved || claim.count !== 1 || saved.expiresAt <= new Date()) return fail("PASSKEY_EXPIRED", 400);
  return transaction(async tx => {
    // Same lock order as passkey management prevents a revocation racing a ballot.
    if ((await tx.user.updateMany({ where: { id: userId, status: "ACTIVE" }, data: { id: userId } })).count !== 1) return fail("unauthorized", 401);
    const { row: roundRow, round } = await scopedRound(tx, communityId, recordId, roundId);
    await activeRound(tx, roundRow.revisionId);
    const { voter, keys } = await signer(tx, roundId, userId, context, round);
    const key = keys.find(k => k.credentialId === response.id);
    if (!key || response.rawId !== response.id || (response.response.userHandle && response.response.userHandle !== key.userHandle)) return fail("PASSKEY_INVALID", 400);
    const envelope = JSON.parse(saved.envelope) as DecisionEnvelope;
    const ballot: DecisionBallot = { envelope, keyHash: await sha256(new Uint8Array(key.publicKey)), publicKey: Buffer.from(key.publicKey).toString("base64url"),
      assertion: { clientDataJSON: response.response.clientDataJSON, authenticatorData: response.response.authenticatorData, signature: response.response.signature }, recordedAt: new Date().toISOString() };
    if (envelope.voterId !== voter.id) return fail("PASSKEY_INVALID", 400);
    await verifyDecisionBallot(round, ballot).catch(() => fail("PASSKEY_INVALID", 400));
    const checked = await verifyAuthenticationResponse({ response, expectedChallenge: await decisionChallenge(envelope), expectedOrigin: context.origin, expectedRPID: context.rpId,
      requireUserVerification: true, credential: { id: key.credentialId, publicKey: new Uint8Array(key.publicKey), counter: Number(key.counter) } }).catch(() => fail("PASSKEY_INVALID", 400));
    if (!checked.verified || Date.now() >= +saved.expiresAt) return fail("PASSKEY_EXPIRED", 400);
    const updated = await tx.passkey.updateMany({ where: { id: key.id, revokedAt: null, counter: key.counter }, data: { counter: BigInt(checked.authenticationInfo.newCounter), lastUsedAt: new Date() } });
    if (updated.count !== 1) return fail("PASSKEY_INVALID", 400);
    const row = await tx.signedDecisionBallot.create({ data: { id: randomUUID(), roundId, voterId: voter.id, ballotJson: canonicalJson(ballot), ballotHash: await decisionHash(ballot), recordedAt: new Date(ballot.recordedAt) } });
    const revision = await tx.signedDecisionRound.findUniqueOrThrow({ where: { id: roundId }, include: { revision: { include: { archive: true } } } });
    if (revision.revision.archive.committeeId) await appendCommitteeEvent(tx, revision.scopeId, userId, "DECISION_SIGNED", { roundId, ballotHash: row.ballotHash, choice: envelope.choice, summary: `${envelope.choice.toLowerCase()} · ${round.proposal.title}` });
    if (round.schema === "PARTICIPATE_DECISION_ROUND_V4") {
      const savedRound = await tx.signedDecisionRound.findUniqueOrThrow({ where: { id: roundId }, include: { ballots: true } });
      if (savedRound.ballots.length === round.members.length) {
        const receipt = await decisionReceiptFromRows(savedRound, JSON.parse(revision.revision.packageJson));
        const tally = tallyDecisions(round, receipt.ballots, false);
        if (tally.outcome !== "APPROVED" && tally.outcome !== "REJECTED") throw new Error("Incomplete review cannot be published");
        await initializeArchiveActivity(tx, revision.revision.archive);
        await appendArchiveActivity(tx, revision.revision.archive, userId, `review-decided:${roundId}`, {
          kind: "REVIEW_DECIDED", authority: "INDEPENDENT_PILOT_REVIEW", roundId, roundHash: savedRound.manifestHash,
          receiptHash: await decisionHash(receipt), reviewedManifestHash: round.proposal.manifestHash, revision: round.proposal.revision,
          outcome: tally.outcome, signed: 5, approve: tally.approve, reject: tally.reject, abstain: tally.abstain
        }, new Date(receipt.asOf));
      }
    }
    return { ballotHash: row.ballotHash, choice: envelope.choice };
  });
}

export async function readDecisionReceipt(communityId: string, recordId: string, roundId: string): Promise<DecisionReceipt> {
  return db.$transaction(async tx => {
    const { row, round } = await scopedRound(tx, communityId, recordId, roundId);
    const revision = await tx.archiveRevision.findUniqueOrThrow({ where: { id: row.revisionId } });
    const rows = await tx.signedDecisionBallot.findMany({ where: { roundId }, orderBy: { voterId: "asc" } });
    const ballots: DecisionBallot[] = [];
    for (const item of rows) {
      const ballot = JSON.parse(item.ballotJson) as DecisionBallot;
      if (await decisionHash(ballot) !== item.ballotHash || ballot.envelope.voterId !== item.voterId || ballot.recordedAt !== item.recordedAt.toISOString()) throw new Error("Ballot integrity failure");
      ballots.push(ballot);
    }
    return decisionReceiptFromRows({ ...row, ballots: rows }, JSON.parse(revision.packageJson));
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
}

/** HTTP downloads never disclose a partial V4 committee ballot inventory. */
export async function readPublishedDecisionReceipt(communityId: string, recordId: string, roundId: string) {
  const receipt = await readDecisionReceipt(communityId, recordId, roundId);
  if (!reviewIsPublic(receipt)) return fail("DECISION_NOT_PUBLISHED", 409);
  return receipt;
}

export async function readSignedDecisions(communityId: string, recordId: string, revisionNumber: number, userId: string | undefined, context: PasskeyContext | null) {
  const actor = await archiveAccess(db, communityId, recordId, userId);
  const abandonment = await abandonmentView(actor.archive.abandonment);
  const revision = await db.archiveRevision.findFirst({ where: { archiveId: actor.archive.id, revision: revisionNumber }, include: { decision: true } });
  if (!revision) return fail("DECISION_NOT_FOUND", 404);
  const sourceWithdrawal = actor.archive.committeeId ? zcgSourceWithdrawal((await verifyArchivePackage(JSON.parse(revision.packageJson), revision.manifestHash)).manifest) : null;
  if (!revision.decision) {
    const people = actor.manager && context ? await roster(db, actor.scopeId, context, userId) : [];
    const policy = actor.archive.committeeId ? await db.committeePolicy.findUnique({ where: { communityId: actor.scopeId } }) : null;
    const scopeKind = (await db.community.findUniqueOrThrow({ where: { id: actor.scopeId } })).kind;
    return { round: null, abandonment, sourceWithdrawal, canManage: Boolean(actor.manager), canCreate: Boolean(!abandonment && !sourceWithdrawal && context && people.length && people.length <= 200 && (scopeKind !== "COMMITTEE" || people.length === 5) && people.every(p => p.ready)),
      roster: people.map(p => ({ label: p.label, ready: p.ready })), defaults: scopeKind === "COMMITTEE" ? { quorum: 5, approvalPercent: 60, durationHours: null } : policy ? { quorum: policy.quorum, approvalPercent: policy.approvalPercent, durationHours: policy.durationHours } : null, scopeKind };
  }
  const receipt = await readDecisionReceipt(communityId, recordId, revision.decision.id);
  const voter = actor.user ? await db.signedDecisionVoter.findUnique({ where: { roundId_userId: { roundId: receipt.round.id, userId: actor.user.id } } }) : null;
  const mine = voter ? receipt.ballots.find(b => b.envelope.voterId === voter.id) : null;
  const voters = await db.signedDecisionVoter.findMany({ where: { roundId: receipt.round.id }, select: { id: true, userId: true } });
  const profiles = await db.user.findMany({ where: { id: { in: voters.map(v => v.userId) }, status: "ACTIVE", shareProfileInDiscussion: true }, select: { id: true, avatarUrl: true } });
  let signingError: string | null = null;
  try { if (actor.archive.committeeId && !committeeOperationsEnabled()) throw new PasskeyError("COMMITTEE_NOT_ENABLED"); if (abandonment) throw new PasskeyError("PROPOSAL_ABANDONED"); if (sourceWithdrawal) throw new PasskeyError("PROPOSAL_SOURCE_WITHDRAWN"); if (!userId || !context) throw new PasskeyError("DECISION_SIGN_IN_REQUIRED"); await signer(db, receipt.round.id, userId, context, receipt.round); }
  catch (error) { signingError = error instanceof PasskeyError ? error.code : "PASSKEY_UNAVAILABLE"; }
  const published = reviewIsPublic(receipt);
  return { publication: published ? "PUBLISHED" : "COLLECTING", progress: { signed: receipt.ballots.length, eligible: receipt.round.members.length }, round: receipt.round, abandonment, sourceWithdrawal, roundHash: receipt.roundHash, tally: published ? tallyDecisions(receipt.round, receipt.ballots, receipt.round.closesAt !== null && Date.now() >= Date.parse(receipt.round.closesAt)) : undefined,
    canSign: signingError === null, signingError, myChoice: mine?.envelope.choice ?? null,
    ballots: (published ? receipt.ballots : []).map(b => ({ voterId: b.envelope.voterId, choice: b.envelope.choice, rationale: "rationale" in b.envelope ? b.envelope.rationale : null, recordedAt: b.recordedAt,
      avatar: profiles.find(p => p.id === voters.find(v => v.id === b.envelope.voterId)?.userId)?.avatarUrl ?? null })),
    canManage: Boolean(actor.manager), canCreate: false, roster: [], scopeKind: actor.archive.committeeId ? "COMMITTEE" : "DAO" };
}
