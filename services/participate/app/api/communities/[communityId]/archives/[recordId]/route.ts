import { NextResponse, type NextRequest } from "next/server";
import { readArchiveRevision } from "@/lib/services/proposal-archives";
import { decodeFile } from "@/lib/archive/format";
import { buildArchiveProof, selectArchiveAnchor } from "@/lib/archive/proof";
import type { ProposalRecord } from "@/lib/domain/proposal-record";
import { submissionDraftSchema, submissionPublishableSchema } from "@/lib/domain/proposal-submission";
import { abandonmentView } from "@/lib/services/proposal-lifecycle";
import { verifySourceProposal } from "@/lib/archive/source-proposals";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
export async function GET(request: NextRequest, context: { params: Promise<{ communityId: string; recordId: string }> }) {
  const revision = request.nextUrl.searchParams.get("revision");
  if (revision !== null && !/^(?:[1-9]\d{0,3}|10000)$/.test(revision)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers });
  try {
    const { communityId, recordId } = await context.params;
    const row = await readArchiveRevision(communityId, recordId, revision ? Number(revision) : undefined);
    if (!row) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers });
    const file = row.bundle.files.find(item => item.path === "proposal.md");
    const anchor = selectArchiveAnchor(row.anchors);
    const proof = buildArchiveProof(row, anchor);
    const applicationFile = row.manifest.kind === "NATIVE_PROPOSAL" ? row.bundle.files.find(item => item.path === "application.json") : null;
    const application = applicationFile ? submissionPublishableSchema.parse(submissionDraftSchema.strip().parse(JSON.parse(new TextDecoder().decode(decodeFile(applicationFile))))) : null;
    const sourceCapture = row.manifest.kind === "SOURCE_PROPOSAL" ? (await verifySourceProposal(row.bundle, row.manifestHash)).capture : null;
    // Do not serialize the database row, wallet configuration or raw check data.
    const record: ProposalRecord = {
      recordId: row.manifest.recordId, title: row.manifest.title, revision: row.revision, labels: row.archive.labels,
      originalDecisionDate: row.manifest.originalDecisionDate, capturedAt: row.manifest.capturedAt,
      kind: row.manifest.kind,
      abandonment: await abandonmentView(row.archive.abandonment),
      ...(application ? { application: { applicant: application.applicant, requestedAmountUsd: application.requestedAmountUsd } } : {}),
      ...(sourceCapture ? { sourceCapture } : {}),
      ...(row.manifest.kind !== "HISTORICAL_SUMMARY" ? { submittedAt: row.manifest.submittedAt } : {}),
      markdown: file ? new TextDecoder().decode(decodeFile(file)) : "", manifestHash: row.manifestHash,
      fileCount: row.manifest.files.length, network: anchor?.network ?? null,
      revisions: row.archive.revisions.map(item => ({ revision: item.revision, publishedAt: item.createdAt.toISOString() })),
      proof: { label: proof.label, detail: proof.detail, verified: proof.verified, evidence: proof.evidence, hasReceipt: Boolean(proof.receipt) }
    };
    return NextResponse.json({ record }, { headers });
  } catch { return NextResponse.json({ error: "ARCHIVE_UNAVAILABLE" }, { status: 503, headers }); }
}
