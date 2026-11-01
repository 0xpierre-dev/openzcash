import { createHash } from "node:crypto";
import { Prisma, type ParticipateAutomationJob } from "@prisma/client";
import { db } from "@/lib/db";
import { publicPilotScope } from "@/lib/auth/public-pilot-policy";
import { canonicalJson } from "@/lib/archive/format";
import { archiveBatchMemo, buildArchiveMerkleTree, verifyArchiveMerkleProof } from "@/lib/archive/merkle";
import { verifySourceProposal } from "@/lib/archive/source-proposals";
import { ZCG_REVIEW_SOURCE } from "@/lib/domain/zcg-review";
import { SourceDiscoveryError } from "@/lib/archive/source-discovery";
import { officialSourceIssue } from "@/lib/archive/source-identity";
import { captureOfficialSourceRevisions } from "./participate-source-revisions";
import { AutomationTransportError, type AutomationTransport } from "@/lib/archive/automation-transport";
import { ArchiveChainError, validateArchiveConfig, type ArchiveChainConfig } from "@/lib/archive/chain";
import { importSourceProposal } from "./source-intake";
import { prepareArchiveBatchInTransaction, checkExternalArchiveBatch } from "./archive-anchors";

export type AutomationConfig = { activityEnabled?: boolean; startedAt: Date; chain: ArchiveChainConfig; legacyChain?: ArchiveChainConfig; githubToken?: string };
type AutomationScope = { hostId: string; committeeId: string };
export const MAX_AUTOMATION_BATCH_RECORDS = 10;

/** The legacy hash is unchanged for historical Sapling configurations. */
export function participateAutomationPolicyHash(scope: AutomationScope, config: AutomationConfig) {
  return createHash("sha256").update(canonicalJson({ ...scope, startedAt: config.startedAt.toISOString(), network: "mainnet", receiver: config.chain.receiver,
    viewingKey: config.chain.publicViewingKey, receiverIndex: config.chain.receiverIndex ?? null, confirmations: config.chain.requiredConfirmations,
    ...(config.chain.pool === "ironwood" ? { policyVersion: 2, pool: "ironwood", walletVersion: config.chain.walletVersion, birthdayHeight: config.chain.birthdayHeight,
      legacyReader: config.legacyChain ? { pool: config.legacyChain.pool ?? "sapling", network: config.legacyChain.network, receiver: config.legacyChain.receiver,
        viewingKey: config.legacyChain.publicViewingKey, receiverIndex: config.legacyChain.receiverIndex ?? null, confirmations: config.legacyChain.requiredConfirmations,
        walletVersion: config.legacyChain.walletVersion, birthdayHeight: config.legacyChain.birthdayHeight } : null } : {})
  })).digest("hex");
}

export function validateAutomationReaders(config: AutomationConfig) {
  validateArchiveConfig(config.chain);
  if (config.chain.writer) throw new ArchiveChainError("AUTOMATION_WRITER_CONFIGURATION_FORBIDDEN");
  if (config.legacyChain) {
    validateArchiveConfig(config.legacyChain);
    if ((config.legacyChain.pool ?? "sapling") !== "sapling" || config.legacyChain.network !== "mainnet" || config.legacyChain.receiver === config.chain.receiver || config.legacyChain.writer)
      throw new ArchiveChainError("AUTOMATION_LEGACY_READER_INVALID");
  }
}
const delay = (attempt: number) => Math.min(3_600_000, 60_000 * 2 ** Math.min(attempt, 6));
class AutomationIntegrityError extends Error {
  readonly code = "AUTOMATION_SOURCE_INTEGRITY_FAILED";
}
const codeOf = (error: unknown) => error instanceof SourceDiscoveryError || error instanceof AutomationTransportError || error instanceof ArchiveChainError || error instanceof AutomationIntegrityError ? error.code : "AUTOMATION_OPERATION_FAILED";
type LogDetails = Record<string, string | number | boolean | null>;
async function log(hostId: string, event: string, details: LogDetails = {}, level = "info", jobId?: string, code?: string) {
  await db.participateAutomationLog.create({ data: { hostId, event, details, level, jobId, code } });
  console.log(JSON.stringify({ time: new Date().toISOString(), level, event, hostId, ...(jobId ? { jobId } : {}), ...(code ? { code } : {}), ...details }));
}

