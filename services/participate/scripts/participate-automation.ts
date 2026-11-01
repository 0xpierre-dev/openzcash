import { stat } from "node:fs/promises";
import { db } from "../lib/db";
import { publicPilotScope } from "../lib/auth/public-pilot-policy";
import { runActivityAutomation } from "../lib/services/activity-automation";
import { runParticipateAutomation } from "../lib/services/participate-automation";
import { createAutomationTransport } from "../lib/archive/automation-transport";
import { loadParticipateAutomationConfig } from "./participate-automation-config";

async function main() {
  const command = process.argv[2] ?? "run";
  if (!["run", "status", "logs"].includes(command) || process.argv.length > 3) throw new Error("INVALID_COMMAND");
  const scope = publicPilotScope(); if (!scope) throw new Error("PILOT_SCOPE_REQUIRED");
  if (command === "status") {
    const state = await db.participateAutomationState.findUnique({ where: { hostId: scope.hostId }, select: { policyHash: true, startedAt: true, cursorAt: true, nextPollAt: true, lastRunAt: true, lastSuccessAt: true, lastErrorCode: true, failures: true } });
    const jobs = await db.participateAutomationJob.groupBy({ by: ["state"], where: { hostId: scope.hostId }, _count: true });
    const activityJobs = await db.activityAutomationJob.groupBy({ by: ["state"], where: { batch: { communityId: scope.hostId } }, _count: true });
    console.log(JSON.stringify({ state, jobs, activityJobs }, null, 2)); return;
  }
  if (command === "logs") {
    const rows = await db.participateAutomationLog.findMany({ where: { hostId: scope.hostId }, orderBy: { createdAt: "desc" }, take: 100, select: { createdAt: true, level: true, event: true, code: true, jobId: true, details: true } });
    for (const row of rows.reverse()) console.log(JSON.stringify(row)); return;
  }
  const { operator: config, automation } = await loadParticipateAutomationConfig();
  if ((await stat(config.sshKeyPath)).mode & 0o077) throw new Error("PRIVATE_KEY_PERMISSIONS_REQUIRED");
  const result = await runParticipateAutomation(automation, createAutomationTransport(config.sshHost, config.sshKeyPath));
  const activity = await runActivityAutomation(automation, createAutomationTransport(config.sshHost, config.sshKeyPath));
  console.log(JSON.stringify({ time: new Date().toISOString(), event: "worker_cycle", activity, ...result }));
  if (result.state === "NEEDS_REVIEW" || activity.state === "NEEDS_REVIEW") process.exitCode = 1;
}
main().catch(() => { console.error(JSON.stringify({ time: new Date().toISOString(), level: "error", event: "worker_stopped", code: "AUTOMATION_CONFIGURATION_OR_DATABASE_UNAVAILABLE" })); process.exitCode = 1; }).finally(() => db.$disconnect());
