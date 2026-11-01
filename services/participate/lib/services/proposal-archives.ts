import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { canonicalJson, verifyArchivePackage, type ArchivePackage } from "@/lib/archive/format";
import { verifySourceProposal, sourceObservationOutcome } from "@/lib/archive/source-proposals";
import { recordProposalArrival } from "./discussion-notifications";
import { abandonmentInclude } from "./proposal-lifecycle";

/** Operator import only. There is no untrusted/public import route. */
export async function publishArchiveRevision(communityId: string, input: ArchivePackage, expectedHash: string, committeeId?: string) {
  const checked = await verifyArchivePackage(input, expectedHash);
  const { manifest } = checked;
  // A first import of a decision/history is not a new application to review.
  const source = manifest.kind === "SOURCE_PROPOSAL" && manifest.revision === 1
    ? (await verifySourceProposal(input, expectedHash)).capture : null;
  const notifyArrival = source && sourceObservationOutcome(source.source.state, source.proposal.labels) === "under_review";
  return db.$transaction(async tx => {
    await tx.community.findUniqueOrThrow({ where: { id: communityId }, select: { id: true } });
    if (committeeId) await tx.community.findFirstOrThrow({ where: { id: committeeId, kind: "COMMITTEE" }, select: { id: true } });
    const archive = await tx.proposalArchive.upsert({ where: { communityId_recordId: { communityId, recordId: manifest.recordId } },
      create: { communityId, committeeId, recordId: manifest.recordId, title: manifest.title }, update: committeeId ? { committeeId } : {} });
    const previous = await tx.archiveRevision.findFirst({ where: { archiveId: archive.id }, orderBy: { revision: "desc" } });
    const exists = await tx.archiveRevision.findUnique({ where: { archiveId_revision: { archiveId: archive.id, revision: manifest.revision } } });
    if (exists) {
      if (exists.manifestHash !== expectedHash || exists.packageJson !== canonicalJson(input)) throw new Error("An immutable revision already exists with different content");
      return exists;
    }
    if (manifest.revision !== (previous?.revision ?? 0) + 1 || manifest.previousManifestHash !== (previous?.manifestHash ?? null)) throw new Error("Revision history does not match");
    const revision = await tx.archiveRevision.create({ data: { archiveId: archive.id, revision: manifest.revision, manifestHash: expectedHash, packageJson: canonicalJson(input) } });
    if (!previous && notifyArrival) await recordProposalArrival(tx, archive);
    return revision;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function readArchiveRevision(communityId: string, recordId: string, revision?: number) {
  const row = await db.archiveRevision.findFirst({ where: { revision, archive: { communityId, recordId } }, orderBy: { revision: "desc" }, include: {
    archive: { select: { id: true, title: true, communityId: true, recordId: true, labels: true,
      abandonment: { include: abandonmentInclude },
      revisions: { orderBy: { revision: "desc" }, select: { revision: true, manifestHash: true, createdAt: true } } } },
    anchors: { orderBy: { createdAt: "desc" }, include: { checks: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 } } }
  } });
  if (!row) return null;
  const verified = await verifyArchivePackage(JSON.parse(row.packageJson), row.manifestHash);
  return { ...row, ...verified };
}
