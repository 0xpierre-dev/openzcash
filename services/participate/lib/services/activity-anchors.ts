import { decisionReceiptFromRows } from "@/lib/decisions/publication";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { verifyArchivePackage, digestSchema, canonicalJson } from "@/lib/archive/format";
import { activityBatchMemo, activityInclusionSchema, verifyActivityBundle, activityLabel, type ActivityBundle } from "@/lib/archive/activity";
import { buildArchiveMerkleTree, verifyArchiveMerkleProof } from "@/lib/archive/merkle";
import { ArchiveChainError, createArchiveObserver, validateArchiveConfig, type ArchiveChainConfig } from "@/lib/archive/chain";
import { activityProof } from "@/lib/archive/activity-proof";
import { officialSourceIssue } from "@/lib/archive/source-identity";
import { checkedActivityRow } from "./archive-activity";

const checkInclude = { orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }], take: 1 };
const eventInclude = { archive: true, inclusion: { include: { batch: { include: { checks: checkInclude } } } } };
type EventRow = Prisma.ArchiveActivityEventGetPayload<{ include: typeof eventInclude }>;

/** One unfinished batch per community. Retries return the same frozen inventory. No wallet call. */
export async function prepareActivityBatch(communityId: string, config: ArchiveChainConfig, limit = 1000, automaticScope?: { committeeId: string }) {
  validateArchiveConfig(config);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw new Error("Invalid batch limit");
  return db.$transaction(async tx => {
    const pending = await tx.archiveActivityBatch.findFirst({ where: { communityId, txid: null, ...(automaticScope ? { pool: "ironwood", automation: { isNot: null } } : {}) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    if (pending) {
      if (pending.network !== config.network || pending.receiver !== config.receiver || pending.pool !== (config.pool ?? "sapling")) throw new ArchiveChainError("ANCHOR_CONFIGURATION_CHANGED");
      return pending;
    }
    let archiveIds: string[] | undefined;
    if (automaticScope) {
      // Only official imported sources and real participant publications enter paid automation.
      const candidates = await tx.proposalArchive.findMany({ where: { communityId, committeeId: automaticScope.committeeId, activityEvents: { some: { inclusion: null } } }, include: { revisions: { orderBy: { revision: "desc" }, take: 1 } } });
      archiveIds = [];
      for (const archive of candidates) {
        const revision = archive.revisions[0]; if (!revision) continue;
        const checked = await verifyArchivePackage(JSON.parse(revision.packageJson), revision.manifestHash);
        const application = checked.bundle.files.find(file => file.path === "application.json");
        const native = checked.manifest.kind === "NATIVE_PROPOSAL" && application && JSON.parse(Buffer.from(application.data, "base64").toString()).publication === "COMMUNITY_PUBLICATION";
        if (officialSourceIssue(checked.manifest) !== null || native) archiveIds.push(archive.id);
      }
    }
    const eligible = automaticScope && archiveIds?.length ? await tx.$queryRaw<{ id: string }[]>`
      SELECT e."id" FROM "ArchiveActivityEvent" e
      LEFT JOIN "ArchiveActivityActor" actor ON actor."id" = e."eventJson"::jsonb->>'actor' AND actor."archiveId" = e."archiveId"
      LEFT JOIN "User" u ON u."id" = actor."userId"
      WHERE e."archiveId" IN (${Prisma.join(archiveIds)})
        AND NOT EXISTS (SELECT 1 FROM "ArchiveActivityInclusion" i WHERE i."eventId" = e."id")
        AND (e."eventJson"::jsonb->>'actor' = 'SOURCE_OBSERVER' OR (u."emailVerifiedAt" IS NOT NULL AND left(u."id", 8) <> 'preview_'))
      ORDER BY e."createdAt", e."id" LIMIT ${limit}` : null;
    const events = await tx.archiveActivityEvent.findMany({ where: { archive: { communityId }, ...(archiveIds ? { archiveId: { in: archiveIds }, id: { in: eligible?.map(row => row.id) ?? [] } } : {}), inclusion: null }, include: { archive: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: limit });
    if (!events.length) return null;
    for (const event of events) await checkedActivityRow(event, event.archive);
    const tree = buildArchiveMerkleTree(events.map(event => event.eventHash));
    const batch = await tx.archiveActivityBatch.create({ data: { communityId, pool: config.pool ?? "sapling", network: config.network, root: tree.root,
      leafCount: tree.leafCount, memo: activityBatchMemo(tree.root, tree.leafCount, config.network), receiver: config.receiver } });
    await tx.archiveActivityInclusion.createMany({ data: events.map(event => ({ eventId: event.id, batchId: batch.id, proof: tree.proofs[event.eventHash] })) });
    if (automaticScope) await tx.activityAutomationJob.create({ data: { batchId: batch.id } });
    return batch;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
}

/** Observe a separately submitted operator transaction. Never signs, pays, or rebroadcasts. */
export async function checkActivityBatch(id: string, txid: string, config: ArchiveChainConfig, fetcher: typeof fetch = fetch) {
  validateArchiveConfig(config); digestSchema.parse(txid);
  const batch = await db.archiveActivityBatch.findUniqueOrThrow({ where: { id }, include: { entries: { include: { event: { include: { archive: true } } } } } });
  if (batch.pool !== (config.pool ?? "sapling") || batch.network !== config.network || batch.receiver !== config.receiver || batch.memo !== activityBatchMemo(batch.root, batch.leafCount, config.network)) throw new ArchiveChainError("ANCHOR_CONFIGURATION_CHANGED");
  if (batch.txid && batch.txid !== txid) throw new ArchiveChainError("ALREADY_DISPATCHED");
  if (batch.entries.length !== batch.leafCount) throw new Error("Incomplete activity batch");
  const tree = buildArchiveMerkleTree(batch.entries.map(row => row.event.eventHash));
  if (tree.root !== batch.root) throw new Error("Activity inventory mismatch");
  for (const entry of batch.entries) {
    await checkedActivityRow(entry.event, entry.event.archive);
    const proof = verifyArchiveMerkleProof(entry.event.eventHash, entry.proof);
    if (entry.event.archive.communityId !== batch.communityId || proof.root !== batch.root || proof.leafCount !== batch.leafCount) throw new Error("Activity inclusion mismatch");
  }
  let evidence;
  try { evidence = await createArchiveObserver(fetcher)(config, txid, batch.memo); }
  catch (error) {
    if (batch.txid) await db.archiveActivityCheck.create({ data: { batchId: id, status: "UNVERIFIED", evidence: { reason: error instanceof ArchiveChainError ? error.code : "INVALID_EVIDENCE" } } });
    throw error;
  }
  return db.$transaction(async tx => {
    const current = await tx.archiveActivityBatch.findUniqueOrThrow({ where: { id } });
    if (current.txid && current.txid !== txid) throw new ArchiveChainError("ALREADY_DISPATCHED");
    if (!current.txid) await tx.archiveActivityBatch.update({ where: { id }, data: { txid } });
    await tx.archiveActivityCheck.create({ data: { batchId: id, status: evidence.confirmations >= evidence.requiredConfirmations ? "VERIFIED" : "CONFIRMING", evidence } });
    return { batchId: id, count: batch.leafCount, evidence };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function publicReceipt(row: EventRow, bodies: Map<string, string>, tx: Prisma.TransactionClient = db) {
  const event = await checkedActivityRow(row, row.archive);
  const batch = row.inclusion?.batch;
  const inclusion = batch ? activityInclusionSchema.parse({ pool: batch.pool, network: batch.network, memo: batch.memo, receiver: batch.receiver, proof: row.inclusion!.proof }) : null;
  if (batch && (inclusion!.proof.root !== batch.root || inclusion!.proof.leafCount !== batch.leafCount)) throw new Error("Activity batch mismatch");
  const proof = activityProof(inclusion, batch);
  const bundle: ActivityBundle = { schema: "PARTICIPATE_EVENT_RECEIPT_V1", event: row.eventJson, eventHash: row.eventHash,
    body: event.kind === "COMMENT_POSTED" || event.kind === "COMMENT_EDITED" ? bodies.get(`${event.commentId}:${event.kind === "COMMENT_POSTED" ? 1 : event.version}`) ?? null : null, inclusion, chain: proof.chain,
    ...(event.kind === "DISCUSSION_CLOSED" ? { closure: (await tx.archiveDiscussionClosure.findUniqueOrThrow({ where: { snapshotHash: event.snapshotHash } })).snapshotJson } : {}) };
  if (event.kind === "REVIEW_DECIDED") {
    const saved = await tx.signedDecisionRound.findFirstOrThrow({ where: { id: event.roundId, revision: { archiveId: row.archiveId } }, include: { ballots: true, revision: true } });
    bundle.reviewReceipt = canonicalJson(await decisionReceiptFromRows(saved, JSON.parse(saved.revision.packageJson)));
  }
  await verifyActivityBundle(bundle, row.eventHash);
  return { event, bundle, proof };
}

async function visibleBodies(tx: Prisma.TransactionClient, archiveId: string, rows: { eventJson: string }[]) {
  const ids = rows.map(row => JSON.parse(row.eventJson)).filter(event => event.kind === "COMMENT_POSTED" || event.kind === "COMMENT_EDITED").map(event => String(event.commentId));
  const versions = await tx.archiveCommentVersion.findMany({ where: { comment: { archiveId, id: { in: ids }, hiddenAt: null } }, select: { commentId: true, version: true, body: true } });
  return new Map(versions.map(row => [`${row.commentId}:${row.version}`, row.body]));
}

export async function readArchiveActivity(communityId: string, recordId: string, before?: number, reviewRoundId?: string) {
  return db.$transaction(async tx => {
    const archive = await tx.proposalArchive.findUnique({ where: { communityId_recordId: { communityId, recordId } } });
    if (!archive) return null;
    const rows = await tx.archiveActivityEvent.findMany({ where: { archiveId: archive.id, ...(reviewRoundId ? { sourceKey: `review-decided:${reviewRoundId}` } : {}), ...(before ? { sequence: { lt: before } } : {}) }, include: eventInclude, orderBy: { sequence: "desc" }, take: 51 });
    const page = rows.slice(0, 50), bodies = await visibleBodies(tx, archive.id, page);
    const items = await Promise.all(page.map(async row => {
      const { event, proof } = await publicReceipt(row, bodies, tx);
      const evidence = proof.chain?.evidence;
      return { id: event.id, sequence: event.sequence, kind: event.kind, label: activityLabel(event), origin: event.origin,
        occurredAt: event.occurredAt, recordedAt: event.recordedAt, eventHash: row.eventHash,
        state: proof.state, stateLabel: proof.label, actor: event.kind === "DISCUSSION_CLOSED" ? "Official source" : `${event.kind === "PROPOSAL_ABANDONED" ? "Author" : event.kind === "PROPOSAL_LABELS_SET" ? "Committee member" : "Participant"} ${event.actor.slice(0, 8)}`,
        ...(event.kind === "PROPOSAL_ABANDONED" ? { reason: event.reason } : {}),
        ...(event.kind === "REVIEW_DECIDED" ? { review: { roundId: event.roundId, revision: event.revision, receiptHash: event.receiptHash } } : {}),
        chain: evidence ? { pool: evidence.pool, network: evidence.network, txid: evidence.txid, blockHeight: evidence.blockHeight, blockTime: evidence.blockTime,
          confirmations: evidence.confirmations, requiredConfirmations: evidence.requiredConfirmations, checkedAt: evidence.checkedAt } : null };
    }));
    return { items, nextBefore: rows.length > 50 ? page.at(-1)!.sequence : null };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

/** Public content only. Hidden comment bytes and private account mappings never leave here. */
export async function readActivityReceipt(communityId: string, recordId: string, id: string) {
  return db.$transaction(async tx => {
    const row = await tx.archiveActivityEvent.findFirst({ where: { id, archive: { communityId, recordId } }, include: eventInclude });
    if (!row) return null;
    return publicReceipt(row, await visibleBodies(tx, row.archiveId, [row]), tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function exportActivityBatch(id: string) {
  const batch = await db.archiveActivityBatch.findUniqueOrThrow({ where: { id }, include: { entries: { include: { event: { include: { archive: true } } } } } });
  const events = [];
  for (const entry of batch.entries) {
    const receipt = await readActivityReceipt(batch.communityId, entry.event.archive.recordId, entry.eventId);
    if (!receipt) throw new Error("Missing activity receipt");
    events.push(receipt.bundle);
  }
  if (events.length !== batch.leafCount || buildArchiveMerkleTree(events.map(event => event.eventHash)).root !== batch.root) throw new Error("Incomplete activity export");
  return { schema: "PARTICIPATE_ACTIVITY_BATCH_V1", id: batch.id, pool: batch.pool, network: batch.network, receiver: batch.receiver,
    root: batch.root, leafCount: batch.leafCount, memo: batch.memo, txid: batch.txid, events };
}
