import { ParticipationCreditError } from "@/lib/services/participation-credits";
import { NextResponse, type NextRequest } from "next/server";
import { readSession } from "@/lib/auth/session";
import { readPilotModerationToken } from "@/lib/auth/pilot-moderation-cookie";
import { rejectIfUntrustedWriteOrigin } from "@/lib/http/write-origin";
import { ArchiveDiscussionError, readArchiveCommentHistory, mutateArchiveDiscussion, readArchiveDiscussion, readProposalParticipationBoard, setArchiveProposalLike } from "@/lib/services/archive-discussion";

export type ArchiveDiscussionRoute = { params: Promise<{ communityId: string; recordId: string; commentId?: string }> };
const headers = { "Cache-Control": "private, no-store" };
async function readInput(request: NextRequest) {
  const tooLarge = () => new ArchiveDiscussionError("INVALID_COMMENT_INPUT", 413);
  if (Number(request.headers.get("content-length")) > 20000) throw tooLarge();
  if (!request.body) throw new SyntaxError("Missing body");
  const reader = request.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 20000) throw tooLarge();
      chunks.push(chunk.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { void reader.cancel().catch(() => undefined); }
}
function failure(error: unknown) {
  if ((error instanceof ArchiveDiscussionError || error instanceof ParticipationCreditError)) return NextResponse.json({ error: error.code }, { status: error.status, headers });
  return NextResponse.json({ error: error instanceof SyntaxError ? "INVALID_COMMENT_INPUT" : "DISCUSSION_REQUEST_FAILED" }, { status: error instanceof SyntaxError ? 400 : 500, headers });
}
export async function getArchiveDiscussion(_request: NextRequest, context: ArchiveDiscussionRoute) {
  try {
    const { communityId, recordId } = await context.params;
    return NextResponse.json(await readArchiveDiscussion(communityId, recordId, await readSession(), await readPilotModerationToken(), false), { headers });
  } catch (error) { return failure(error); }
}
export function archiveDiscussionWrite(action: "post" | "hide" | "reaction" | "edit" | "withdraw") {
  return async (request: NextRequest, context: ArchiveDiscussionRoute) => {
    const originError = rejectIfUntrustedWriteOrigin(request); if (originError) return originError;
    const session = await readSession(); if (!session || session.subjectType !== "user") return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
    try {
      const input = await readInput(request);
      const { communityId, recordId, commentId } = await context.params;
      const result = await mutateArchiveDiscussion(communityId, recordId, session, action, input, commentId, action === "hide" ? await readPilotModerationToken() : undefined, true);
      return NextResponse.json(result, { status: action === "post" ? 201 : 200, headers });
    } catch (error) { return failure(error); }
  };
}

export async function getProposalParticipation(_request: NextRequest, context: { params: Promise<{ communityId: string }> }) {
  try {
    const { communityId } = await context.params;
    const board = await readProposalParticipationBoard(communityId, await readSession());
    if (!board.proposals.length) return NextResponse.json({ error: "PROPOSAL_NOT_FOUND" }, { status: 404, headers });
    return NextResponse.json({ board }, { headers });
  } catch (error) { return failure(error); }
}
export async function postArchiveLike(request: NextRequest, context: ArchiveDiscussionRoute) {
  const originError = rejectIfUntrustedWriteOrigin(request); if (originError) return originError;
  const session = await readSession();
  if (!session || session.subjectType !== "user") return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  try {
    const { communityId, recordId } = await context.params;
    return NextResponse.json(await setArchiveProposalLike(communityId, recordId, session, await readInput(request)), { headers });
  } catch (error) { return failure(error); }
}

export async function getArchiveCommentHistory(_request: NextRequest, context: ArchiveDiscussionRoute) {
  try {
    const { communityId, recordId, commentId } = await context.params;
    if (!commentId) throw new ArchiveDiscussionError("COMMENT_NOT_FOUND", 404);
    return NextResponse.json(await readArchiveCommentHistory(communityId, recordId, commentId), { headers });
  } catch (error) { return failure(error); }
}
