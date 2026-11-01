import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { publicPilotScope } from "@/lib/auth/public-pilot-policy";
import { type AutomationConfig, validateAutomationReaders } from "./participate-automation";
import { AutomationTransportError, type AutomationTransport } from "@/lib/archive/automation-transport";
import { ArchiveChainError } from "@/lib/archive/chain";
import { activityBatchMemo } from "@/lib/archive/activity";
import { buildArchiveMerkleTree, verifyArchiveMerkleProof } from "@/lib/archive/merkle";
import { checkActivityBatch, prepareActivityBatch } from "./activity-anchors";
import { checkedActivityRow } from "./archive-activity";
import { captureDiscussionClosure } from "./discussion-closure";

const MAX_EVENTS = 1000;
const COALESCE_MS = 5 * 60_000;
async function log(hostId: string, event: string, details: Record<string, string | number | null>, code?: string, level = "info") {
  await db.participateAutomationLog.create({ data: { hostId, event, details, code, level } });
  console.log(JSON.stringify({ time: new Date().toISOString(), event, ...details, code, level }));
}

/** One frozen batch, immutable inclusions, exact-intent retries, and read-only confirmation checks. */
export async function runActivityAutomation(config: AutomationConfig, transport: AutomationTransport) {
  if (!config.activityEnabled) return { state: "DISABLED" };
  const scope = publicPilotScope();
  if (!scope || config.chain.pool !== "ironwood" || config.chain.network !== "mainnet") throw new Error("ACTIVITY_IRONWOOD_SCOPE_REQUIRED");
  validateAutomationReaders(config);
  return db.$transaction(async lock => {
    const [acquired] = await lock.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtextextended(${`participate-automation:${scope.hostId}`}, 0)) AS locked`;
    if (!acquired.locked) return { state: "BUSY" };
    // Recover a crash between a source import and its closing event. Existing
    // verdicts are explicitly captured today, preserving their source timestamp.
    const archives = await db.proposalArchive.findMany({ where: { communityId: scope.hostId, committeeId: scope.committeeId }, select: { revisions: { orderBy: { revision: "desc" }, take: 1, select: { id: true } } } });
    for (const archive of archives) if (archive.revisions[0]) await captureDiscussionClosure(archive.revisions[0].id);
    let job = await db.activityAutomationJob.findFirst({ where: { batch: { communityId: scope.hostId }, state: { notIn: ["VERIFIED", "NEEDS_REVIEW"] } }, orderBy: { createdAt: "asc" } });
    if (job && job.nextAttemptAt > new Date()) return { state: "WAITING" };
    if (!job) {
      // A review-held batch prevents another send until its uncertain outcome is reconciled.
      if (await db.activityAutomationJob.findFirst({ where: { batch: { communityId: scope.hostId }, state: "NEEDS_REVIEW" } })) return { state: "NEEDS_REVIEW" };
      const oldest = await db.archiveActivityEvent.findFirst({ where: { archive: { communityId: scope.hostId, committeeId: scope.committeeId }, inclusion: null }, orderBy: { createdAt: "asc" } });
      if (oldest && oldest.createdAt.getTime() <= Date.now() - COALESCE_MS) {
        const batch = await prepareActivityBatch(scope.hostId, config.chain, MAX_EVENTS, scope);
        if (batch) job = await db.activityAutomationJob.upsert({ where: { batchId: batch.id }, create: { batchId: batch.id }, update: {} });
      }
      job ??= await db.activityAutomationJob.findFirst({ where: { batch: { communityId: scope.hostId }, state: "VERIFIED", nextAttemptAt: { lte: new Date() } }, orderBy: { nextAttemptAt: "asc" } });
    }
    if (!job) return { state: "IDLE" };
    const batchId = job.batchId;
    let dispatched = false;
    try {
      const batch = await db.archiveActivityBatch.findUniqueOrThrow({ where: { id: batchId }, include: { entries: { include: { event: { include: { archive: true } } } } } });
      const eventHashes = batch.entries.map(entry => entry.event.eventHash).sort();
      const tree = buildArchiveMerkleTree(eventHashes);
      if (batch.pool !== "ironwood" || batch.network !== "mainnet" || batch.receiver !== config.chain.receiver || batch.leafCount !== eventHashes.length || eventHashes.length > MAX_EVENTS || tree.root !== batch.root || batch.memo !== activityBatchMemo(tree.root, tree.leafCount, "mainnet")) throw new ArchiveChainError("ACTIVITY_INVENTORY_MISMATCH");
      for (const entry of batch.entries) {
        if (entry.event.archive.communityId !== scope.hostId || entry.event.archive.committeeId !== scope.committeeId) throw new ArchiveChainError("ACTIVITY_SCOPE_MISMATCH");
        await checkedActivityRow(entry.event, entry.event.archive);
        const proof = verifyArchiveMerkleProof(entry.event.eventHash, entry.proof);
        if (proof.root !== batch.root || proof.leafCount !== batch.leafCount) throw new ArchiveChainError("ACTIVITY_INVENTORY_MISMATCH");
      }
      let txid = batch.txid;
      if (!txid) {
        await db.activityAutomationJob.update({ where: { batchId }, data: { state: "DISPATCHED" } });
        dispatched = true;
        await log(scope.hostId, "activity_signer_requested", { batchId, root: batch.root, eventCount: batch.leafCount, pool: "ironwood" });
        const result = await transport.anchor({ pool: "ironwood", root: batch.root, memo: batch.memo, receiver: batch.receiver, eventHashes });
        if (result.root !== batch.root || result.state === "BROADCAST" && (!result.txid || !result.feeZat || result.pool !== "ironwood")) throw new AutomationTransportError("SIGNER_RESPONSE_MISMATCH");
        if (result.state === "NEEDS_REVIEW") {
          await db.activityAutomationJob.update({ where: { batchId }, data: { state: "NEEDS_REVIEW", lastErrorCode: result.code ?? "SIGNER_RECONCILIATION_REQUIRED" } });
          await log(scope.hostId, "activity_needs_review", { batchId }, result.code, "error");
          return { state: "NEEDS_REVIEW" };
        }
        if (result.state === "RETRY") throw new AutomationTransportError(result.code ?? "SIGNER_NOT_READY");
        txid = result.txid!;
        // Bind the transaction BEFORE attempting observation. An observation
        // failure never permits a replacement spend or a new event inventory.
        await db.$transaction(async tx => {
          await tx.archiveActivityBatch.update({ where: { id: batchId }, data: { txid } });
          await tx.activityAutomationJob.update({ where: { batchId }, data: { state: "CONFIRMING", feeZat: result.feeZat, attempts: 0, lastErrorCode: null } });
        });
        await log(scope.hostId, "activity_broadcast", { batchId, txid, eventCount: batch.leafCount, pool: "ironwood" });
      }
      const checked = await checkActivityBatch(batchId, txid, config.chain, transport.fetcher);
      const state = checked.evidence.confirmations >= checked.evidence.requiredConfirmations ? "VERIFIED" : "CONFIRMING";
      await db.activityAutomationJob.update({ where: { batchId }, data: { state, attempts: 0, lastErrorCode: null, nextAttemptAt: new Date(Date.now() + (state === "VERIFIED" ? 600_000 : 60_000)) } });
      await log(scope.hostId, state === "VERIFIED" ? "activity_verified" : "activity_confirming", { batchId, txid, confirmations: checked.evidence.confirmations, eventCount: batch.leafCount });
      return { state, batchId };
    } catch (error) {
      const code = error instanceof ArchiveChainError || error instanceof AutomationTransportError ? error.code : "ACTIVITY_OPERATION_FAILED";
      const integrity = code.startsWith("ACTIVITY_") && code !== "ACTIVITY_OPERATION_FAILED" || ["SIGNER_RESPONSE_MISMATCH", "TRANSACTION_EXPIRED", "ANCHOR_CONFIGURATION_CHANGED"].includes(code);
      const wait = Math.min(3600_000, 60_000 * 2 ** Math.min(job.attempts, 6));
      await db.activityAutomationJob.update({ where: { batchId }, data: { ...(integrity ? { state: "NEEDS_REVIEW" } : {}), attempts: { increment: 1 }, lastErrorCode: code, nextAttemptAt: new Date(Date.now() + wait) } });
      await log(scope.hostId, integrity ? "activity_needs_review" : "activity_retry_scheduled", { batchId, retryInSeconds: wait / 1000, dispatched: dispatched ? 1 : 0 }, code, integrity ? "error" : "warn");
      return { state: integrity ? "NEEDS_REVIEW" : "RETRY", batchId };
    }
  }, { timeout: 1_800_000, maxWait: 5000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}
