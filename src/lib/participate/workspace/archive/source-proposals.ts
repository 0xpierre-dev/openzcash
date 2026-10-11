import { z } from "zod/v3";
import { ARCHIVE_SCHEMA, SOURCE_ARCHIVE_SCOPE, canonicalJson, sha256, utf8, decodeFile, verifyArchivePackage, type ArchiveManifest } from "./format";
import { ZCG_REVIEW_SOURCE, zcgReviewProposalSchema } from "@/lib/participate/workspace/domain/zcg-review";
import { classifyZcgSectors, zcgSourceMetadataSchema } from "@/lib/participate/workspace/domain/zcg-source-metadata";

const sourceSchema = zcgSourceMetadataSchema.innerType().shape.proposals.element;
const issueSchema = z.object({
  number: z.number().int().positive(), html_url: z.string().url(), title: z.string().min(1).max(300),
  body: z.string().min(1).max(500_000), state: z.literal("open"), created_at: z.string().datetime(), updated_at: z.string().datetime(),
  user: z.object({ login: z.string().min(1).max(100) }), pull_request: z.never().optional(),
  labels: z.array(z.object({ name: z.string().min(1).max(100), color: z.string().regex(/^[a-fA-F0-9]{6}$/), description: z.string().max(1000).nullable() })).max(100)
});
export const sourceCaptureSchema = z.object({
  schema: z.literal("PARTICIPATE_SOURCE_CAPTURE_V1"), checkedAt: z.string().datetime(),
  proposal: zcgReviewProposalSchema, source: sourceSchema
}).strict().superRefine((value, ctx) => {
  const { proposal, source } = value;
  if (proposal.id !== source.recordId || proposal.issueNumber !== source.issueNumber || proposal.proposalUrl !== source.url || proposal.title !== source.title || proposal.sourceUpdatedAt !== source.updatedAt || proposal.state !== source.state || canonicalJson(proposal.labels) !== canonicalJson(source.labels.map(label => label.name))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Source capture identity mismatch" });
  }
});
export type SourceCapture = z.infer<typeof sourceCaptureSchema>;

/** Preserve the exact body. A conservative intake only accepts officially pending applications. */
export async function buildSourceProposal(input: unknown, issueNumber: number, capturedAt: string, revision = 1, previousManifestHash: string | null = null) {
  const issue = issueSchema.parse(input);
  if (issue.number !== issueNumber || issue.html_url !== `${ZCG_REVIEW_SOURCE}/${issueNumber}` || new Date(issue.updated_at) > new Date(capturedAt) || new Date(issue.created_at) > new Date(issue.updated_at)) throw new Error("Source identity or timestamp mismatch");
  const category = issue.body.match(/^###\s+Proposal Category\s*\r?\n\s*\r?\n([^\r\n]+)/im)?.[1]?.trim() || null;
  // Never guess money from prose. Source Markdown retains the full submitted budget.
  const source = sourceSchema.parse({ recordId: `zcg-github-${issue.number}`, issueNumber: issue.number, url: issue.html_url, title: issue.title, state: issue.state,
    updatedAt: issue.updated_at, category, labels: issue.labels.map(label => ({ ...label, color: label.color.toLowerCase(), description: label.description ?? "" })) });
  const proposal = zcgReviewProposalSchema.parse({ id: source.recordId, issueNumber: issue.number, title: issue.title, applicant: issue.user.login, outcome: "under_review", state: issue.state,
    submittedAt: issue.created_at, sourceUpdatedAt: issue.updated_at, requestedUsd: null, tags: classifyZcgSectors(issue.title, category, []), labels: source.labels.map(label => label.name), proposalUrl: issue.html_url });
  const capture = sourceCaptureSchema.parse({ schema: "PARTICIPATE_SOURCE_CAPTURE_V1", checkedAt: capturedAt, proposal, source });
  const inputs = [{ path: "proposal.md", mediaType: "text/markdown" as const, text: issue.body }, { path: "source.json", mediaType: "application/json" as const, text: canonicalJson(capture) }];
  const files = await Promise.all(inputs.map(async file => ({ path: file.path, mediaType: file.mediaType, bytes: utf8(file.text).length, sha256: await sha256(utf8(file.text)) })));
  const manifest: ArchiveManifest = { schema: ARCHIVE_SCHEMA, recordId: proposal.id, revision, previousManifestHash, title: proposal.title, capturedAt, kind: "SOURCE_PROPOSAL", originalDecisionDate: null, submittedAt: proposal.submittedAt, scope: SOURCE_ARCHIVE_SCOPE, sources: [proposal.proposalUrl], files };
  const bundle = { schema: ARCHIVE_SCHEMA, manifest: canonicalJson(manifest), files: inputs.map(file => ({ path: file.path, encoding: "base64" as const, data: Buffer.from(file.text).toString("base64") })) };
  return verifySourceProposal(bundle, await sha256(utf8(bundle.manifest)));
}

export async function verifySourceProposal(input: unknown, expectedHash: string) {
  const checked = await verifyArchivePackage(input, expectedHash);
  if (checked.manifest.kind !== "SOURCE_PROPOSAL") throw new Error("Not a complete source proposal");
  const source = checked.bundle.files.find(file => file.path === "source.json"), markdown = checked.bundle.files.find(file => file.path === "proposal.md");
  if (!source || !markdown || checked.bundle.files.length !== 2) throw new Error("Missing source capture files");
  const capture = sourceCaptureSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decodeFile(source))));
  if (capture.proposal.id !== checked.manifest.recordId || capture.proposal.title !== checked.manifest.title || capture.proposal.submittedAt !== checked.manifest.submittedAt || capture.checkedAt !== checked.manifest.capturedAt || checked.manifest.sources.length !== 1 || checked.manifest.sources[0] !== capture.proposal.proposalUrl) throw new Error("Source does not match the preserved manifest");
  return { ...checked, capture };
}
