import { NextResponse, type NextRequest } from "next/server";
import { readArchiveRevision } from "@/lib/services/proposal-archives";
import { archiveVerificationInstructions, buildArchiveProof, selectArchiveAnchor } from "@/lib/archive/proof";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
type DownloadContext = { params: Promise<{ communityId: string; recordId: string; revision: string }> };
export async function GET(request: NextRequest, context: DownloadContext) {
  try { return await downloadRevision(request, context); }
  catch { return NextResponse.json({ error: "ARCHIVE_DOWNLOAD_UNAVAILABLE" }, { status: 503, headers }); }
}
async function downloadRevision(request: NextRequest, context: DownloadContext) {
  const { communityId, recordId, revision } = await context.params;
  if (!/^(?:[1-9]\d{0,3}|10000)$/.test(revision)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers });
  const requestedFile = request.nextUrl.searchParams.get("file");
  if (requestedFile && !["proposal.md", "source.json", "verification.json", "VERIFY.md"].includes(requestedFile)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers });
  const row = await readArchiveRevision(communityId, recordId, Number(revision));
  if (!row) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers });
  const filename = `${row.manifest.recordId}-r${revision}`;
  const anchor = selectArchiveAnchor(row.anchors);
  if (requestedFile === "verification.json") {
    const { receipt } = buildArchiveProof(row, anchor);
    if (!receipt) return NextResponse.json({ error: "CHAIN_RECEIPT_UNAVAILABLE" }, { status: 409, headers });
    return new Response(JSON.stringify(receipt, null, 2) + "\n", { headers: { ...headers, "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${filename}-verification.json"` } });
  }
  if (requestedFile === "VERIFY.md") {
    return new Response(archiveVerificationInstructions(row, anchor), { headers: { ...headers, "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}-VERIFY.md"` } });
  }
  if (requestedFile === "proposal.md" || requestedFile === "source.json") {
    const file = row.bundle.files.find(file => file.path === requestedFile);
    if (!file) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers });
    const isSource = requestedFile === "source.json";
    return new Response(Buffer.from(file.data, "base64"), { headers: { ...headers, "Content-Type": isSource ? "application/json" : "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}${isSource ? "-source.json" : ".md"}"` } });
  }
  return new Response(row.packageJson, { headers: { ...headers, "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${filename}.zvoice.json"` } });
}
