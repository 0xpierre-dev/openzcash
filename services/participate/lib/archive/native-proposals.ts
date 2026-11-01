import { ARCHIVE_SCHEMA, NATIVE_ARCHIVE_SCOPE, PUBLIC_NATIVE_ARCHIVE_SCOPE, canonicalJson, sha256, utf8, verifyArchivePackage, type ArchiveManifest } from "@/lib/archive/format";
import { parseProposalUsdCents, PROPOSAL_SETTLEMENT_RULE } from "@/lib/domain/proposal-funding";
import { submissionPublishableSchema, type SubmissionPayload } from "@/lib/domain/proposal-submission";

/** Only explicit public form fields enter the package; never account IDs or emails. */
export async function buildNativeProposalPackage(recordId: string, input: SubmissionPayload, submittedAt: string, mode: "production" | "demo" = "demo") {
  const payload = submissionPublishableSchema.parse(input);
  const files = [
    { path: "proposal.md", mediaType: "text/markdown" as const, text: payload.body },
    { path: "application.json", mediaType: "application/json" as const, text: canonicalJson({
      ...payload, requestedAmountUsdCents: parseProposalUsdCents(payload.requestedAmountUsd).toString(),
      settlementRule: PROPOSAL_SETTLEMENT_RULE, publication: mode === "production" ? "COMMUNITY_PUBLICATION" : "PILOT_DEMO", externalReview: "NOT_SUBMITTED", submittedAt
    }) }
  ];
  const manifest: ArchiveManifest = {
    schema: ARCHIVE_SCHEMA, recordId, revision: 1, previousManifestHash: null, kind: "NATIVE_PROPOSAL",
    originalDecisionDate: null, title: payload.title, submittedAt, capturedAt: submittedAt, scope: mode === "production" ? PUBLIC_NATIVE_ARCHIVE_SCOPE : NATIVE_ARCHIVE_SCOPE,
    sources: [payload.githubUrl, payload.forumUrl].filter(Boolean),
    files: await Promise.all(files.map(async file => ({ path: file.path, mediaType: file.mediaType, bytes: utf8(file.text).length, sha256: await sha256(utf8(file.text)) })))
  };
  const bundle = { schema: ARCHIVE_SCHEMA, manifest: canonicalJson(manifest), files: files.map(file => ({ path: file.path, encoding: "base64" as const, data: Buffer.from(file.text).toString("base64") })) };
  return verifyArchivePackage(bundle, await sha256(utf8(bundle.manifest)));
}
