import { db } from "../lib/db";
import { DEMO_USER_IDS } from "../lib/auth/demo-persona";
import { isParticipationCreditSandbox } from "../lib/services/participation-credits";

async function main() {
  if (!isParticipationCreditSandbox()) throw new Error("Dedicated local preview required");
  const user = await db.user.upsert({
    where: { id: DEMO_USER_IDS.participant },
    create: { id: DEMO_USER_IDS.participant, nick: "participant.preview", displayName: "Participant", passwordHash: "", role: "USER" },
    update: {}
  });
  if (user.status !== "ACTIVE" || user.role !== "USER" || await db.communityMembership.findFirst({ where: { userId: user.id, status: "ACTIVE" } })) {
    throw new Error("Participant fixture must be active and have no management or committee memberships");
  }
  console.log("Participant demo ready. No memberships, credits, credentials or blockchain transactions created.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Preview setup failed"); process.exitCode = 1; }).finally(() => db.$disconnect());
