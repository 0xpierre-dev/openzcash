import { NextResponse, type NextRequest } from "next/server";
import { readSession } from "@/lib/auth/session";
import { rejectIfUntrustedWriteOrigin } from "@/lib/http/write-origin";
import { createCommunityProposal, ProposalDiscussionError } from "@/lib/services/proposal-discussion";

export async function POST(request: NextRequest, context: { params: Promise<{ communityId: string }> }) {
  const originError = rejectIfUntrustedWriteOrigin(request);
  if (originError) return originError;
  const headers = { "Cache-Control": "private, no-store" };
  const session = await readSession();
  if (!session || session.subjectType !== "user") return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  try {
    const { communityId } = await context.params;
    const proposal = await createCommunityProposal(communityId, session.userId, await request.json());
    return NextResponse.json({ proposal }, { status: 201, headers });
  } catch (error) {
    if (error instanceof ProposalDiscussionError) return NextResponse.json({ error: error.code }, { status: error.status, headers });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "INVALID_PROPOSAL_INPUT" }, { status: 400, headers });
    return NextResponse.json({ error: "PROPOSAL_CREATE_FAILED" }, { status: 500, headers });
  }
}