/** Validate the official identity before importing or considering a spend. */
async function verifyJobCapture(job: ParticipateAutomationJob, hostId: string, committeeId: string) {
  try {
    const sourceUrl = `${ZCG_REVIEW_SOURCE}/${job.issueNumber}`;
    if (job.hostId !== hostId || job.committeeId !== committeeId || job.sourceUrl !== sourceUrl) throw new Error("Job identity mismatch");
    const frozen = await verifySourceProposal(JSON.parse(job.packageJson), job.manifestHash);
    if (frozen.capture.source.url !== sourceUrl || frozen.capture.source.issueNumber !== job.issueNumber || officialSourceIssue(frozen.manifest) !== job.issueNumber || frozen.manifest.revision !== job.revision
        || (frozen.capture.schema === "PARTICIPATE_SOURCE_CAPTURE_V2" ? job.sourceFingerprint !== frozen.capture.observationHash : job.sourceFingerprint !== null)) throw new Error("Capture identity mismatch");
    return frozen;
  } catch { throw new AutomationIntegrityError(); }
}

/** A queued intent may only spend for its exact, independently verified official capture. */
async function verifyJobSource(job: ParticipateAutomationJob, hostId: string, committeeId: string) {
  try {
    const frozen = await verifyJobCapture(job, hostId, committeeId);
    if (!job.revisionId) throw new Error("Missing revision");
    const revision = await db.archiveRevision.findUnique({ where: { id: job.revisionId }, include: { archive: { select: { communityId: true, committeeId: true, recordId: true } } } });
    if (!revision || revision.manifestHash !== job.manifestHash || revision.packageJson !== canonicalJson(frozen.bundle)
        || revision.archive.communityId !== hostId || revision.archive.committeeId !== committeeId || revision.archive.recordId !== frozen.manifest.recordId) throw new Error("Revision identity mismatch");
  } catch { throw new AutomationIntegrityError(); }
}

/** Import a bounded page independently of wallet/confirmation availability. */
async function importPendingSources(scope: AutomationScope) {
  const pending = await db.participateAutomationJob.findMany({ where: { ...scope, state: "CAPTURED", revisionId: null, anchorId: null, txid: null, nextAttemptAt: { lte: new Date() } },
    orderBy: [{ createdAt: "asc" }, { revision: "asc" }, { id: "asc" }], take: MAX_AUTOMATION_BATCH_RECORDS });
  let result: "IDLE" | "RETRY" | "NEEDS_REVIEW" = "IDLE";
  for (const job of pending) {
    try {
      const frozen = await verifyJobCapture(job, scope.hostId, scope.committeeId);
      if (frozen.manifest.revision > 1) {
        const predecessor = await db.archiveRevision.findFirst({ where: { archive: { communityId: scope.hostId, committeeId: scope.committeeId, recordId: frozen.manifest.recordId }, revision: frozen.manifest.revision - 1 } });
        if (!predecessor) {
          await db.participateAutomationJob.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(Date.now() + 60_000), lastErrorCode: "SOURCE_PREDECESSOR_PENDING" } });
          await log(scope.hostId, "anchor_waiting_for_predecessor", { issueNumber: job.issueNumber, revision: job.revision }, "info", job.id, "SOURCE_PREDECESSOR_PENDING");
          if (result !== "NEEDS_REVIEW") result = "RETRY";
          continue;
        }
        if (predecessor.manifestHash !== frozen.manifest.previousManifestHash) throw new AutomationIntegrityError();
      }
      const revision = await importSourceProposal(JSON.parse(job.packageJson), job.manifestHash);
      await db.participateAutomationJob.update({ where: { id: job.id }, data: { revisionId: revision.id, lastErrorCode: null } });
      await log(scope.hostId, "proposal_imported", { issueNumber: job.issueNumber, revisionId: revision.id }, "info", job.id);
    } catch (error) {
      const code = codeOf(error), review = error instanceof AutomationIntegrityError;
      await db.participateAutomationJob.update({ where: { id: job.id }, data: { attempts: { increment: 1 }, lastErrorCode: code,
        nextAttemptAt: new Date(Date.now() + delay(job.attempts)), ...(review ? { state: "NEEDS_REVIEW" } : {}) } });
      await log(scope.hostId, "source_import_failed", {}, review ? "error" : "warn", job.id, code);
      if (review) result = "NEEDS_REVIEW";
      else if (result !== "NEEDS_REVIEW") result = "RETRY";
    }
  }
  return result;
}

