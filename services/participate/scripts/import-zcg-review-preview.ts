import { db } from "../lib/db";
import { readReviewPackages } from "../lib/archive/review-proposals";
import { isParticipationCreditSandbox } from "../lib/services/participation-credits";
import { publishArchiveRevision } from "../lib/services/proposal-archives";

// Additive, local publication only. Replays verify the same immutable revision.
async function main() {
  if (!isParticipationCreditSandbox()) throw new Error("Dedicated local preview required");
  const host = await db.community.findFirstOrThrow({ where: { id: "preview_orchard", kind: "DAO" }, select: { id: true } });
  const committee = await db.community.findFirstOrThrow({ where: { id: "preview_zcg_committee", kind: "COMMITTEE" }, select: { id: true } });
  const packages = await readReviewPackages();
  for (const item of packages) await publishArchiveRevision(host.id, item.bundle, item.manifestHash, committee.id);
  console.log(`${packages.length} review snapshots imported. No credits, ballots or chain transactions created.`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Review import failed"); process.exitCode = 1; }).finally(() => db.$disconnect());
