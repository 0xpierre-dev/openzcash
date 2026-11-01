import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { publicPilotScope } from "@/lib/auth/public-pilot-policy";
import { participateAutomationPolicyHash, validateAutomationReaders, type AutomationConfig } from "./participate-automation";

type MigrationResult = { state: "READY" | "MIGRATED" | "ALREADY_MIGRATED" | "BLOCKED"; code?: string; previousPolicyHash: string; policyHash: string; legacyJobs?: number };

/** Operator-only cutover. No wallet access, signing, cursor reset or record rewriting. */
export async function migrateParticipateAutomationToIronwood(config: AutomationConfig, expectedPolicyHash: string, apply = false): Promise<MigrationResult> {
  const scope = publicPilotScope();
  if (!scope || config.chain.network !== "mainnet" || config.chain.pool !== "ironwood" || !Number.isFinite(config.startedAt.getTime())
      || config.startedAt > new Date() || !/^[a-f0-9]{64}$/.test(expectedPolicyHash)) throw new Error("AUTOMATION_MIGRATION_CONFIGURATION_INVALID");
  validateAutomationReaders(config);
  const policyHash = participateAutomationPolicyHash(scope, config);
  const base = { previousPolicyHash: expectedPolicyHash, policyHash };
  const result = await db.$transaction(async (tx): Promise<MigrationResult> => {
    const [row] = await tx.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtextextended(${`participate-automation:${scope.hostId}`}, 0)) AS acquired`;
    const blocked = async (code: string): Promise<MigrationResult> => {
      if (apply) await tx.participateAutomationLog.create({ data: { hostId: scope.hostId, level: "error", event: "automation_policy_migration_blocked", code, details: base } });
      return { state: "BLOCKED", code, ...base };
    };
    if (!row.acquired) return blocked("AUTOMATION_WORKER_BUSY");
    const current = await tx.participateAutomationState.findUnique({ where: { hostId: scope.hostId } });
    if (!current || current.committeeId !== scope.committeeId || current.startedAt.getTime() !== config.startedAt.getTime()) return blocked("AUTOMATION_CHECKPOINT_MISMATCH");
    if (current.policyHash === policyHash) {
      const previous = await tx.participateAutomationLog.findFirst({ where: { hostId: scope.hostId, event: "automation_policy_migrated",
        AND: [...(expectedPolicyHash === policyHash ? [] : [{ details: { path: ["previousPolicyHash"], equals: expectedPolicyHash } }]), { details: { path: ["policyHash"], equals: policyHash } }] }, select: { id: true } });
      return previous ? { state: "ALREADY_MIGRATED", ...base } : blocked("AUTOMATION_MIGRATION_NOT_RECORDED");
    }
    if (current.policyHash !== expectedPolicyHash || expectedPolicyHash === policyHash) return blocked("AUTOMATION_POLICY_HASH_MISMATCH");
    const jobs = await tx.participateAutomationJob.findMany({ where: { hostId: scope.hostId }, select: {
      state: true, committeeId: true, txid: true, anchorId: true, revisionId: true, lastErrorCode: true
    } });
    // In-flight or ambiguous signing intents must be reconciled with the old
    // journal. A recorded txid may only be checked through its pinned old reader.
    if (jobs.some(job => !job.txid || !job.anchorId || !job.revisionId || job.committeeId !== scope.committeeId
      || !["CONFIRMING", "VERIFIED"].includes(job.state) && !(job.state === "NEEDS_REVIEW" && job.lastErrorCode === "TRANSACTION_EXPIRED")))
      return blocked("AUTOMATION_UNRESOLVED_SIGNING_INTENTS");
    if (jobs.length && !config.legacyChain) return blocked("AUTOMATION_LEGACY_READER_REQUIRED");
    const anchors = await tx.archiveAnchor.findMany({ where: { id: { in: jobs.map(job => job.anchorId!) } }, select: {
      id: true, revisionId: true, network: true, receiver: true, state: true, txids: true, operationId: true, commitment: true
    } });
    for (const job of jobs) {
      const anchor = anchors.find(value => value.id === job.anchorId);
      if (!anchor || anchor.revisionId !== job.revisionId || anchor.network !== "mainnet" || anchor.receiver !== config.legacyChain?.receiver || !anchor.commitment
        || !(anchor.state === "PREPARED" && !anchor.operationId && !anchor.txids.length
          || anchor.state === "BROADCAST" && anchor.txids.length === 1 && anchor.txids[0] === job.txid)) return blocked("AUTOMATION_LEGACY_ANCHOR_MISMATCH");
    }
    // The old checkpoint pins more than its destination: preserve the exact
    // public key, derivation index and confirmation policy for legacy recovery.
    if (config.legacyChain && participateAutomationPolicyHash(scope, { startedAt: config.startedAt, chain: config.legacyChain }) !== current.policyHash)
      return blocked("AUTOMATION_LEGACY_POLICY_MISMATCH");
    if (!apply) return { state: "READY", ...base, legacyJobs: jobs.length };
    const changed = await tx.participateAutomationState.updateMany({ where: { hostId: scope.hostId, policyHash: expectedPolicyHash }, data: { policyHash } });
    if (changed.count !== 1) throw new Error("AUTOMATION_POLICY_CHANGED_DURING_MIGRATION");
    await tx.participateAutomationLog.create({ data: { hostId: scope.hostId, level: "info", event: "automation_policy_migrated", details: {
      ...base, pool: "ironwood", legacyJobs: jobs.length, startedAt: current.startedAt.toISOString(), cursorAt: current.cursorAt.toISOString()
    } } });
    return { state: "MIGRATED", ...base, legacyJobs: jobs.length };
  }, { timeout: 30_000, maxWait: 5000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  if (apply) console.log(JSON.stringify({ time: new Date().toISOString(), event: "automation_policy_migration", hostId: scope.hostId, ...result }));
  return result;
}
