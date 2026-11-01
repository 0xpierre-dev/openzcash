import { ZCG_REVIEW_PROPOSALS, ZCG_REVIEW_CHECKED_AT } from "@/lib/data/zcg-review-proposals";
import type { ZcgReviewProposal } from "@/lib/domain/zcg-review";
import { ARCHIVE_SCHEMA, REVIEW_ARCHIVE_SCOPE, canonicalJson, sha256, utf8, verifyArchivePackage, type ArchiveManifest } from "@/lib/archive/format";

export async function buildReviewPackage(proposal: ZcgReviewProposal, capturedAt: string) {
  const requested = proposal.requestedUsd === null ? "Not specified" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(proposal.requestedUsd) + " USD";
  const markdown = `# ${proposal.title}\n\nZCG application · Under review at capture\n\n- Submitted: ${proposal.submittedAt.slice(0, 10)}\n- Applicant: @${proposal.applicant}\n- Requested: ${requested}\n- Source checked: ${capturedAt}\n\n## Review status\n\nThe official application was open and labeled Ready For ZCG Review, without a decision, completed milestone or payment label. No committee decision or individual votes are asserted in this snapshot.\n\n## Original application\n\n[Read the full application on GitHub](${proposal.proposalUrl}) for its scope, milestones, budget and latest discussion. This snapshot preserves public application metadata, not the full application or attachments.\n\nLocal comments and likes are separate from the committee review and do not count as votes.\n`;
  const inputs = [
    { path: "proposal.md", mediaType: "text/markdown" as const, text: markdown },
    { path: "record.json", mediaType: "application/json" as const, text: canonicalJson({ ...proposal, sourceCheckedAt: capturedAt }) }
  ];
  const files = await Promise.all(inputs.map(async file => ({ path: file.path, mediaType: file.mediaType, bytes: utf8(file.text).length, sha256: await sha256(utf8(file.text)) })));
  const manifest: ArchiveManifest = { schema: ARCHIVE_SCHEMA, recordId: proposal.id, revision: 1, previousManifestHash: null,
    kind: "REVIEW_SNAPSHOT", originalDecisionDate: null, submittedAt: proposal.submittedAt, capturedAt, title: proposal.title,
    sources: [proposal.proposalUrl], scope: REVIEW_ARCHIVE_SCOPE, files };
  const bundle = { schema: ARCHIVE_SCHEMA, manifest: canonicalJson(manifest), files: inputs.map(file => ({ path: file.path, encoding: "base64" as const, data: Buffer.from(file.text).toString("base64") })) };
  return verifyArchivePackage(bundle, await sha256(utf8(bundle.manifest)));
}

export async function readReviewPackages() {
  return Promise.all(ZCG_REVIEW_PROPOSALS.map(proposal => buildReviewPackage(proposal, ZCG_REVIEW_CHECKED_AT)));
}
