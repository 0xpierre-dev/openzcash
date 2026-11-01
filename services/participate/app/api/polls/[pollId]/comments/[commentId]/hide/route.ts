import { NextResponse, type NextRequest } from "next/server";
import { readSession } from "@/lib/auth/session";
import { rejectIfUntrustedWriteOrigin } from "@/lib/http/write-origin";
import { hideProposalComment, ProposalDiscussionError } from "@/lib/services/proposal-discussion";

export async function POST(request: NextRequest, context: { params: Promise<{ pollId: string; commentId: string }> }) {
  const originError = rejectIfUntrustedWriteOrigin(request);
  if (originError) return originError;
  const session = await readSession();
  const headers = { "Cache-Control": "private, no-store" };
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  try {
    const { pollId, commentId } = await context.params;
    const comment = await hideProposalComment(pollId, commentId, session, await request.json());
    return NextResponse.json({ comment }, { headers });
  } catch (error) {
    if (error instanceof ProposalDiscussionError) return NextResponse.json({ error: error.code }, { status: error.status, headers });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "INVALID_MODERATION_INPUT" }, { status: 400, headers });
    return NextResponse.json({ error: "COMMENT_MODERATION_FAILED" }, { status: 500, headers });
  }
}
