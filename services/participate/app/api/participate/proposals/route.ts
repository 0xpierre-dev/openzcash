import { NextResponse, type NextRequest } from "next/server";
import { readSession } from "@/lib/auth/session";
import { rejectIfUntrustedWriteOrigin } from "@/lib/http/write-origin";
import { ProposalSubmissionError, listOwnSubmissions, saveProposalSubmission, publishProposalSubmission, deleteProposalDraft, abandonProposalSubmission } from "@/lib/services/proposal-submissions";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function input(request: NextRequest) {
  const tooLarge = () => new ProposalSubmissionError("PROPOSAL_TOO_LARGE", 413);
  if (Number(request.headers.get("content-length")) > 180000) throw tooLarge();
  if (!request.body) throw new SyntaxError("Missing body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength; if (size > 180000) throw tooLarge();
      chunks.push(part.value);
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } finally { void reader.cancel().catch(() => undefined); }
}
async function handle(request: NextRequest, action: "list" | "save" | "publish" | "delete" | "abandon") {
  if (action !== "list") { const rejected = rejectIfUntrustedWriteOrigin(request); if (rejected) return rejected; }
  try {
    const session = await readSession();
    if (!session || session.subjectType !== "user") return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
    const host = process.env.PARTICIPATE_COMMUNITY_ID;
    if (!host) return NextResponse.json({ error: "PUBLICATION_UNAVAILABLE" }, { status: 503, headers });
    if (action === "list") return NextResponse.json({ drafts: await listOwnSubmissions(host, session.userId) }, { headers });
    const data = await input(request);
    if (action === "save") return NextResponse.json({ draft: await saveProposalSubmission(host, session.userId, data) }, { headers });
    if (action === "delete") return NextResponse.json(await deleteProposalDraft(host, session.userId, data), { headers });
    if (action === "abandon") return NextResponse.json(await abandonProposalSubmission(host, session.userId, data), { headers });
    return NextResponse.json(await publishProposalSubmission(host, session.userId, data), { headers });
  } catch (error) {
    if (error instanceof ProposalSubmissionError) return NextResponse.json({ error: error.code }, { status: error.status, headers });
    const invalid = error instanceof SyntaxError || error instanceof TypeError;
    if (!invalid) console.error(`[participate] Proposal ${action} failed; transaction was not acknowledged`);
    return NextResponse.json({ error: invalid ? "INVALID_PROPOSAL_INPUT" : "SUBMISSION_REQUEST_FAILED" }, { status: invalid ? 400 : 500, headers });
  }
}
export const GET = (request: NextRequest) => handle(request, "list");
export const PUT = (request: NextRequest) => handle(request, "save");
export const POST = (request: NextRequest) => handle(request, "publish");
export const DELETE = (request: NextRequest) => handle(request, "delete");
export const PATCH = (request: NextRequest) => handle(request, "abandon");
