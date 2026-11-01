import { NextResponse, type NextRequest } from "next/server";
import { readSession } from "@/lib/auth/session";
import { rejectIfUntrustedWriteOrigin } from "@/lib/http/write-origin";
import { ProposalDiscussionError, setProposalCommentReaction } from "@/lib/services/proposal-discussion";
import { ParticipationCreditError } from "@/lib/services/participation-credits";

const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: NextRequest, context: { params: Promise<{ pollId: string; commentId: string }> }) {
  const originError = rejectIfUntrustedWriteOrigin(request);
  if (originError) return originError;
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  try {
    const { pollId, commentId } = await context.params;
    const comment = await setProposalCommentReaction(pollId, commentId, session, await request.json());
    return NextResponse.json({ comment }, { headers });
  } catch (error) {
    if (error instanceof ProposalDiscussionError || error instanceof ParticipationCreditError) {
      return NextResponse.json({ error: error.code }, { status: error.status, headers });
    }
    if (error instanceof SyntaxError) return NextResponse.json({ error: "INVALID_REACTION_INPUT" }, { status: 400, headers });
    return NextResponse.json({ error: "REACTION_REQUEST_FAILED" }, { status: 500, headers });
  }
}
