import { db } from "@/lib/db";
import { publicPilotScope } from "@/lib/auth/public-pilot-policy";
import { verifySourceProposal } from "@/lib/archive/source-proposals";
import { verifyArchivePackage } from "@/lib/archive/format";
import { officialSourceIssue } from "@/lib/archive/source-identity";
import { captureDiscussionClosure } from "./discussion-closure";
import { publishArchiveRevision } from "./proposal-archives";

/** Trusted operator import only: this is intentionally not a public HTTP endpoint. */
export async function importSourceProposal(input: unknown, manifestHash: string) {
  const scope = publicPilotScope();
  if (!scope) throw new Error("A configured public pilot scope is required");
  const checked = await verifySourceProposal(input, manifestHash);
  if (officialSourceIssue(checked.manifest) !== checked.capture.source.issueNumber) throw new Error("Unrecognized official archive identity");
  await db.community.findFirstOrThrow({ where: { id: scope.hostId, kind: "DAO" }, select: { id: true } });
  await db.community.findFirstOrThrow({ where: { id: scope.committeeId, kind: "COMMITTEE" }, select: { id: true } });
  // Older historical records use editorial IDs. Do not import the same application a second time under its issue ID.
  const existing = await db.proposalArchive.findMany({ where: { communityId: scope.hostId }, select: { recordId: true, committeeId: true, revisions: { orderBy: { revision: "desc" }, take: 1, select: { packageJson: true, manifestHash: true } } } });
  for (const record of existing) {
    if (record.committeeId !== scope.committeeId) throw new Error("Mixed committee scopes require operator review");
    const revision = record.revisions[0];
    if (!revision) continue;
    const previous = await verifyArchivePackage(JSON.parse(revision.packageJson), revision.manifestHash);
    if (record.recordId === checked.manifest.recordId && (previous.manifest.kind === "NATIVE_PROPOSAL" || officialSourceIssue(previous.manifest) !== checked.capture.source.issueNumber)) throw new Error("Source predecessor identity mismatch");
    // A public pilot author may link an official issue from a native demo.
    // That link is context, not an imported official source identity.
    if (previous.manifest.kind !== "NATIVE_PROPOSAL" && record.recordId !== checked.manifest.recordId && previous.manifest.sources.includes(checked.capture.source.url)) throw new Error("This source already exists under another archive ID");
  }
  const revision = await publishArchiveRevision(scope.hostId, checked.bundle, manifestHash, scope.committeeId);
  await captureDiscussionClosure(revision.id);
  return revision;
}
