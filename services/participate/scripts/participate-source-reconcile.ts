import { Prisma } from "@prisma/client";
import { db } from "../lib/db";
import { publicPilotScope } from "../lib/auth/public-pilot-policy";
import { SourceDiscoveryError } from "../lib/archive/source-discovery";
import { ArchiveChainError } from "../lib/archive/chain";
import { participateAutomationPolicyHash, validateAutomationReaders } from "../lib/services/participate-automation";
import { captureSelectedOfficialProposals, reconcileOfficialSourceRevisions } from "../lib/services/participate-source-revisions";
import { loadParticipateAutomationConfig } from "./participate-automation-config";

/** Private operator command. --intake recovers missed applications; the normal worker imports/signs. */
async function main() {
  const intake = process.argv[2] === "--intake";
  const args = process.argv.slice(intake ? 3 : 2);
  if (!args.length || args.length > 10 || args.some(value => !/^[1-9]\d*$/.test(value))) throw new Error("SOURCE_RECONCILIATION_TARGETS_INVALID");
  const issueNumbers = args.map(Number);
  if (issueNumbers.some(value => !Number.isSafeInteger(value)) || new Set(issueNumbers).size !== issueNumbers.length) throw new Error("SOURCE_RECONCILIATION_TARGETS_INVALID");
  const scope = publicPilotScope();
  if (!scope) throw new Error("PILOT_SCOPE_REQUIRED");
  const { automation } = await loadParticipateAutomationConfig();
  if (automation.chain.network !== "mainnet" || automation.chain.pool !== "ironwood") throw new Error("AUTOMATION_IRONWOOD_REQUIRED");
  validateAutomationReaders(automation);
  const policyHash = participateAutomationPolicyHash(scope, automation);
  const log = async (hostId: string, event: string, details: Record<string, string | number | boolean | null> = {}, level = "info", jobId?: string, code?: string) => {
    await db.participateAutomationLog.create({ data: { hostId, event, details, level, jobId, code } });
    console.log(JSON.stringify({ time: new Date().toISOString(), event, level, ...details, ...(code ? { code } : {}) }));
  };
  const result = await db.$transaction(async lock => {
    const [row] = await lock.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtextextended(${`participate-automation:${scope.hostId}`}, 0)) AS acquired`;
    if (!row.acquired) return { state: "BUSY" as const };
    const state = await db.participateAutomationState.findUnique({ where: { hostId: scope.hostId } });
    if (!state || state.committeeId !== scope.committeeId || state.policyHash !== policyHash) throw new Error("AUTOMATION_POLICY_CHANGED");
    const capture = intake ? captureSelectedOfficialProposals : reconcileOfficialSourceRevisions;
    const captured = await capture(scope, issueNumbers, log, fetch, automation.githubToken);
    return { state: intake ? "CAPTURED" as const : "RECONCILED" as const, ...captured };
  }, { timeout: 900_000, maxWait: 5000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  console.log(JSON.stringify({ time: new Date().toISOString(), event: intake ? "source_intake_operator_result" : "source_reconciliation_operator_result", ...result }));
  if (result.state === "BUSY") process.exitCode = 2;
}

main().catch(error => {
  const known = new Set(["SOURCE_RECONCILIATION_TARGETS_INVALID", "PILOT_SCOPE_REQUIRED", "AUTOMATION_IRONWOOD_REQUIRED", "AUTOMATION_POLICY_CHANGED"]);
  const code = error instanceof SourceDiscoveryError || error instanceof ArchiveChainError ? error.code
    : error instanceof Error && known.has(error.message) ? error.message : "SOURCE_RECONCILIATION_UNAVAILABLE";
  console.error(JSON.stringify({ time: new Date().toISOString(), level: "error", event: "source_reconciliation_operator_stopped", code }));
  process.exitCode = 1;
}).finally(() => db.$disconnect());
