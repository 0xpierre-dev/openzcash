import { db } from "../lib/db";
import { readPilotPackages } from "../lib/archive/catalog";
import { publishArchiveRevision } from "../lib/services/proposal-archives";
import { isParticipationCreditSandbox } from "../lib/services/participation-credits";

// Local fixture only. Provision a committee independently of DAO leadership;
// preserve every existing balance, journal, reaction and immutable revision.
async function main() {
  if (!isParticipationCreditSandbox()) throw new Error("Dedicated local preview required");
  const host = await db.community.findFirstOrThrow({ where: { id: "preview_orchard", kind: "DAO" }, select: { id: true } });
  const owner = await db.user.findFirstOrThrow({ where: { nick: "maya.preview", status: "ACTIVE" }, select: { id: true } });
  const before = await db.creditOperation.aggregate({ _count: true, _sum: { delta: true } });
  const committee = await db.community.upsert({
    where: { id: "preview_zcg_committee" },
    create: { id: "preview_zcg_committee", name: "ZCG", slug: "zcg-committee", kind: "COMMITTEE", createdById: owner.id,
      participationMode: "CREDITS", commentCost: 1, reactionCost: 1,
      memberships: { create: { userId: owner.id, role: "OWNER" } } },
    update: {}
  });
  if (committee.kind !== "COMMITTEE") throw new Error("Unexpected preview scope");
  for (const item of await readPilotPackages()) await publishArchiveRevision(host.id, item.bundle, item.manifestHash, committee.id);
  const after = await db.creditOperation.aggregate({ _count: true, _sum: { delta: true } });
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Unexpected journal change");
  console.log("Five ZCG records assigned to the committee. Revision files and credit journals preserved. No credits issued.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Committee setup failed"); process.exitCode = 1; }).finally(() => db.$disconnect());
