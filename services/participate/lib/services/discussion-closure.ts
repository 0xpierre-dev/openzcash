import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { canonicalJson, sha256, utf8, verifyArchivePackage } from "@/lib/archive/format";
import { verifySourceProposal } from "@/lib/archive/source-proposals";
import { officialSourceIssue } from "@/lib/archive/source-identity";
import { appendArchiveActivity, initializeArchiveActivity } from "./archive-activity";
import type { ActivityAction } from "@/lib/archive/activity";

/** Trusted source observation. The snapshot time is NOW, never backdated to a GitHub verdict. */
export async function captureDiscussionClosure(revisionId: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await db.$transaction(async tx => {
      const revision = await tx.archiveRevision.findUniqueOrThrow({ where: { id: revisionId }, include: { archive: true } });
      const existing = await tx.archiveDiscussionClosure.findUnique({ where: { revisionId } });
      if (existing) return existing;
      const checked = await verifyArchivePackage(JSON.parse(revision.packageJson), revision.manifestHash);
      if (checked.manifest.kind !== "SOURCE_PROPOSAL" || officialSourceIssue(checked.manifest) === null) return null;
      const { capture } = await verifySourceProposal(checked.bundle, revision.manifestHash);
      const outcome = capture.proposal.outcome;
      if (!["approved", "rejected", "abandoned", "closed"].includes(outcome)) return null;
      // Serialize the cutoff with every append to this proposal's event chain.
      await tx.$queryRaw`SELECT "id" FROM "ProposalArchive" WHERE "id" = ${revision.archiveId} FOR UPDATE`;
      const latest = await tx.archiveRevision.findFirstOrThrow({ where: { archiveId: revision.archiveId }, orderBy: { revision: "desc" } });
      if (latest.id !== revisionId) return null;
      const priorClosure = await tx.archiveDiscussionClosure.findFirst({ where: { archiveId: revision.archiveId }, orderBy: { createdAt: "desc" } });
      if (priorClosure) {
        const predecessor = await tx.archiveRevision.findFirst({ where: { archiveId: revision.archiveId, revision: revision.revision - 1 } });
        if (predecessor) {
          const prior = await verifyArchivePackage(JSON.parse(predecessor.packageJson), predecessor.manifestHash);
          if (prior.manifest.kind === "SOURCE_PROPOSAL" && (await verifySourceProposal(prior.bundle, predecessor.manifestHash)).capture.proposal.outcome === outcome) return null;
        }
      }
      await initializeArchiveActivity(tx, revision.archive);
      const [head, comments, proposalLikes] = await Promise.all([
        tx.archiveActivityEvent.findFirst({ where: { archiveId: revision.archiveId }, orderBy: { sequence: "desc" } }),
        tx.archiveComment.findMany({ where: { archiveId: revision.archiveId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { versions: { orderBy: { version: "asc" } }, reactions: { where: { liked: true }, select: { version: true } } } }),
        tx.archiveProposalLike.count({ where: { archiveId: revision.archiveId, liked: true } })
      ]);
      const closedAt = new Date(), status = outcome.toUpperCase() as Extract<ActivityAction, { kind: "DISCUSSION_CLOSED" }>["status"];
      const snapshotJson = canonicalJson({ schema: "PARTICIPATE_DISCUSSION_CLOSURE_V1", communityId: revision.archive.communityId, recordId: revision.archive.recordId,
        proposalManifestHash: revision.manifestHash, proposalRevision: revision.revision, status, sourceUrl: capture.source.url,
        sourceUpdatedAt: capture.source.updatedAt, closedAt: closedAt.toISOString(), throughSequence: head?.sequence ?? 0, throughEventHash: head?.eventHash ?? null,
        proposalLikes, comments: comments.map(comment => ({ id: comment.id, parentId: comment.parentId, currentVersion: comment.currentVersion,
          state: comment.hiddenAt ? "HIDDEN" : comment.withdrawnAt ? "WITHDRAWN" : "VISIBLE",
          versions: comment.versions.map(version => ({ version: version.version, bodyHash: version.bodyHash, previousBodyHash: version.previousBodyHash,
            createdAt: version.createdAt.toISOString(), likes: comment.reactions.filter(reaction => reaction.version === version.version).length })) })) });
      const snapshotHash = await sha256(utf8(snapshotJson));
      const closure = await tx.archiveDiscussionClosure.create({ data: { archiveId: revision.archiveId, revisionId, snapshotHash, snapshotJson, createdAt: closedAt } });
      await appendArchiveActivity(tx, revision.archive, null, `closure:${revisionId}`, { kind: "DISCUSSION_CLOSED", authority: "OFFICIAL_SOURCE", snapshotHash, status, sourceUpdatedAt: capture.source.updatedAt }, closedAt);
      return closure;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code) && attempt < 3) continue;
      throw error;
    }
  }
}