/** Anchor proofs and ALL immutable job links commit before any signer call. */
async function freezeAutomationBatch(seed: ParticipateAutomationJob, scope: AutomationScope, chain: ArchiveChainConfig) {
  if (seed.anchorId || seed.txid || !seed.revisionId || seed.state !== "CAPTURED") throw new AutomationIntegrityError();
  const existing = await db.archiveAnchor.findUnique({ where: { revisionId_network: { revisionId: seed.revisionId, network: chain.network } } });
  if (existing) {
    // Recover only the old worker's one-record prepare/link crash window. Never
    // regroup a prior commitment or adopt an externally broadcast transaction.
    const proof = readBatchProof(seed.manifestHash, existing.commitment);
    if (proof.leafCount !== 1 || existing.state !== "PREPARED" || existing.operationId || existing.txids.length || existing.receiver !== chain.receiver
        || existing.memo !== archiveBatchMemo(proof.root, 1, chain.network)) throw new AutomationIntegrityError();
    return db.participateAutomationJob.update({ where: { id: seed.id }, data: { anchorId: existing.id, state: "PREPARED" } });
  }
  const candidates = await db.participateAutomationJob.findMany({ where: { ...scope, id: { not: seed.id }, state: "CAPTURED", revisionId: { not: null }, anchorId: null, txid: null, nextAttemptAt: { lte: new Date() } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: MAX_AUTOMATION_BATCH_RECORDS - 1 });
  const committed = await db.archiveAnchor.findMany({ where: { revisionId: { in: candidates.map(item => item.revisionId!) }, network: chain.network }, select: { revisionId: true } });
  const jobs = [seed];
  for (const candidate of candidates) {
    if (committed.some(anchor => anchor.revisionId === candidate.revisionId)) continue;
    try { await verifyJobSource(candidate, scope.hostId, scope.committeeId); jobs.push(candidate); }
    catch {
      await db.participateAutomationJob.update({ where: { id: candidate.id }, data: { state: "NEEDS_REVIEW", lastErrorCode: "AUTOMATION_SOURCE_INTEGRITY_FAILED" } });
      await log(scope.hostId, "anchor_needs_review", {}, "error", candidate.id, "AUTOMATION_SOURCE_INTEGRITY_FAILED");
    }
  }
  const frozen = await db.$transaction(async tx => {
    const batch = await prepareArchiveBatchInTransaction(jobs.map(item => item.revisionId!), chain, tx);
    for (const job of jobs) {
      const anchor = batch.anchors.find(item => item.revisionId === job.revisionId);
      if (!anchor || anchor.state !== "PREPARED" || anchor.operationId || anchor.txids.length) throw new AutomationIntegrityError();
      const linked = await tx.participateAutomationJob.updateMany({ where: { ...scope, id: job.id, state: "CAPTURED", txid: null, anchorId: null, revisionId: job.revisionId },
        data: { anchorId: anchor.id, state: "PREPARED" } });
      if (linked.count !== 1) throw new AutomationIntegrityError();
    }
    return batch;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 });
  await log(scope.hostId, "anchor_batch_prepared", { root: frozen.root, recordCount: frozen.leafCount, pool: "ironwood" });
  return db.participateAutomationJob.findUniqueOrThrow({ where: { id: seed.id } });
}

function readBatchProof(hash: string, commitment: unknown) {
  try { return verifyArchiveMerkleProof(hash, commitment); }
  catch { throw new AutomationIntegrityError(); }
}

/** Recover the full frozen inventory from durable per-revision Merkle proofs. */
async function loadAutomationBatch(seed: ParticipateAutomationJob, scope: AutomationScope, config: AutomationConfig) {
  if (!seed.anchorId || !seed.revisionId) throw new AutomationIntegrityError();
  const first = await db.archiveAnchor.findUnique({ where: { id: seed.anchorId } });
  if (!first || first.revisionId !== seed.revisionId || first.network !== config.chain.network) throw new AutomationIntegrityError();
  const reader = [config.chain, config.legacyChain].find(candidate => candidate?.receiver === first.receiver);
  if (!reader || !seed.txid && reader !== config.chain) throw new AutomationIntegrityError();
  const firstProof = readBatchProof(seed.manifestHash, first.commitment);
  if (firstProof.leafCount > MAX_AUTOMATION_BATCH_RECORDS) throw new AutomationIntegrityError();
  const anchors = await db.archiveAnchor.findMany({ where: { network: first.network, receiver: first.receiver, memo: first.memo }, take: MAX_AUTOMATION_BATCH_RECORDS + 1 });
  const jobs = await db.participateAutomationJob.findMany({ where: { ...scope, anchorId: { in: anchors.map(anchor => anchor.id) } }, orderBy: [{ manifestHash: "asc" }, { id: "asc" }] });
  if (anchors.length !== firstProof.leafCount || jobs.length !== anchors.length || !jobs.some(job => job.id === seed.id)
      || new Set(jobs.map(job => job.anchorId)).size !== jobs.length || jobs.some(job => job.state === "NEEDS_REVIEW")
      || new Set(jobs.map(job => job.txid)).size !== 1) throw new AutomationIntegrityError();
  if (new Set(jobs.map(job => job.manifestHash)).size !== jobs.length) throw new AutomationIntegrityError();
  const tree = buildArchiveMerkleTree(jobs.map(job => job.manifestHash));
  if (tree.root !== firstProof.root || first.memo !== archiveBatchMemo(tree.root, tree.leafCount, reader.network)) throw new AutomationIntegrityError();
  for (const job of jobs) {
    await verifyJobSource(job, scope.hostId, scope.committeeId);
    const anchor = anchors.find(item => item.id === job.anchorId)!;
    if (anchor.revisionId !== job.revisionId || canonicalJson(anchor.commitment) !== canonicalJson(tree.proofs[job.manifestHash])) throw new AutomationIntegrityError();
    if (!job.txid && (anchor.state !== "PREPARED" || anchor.operationId || anchor.txids.length)) throw new AutomationIntegrityError();
    if (job.txid && !(anchor.state === "PREPARED" && !anchor.operationId && !anchor.txids.length
        || anchor.state === "BROADCAST" && anchor.txids.length === 1 && anchor.txids[0] === job.txid)) throw new AutomationIntegrityError();
  }
  return { jobs, anchors, reader, root: tree.root, memo: first.memo };
}

/** One worker cycle; never exposed through a public route. Same intent survives every retry. */
export async function runParticipateAutomation(config: AutomationConfig, transport: AutomationTransport, fetcher: typeof fetch = fetch) {
  const scope = publicPilotScope();
  if (!scope || config.chain.network !== "mainnet" || !Number.isFinite(config.startedAt.getTime()) || config.startedAt > new Date()) throw new Error("AUTOMATION_CONFIGURATION_INVALID");
  if (config.chain.pool !== "ironwood") {
    await log(scope.hostId, "worker_blocked", {}, "error", undefined, "AUTOMATION_IRONWOOD_REQUIRED");
    return { state: "NEEDS_REVIEW" as const };
  }
  validateAutomationReaders(config);
  const policyHash = participateAutomationPolicyHash(scope, config);
  // A session-bound transaction lock is released by PostgreSQL after a crash. The
  // separate signer also locks each root and its spending budget on the node.
  return db.$transaction(async lock => {
    const [row] = await lock.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtextextended(${`participate-automation:${scope.hostId}`}, 0)) AS acquired`;
    if (!row.acquired) return { state: "BUSY" as const };
    let state = await db.participateAutomationState.upsert({ where: { hostId: scope.hostId }, create: { hostId: scope.hostId, committeeId: scope.committeeId, policyHash, startedAt: config.startedAt, cursorAt: config.startedAt, nextPollAt: new Date(0) }, update: {} });
    if (state.policyHash !== policyHash || state.committeeId !== scope.committeeId) {
      await log(scope.hostId, "worker_blocked", {}, "error", undefined, "AUTOMATION_POLICY_CHANGED");
      return { state: "NEEDS_REVIEW" as const };
    }
    const now = new Date();
    await db.participateAutomationState.update({ where: { hostId: scope.hostId }, data: { lastRunAt: now } });
    if (state.nextPollAt <= now) {
      try {
        const since = new Date(Math.max(state.startedAt.getTime(), state.cursorAt.getTime() - 10 * 60_000));
        const discovery = await captureOfficialSourceRevisions(scope, since, now, log, fetcher, config.githubToken);
        state = await db.participateAutomationState.update({ where: { hostId: scope.hostId }, data: { cursorAt: now, nextPollAt: new Date(now.getTime() + 300_000), lastSuccessAt: now, failures: 0, lastErrorCode: null } });
        await log(scope.hostId, "discovery_completed", discovery);
      } catch (error) {
        const code = codeOf(error), wait = error instanceof SourceDiscoveryError ? Math.max(delay(state.failures), error.retryAfterMs) : delay(state.failures);
        await db.participateAutomationState.update({ where: { hostId: scope.hostId }, data: { failures: { increment: 1 }, lastErrorCode: code, nextPollAt: new Date(Date.now() + wait) } });
        await log(scope.hostId, "discovery_failed", { retryInSeconds: wait / 1000 }, "error", undefined, code);
      }
    }
    const imported = await importPendingSources(scope);
    // One frozen batch per cycle; every imported proposal is already available
    // to participants even when a previous batch is waiting for confirmations.
    const due = { ...scope, revisionId: { not: null }, nextAttemptAt: { lte: new Date() } };
    const orderBy = [{ nextAttemptAt: "asc" as const }, { createdAt: "asc" as const }];
    let job = await db.participateAutomationJob.findFirst({ where: { ...due, state: { notIn: ["NEEDS_REVIEW", "VERIFIED"] } }, orderBy })
      ?? await db.participateAutomationJob.findFirst({ where: { ...due, state: "VERIFIED" }, orderBy });
    if (!job) return { state: imported };
    let jobs = [job];
    try {
      await verifyJobSource(job, scope.hostId, scope.committeeId);
      if (!job.anchorId) job = await freezeAutomationBatch(job, scope, config.chain);
      const batch = await loadAutomationBatch(job, scope, config);
      jobs = batch.jobs;
      const ids = jobs.map(item => item.id), anchorIds = batch.anchors.map(anchor => anchor.id);
      const details = { root: batch.root, recordCount: jobs.length, pool: batch.reader.pool ?? "sapling" };
      if (!jobs[0].txid) {
        // ALL members and their proofs are durable before signing. A timeout
        // retries this exact inventory, even if more proposals have arrived.
        await db.participateAutomationJob.updateMany({ where: { ...scope, id: { in: ids } }, data: { state: "DISPATCHED" } });
        for (const item of jobs) await log(scope.hostId, "signer_requested", details, "info", item.id);
        const result = await transport.anchor({ root: batch.root, memo: batch.memo, receiver: config.chain.receiver, pool: "ironwood", manifestHashes: jobs.map(item => item.manifestHash) });
        if (result.root !== batch.root || result.state === "BROADCAST" && (!result.txid || !result.feeZat || result.pool !== "ironwood")) throw new AutomationTransportError("SIGNER_RESPONSE_MISMATCH");
        if (result.state === "NEEDS_REVIEW") {
          await db.participateAutomationJob.updateMany({ where: { ...scope, id: { in: ids } }, data: { state: "NEEDS_REVIEW", lastErrorCode: result.code ?? "SIGNER_RECONCILIATION_REQUIRED" } });
          for (const item of jobs) await log(scope.hostId, "anchor_needs_review", details, "error", item.id, result.code ?? "SIGNER_RECONCILIATION_REQUIRED");
          return { state: "NEEDS_REVIEW" as const };
        }
        if (result.state === "RETRY") throw new AutomationTransportError(result.code ?? "SIGNER_NOT_READY");
        jobs = await db.$transaction(async tx => {
          const updated = [];
          for (const [index, item] of jobs.entries()) {
            // Store the transaction's fee only once, on the first manifest in
            // canonical order. Other members share its txid, not another fee.
            updated.push(await tx.participateAutomationJob.update({ where: { id: item.id }, data: {
              txid: result.txid, feeZat: index === 0 ? result.feeZat : null, state: "CONFIRMING", attempts: 0, lastErrorCode: null
            } }));
          }
          return updated;
        }, { timeout: 60_000 });
        for (const item of jobs) await log(scope.hostId, "anchor_broadcast", { ...details, txid: item.txid, feeZat: item.feeZat }, "info", item.id);
      }
      const checked = await checkExternalArchiveBatch(anchorIds, jobs[0].txid!, batch.reader, transport.fetcher);
      const verified = checked.evidence.confirmations >= checked.evidence.requiredConfirmations;
      await db.participateAutomationJob.updateMany({ where: { ...scope, id: { in: ids } }, data: { state: verified ? "VERIFIED" : "CONFIRMING", lastErrorCode: null, attempts: 0, nextAttemptAt: new Date(Date.now() + (verified ? 600_000 : 60_000)) } });
      for (const item of jobs) await log(scope.hostId, verified ? "anchor_verified" : "anchor_confirming", { ...details, txid: item.txid, confirmations: checked.evidence.confirmations, blockHeight: checked.evidence.blockHeight }, "info", item.id);
      return { state: verified ? "VERIFIED" as const : "CONFIRMING" as const };
    } catch (error) {
      const code = codeOf(error), ids = jobs.map(item => item.id);
      const awaitingConfirmations = code === "WALLET_AWAITING_CONFIRMATIONS";
      const wait = awaitingConfirmations ? 60_000 : delay(Math.max(...jobs.map(item => item.attempts)));
      if (error instanceof AutomationIntegrityError || code === "SIGNER_RESPONSE_MISMATCH" || code === "SIGNER_IRONWOOD_REQUIRED" || code === "TRANSACTION_EXPIRED") {
        await db.participateAutomationJob.updateMany({ where: { ...scope, id: { in: ids } }, data: { state: "NEEDS_REVIEW", lastErrorCode: code } });
        for (const item of jobs) await log(scope.hostId, "anchor_needs_review", {}, "error", item.id, code);
        return { state: "NEEDS_REVIEW" as const };
      }
      await db.participateAutomationJob.updateMany({ where: { ...scope, id: { in: ids } }, data: { attempts: awaitingConfirmations ? 0 : { increment: 1 }, lastErrorCode: code, nextAttemptAt: new Date(Date.now() + wait), ...(jobs[0].txid ? { state: "CONFIRMING" } : {}) } });
      for (const item of jobs) await log(scope.hostId, awaitingConfirmations ? "anchor_waiting_for_confirmations" : "anchor_retry_scheduled",
        { retryInSeconds: wait / 1000, txid: item.txid }, awaitingConfirmations ? "info" : "warn", item.id, code);
      return { state: "RETRY" as const };
    }
  }, { timeout: 1_800_000, maxWait: 5000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}
