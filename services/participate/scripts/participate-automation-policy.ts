import { db } from "../lib/db";
import { publicPilotScope } from "../lib/auth/public-pilot-policy";
import { migrateParticipateAutomationToIronwood } from "../lib/services/participate-automation-policy";
import { loadParticipateAutomationConfig } from "./participate-automation-config";

async function main() {
  const command = process.argv[2] ?? "plan", expectedHash = process.argv[3];
  if (!(command === "plan" && process.argv.length <= 3 || command === "apply" && process.argv.length === 4 && /^[a-f0-9]{64}$/.test(expectedHash ?? ""))) throw new Error("INVALID_COMMAND");
  const scope = publicPilotScope(); if (!scope) throw new Error("PILOT_SCOPE_REQUIRED");
  const { automation } = await loadParticipateAutomationConfig();
  const state = await db.participateAutomationState.findUniqueOrThrow({ where: { hostId: scope.hostId }, select: { policyHash: true } });
  const result = await migrateParticipateAutomationToIronwood(automation, expectedHash ?? state.policyHash, command === "apply");
  console.log(JSON.stringify({ time: new Date().toISOString(), event: "automation_policy_plan", ...result }));
  if (result.state === "BLOCKED") process.exitCode = 1;
}
main().catch(() => { console.error(JSON.stringify({ time: new Date().toISOString(), level: "error", event: "automation_policy_migration_stopped", code: "AUTOMATION_MIGRATION_CONFIGURATION_OR_DATABASE_UNAVAILABLE" })); process.exitCode = 1; }).finally(() => db.$disconnect());
