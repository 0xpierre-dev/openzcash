import { NextResponse, type NextRequest } from "next/server";
import { readSession } from "@/lib/auth/session";
import { rejectIfUntrustedWriteOrigin } from "@/lib/http/write-origin";
import { postProposalComment, readProposalDiscussion, ProposalDiscussionError } from "@/lib/services/proposal-discussion";
import { ParticipationCreditError } from "@/lib/services/participation-credits";

type Context = { params: Promise<{ pollId: string }> };
const headers = { "Cache-Control": "private, no-store" };

function failure(error: unknown) {
  if (error instanceof ProposalDiscussionError || error instanceof ParticipationCreditError) return NextResponse.json({ error: error.code }, { status: error.status, headers });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "INVALID_COMMENT_INPUT" }, { status: 400, headers });
  return NextResponse.json({ error: "DISCUSSION_REQUEST_FAILED" }, { status: 500, headers });
}

export async function GET(_request: NextRequest, context: Context) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  try {
    const { pollId } = await context.params;
    return NextResponse.json(await readProposalDiscussion(pollId, session), { headers });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest, context: Context) {
  const originError = rejectIfUntrustedWriteOrigin(request);
  if (originError) return originError;
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  try {
    const { pollId } = await context.params;
    const comment = await postProposalComment(pollId, session, await request.json());
    return NextResponse.json({ comment }, { status: 201, headers });
  } catch (error) { return failure(error); }
}
