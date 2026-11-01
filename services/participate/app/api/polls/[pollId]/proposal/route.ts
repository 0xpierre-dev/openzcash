import { NextResponse, type NextRequest } from "next/server";
import { readSession } from "@/lib/auth/session";
import { readProposalDetail, ProposalDiscussionError } from "@/lib/services/proposal-discussion";

export async function GET(_request: NextRequest, context: { params: Promise<{ pollId: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  try {
    const { pollId } = await context.params;
    return NextResponse.json({ proposal: await readProposalDetail(pollId, session) }, { headers });
  } catch (error) {
    if (error instanceof ProposalDiscussionError) return NextResponse.json({ error: error.code }, { status: error.status, headers });
    return NextResponse.json({ error: "PROPOSAL_REQUEST_FAILED" }, { status: 500, headers });
  }
}
