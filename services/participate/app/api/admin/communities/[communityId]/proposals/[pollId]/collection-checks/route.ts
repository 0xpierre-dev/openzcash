import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { rejectIfUntrustedWriteOrigin } from "@/lib/http/write-origin";
import { CollectionCheckError, readCollectionChecks, runCollectionCheck } from "@/lib/services/poll-collection-checks";

type Context = { params: Promise<{ communityId: string; pollId: string }> };
const headers = { "Cache-Control": "private, no-store" };
function failure(error: unknown) {
  if (error instanceof CollectionCheckError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status, headers });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "INVALID_CHECK_INPUT", message: "Invalid check request" }, { status: 400, headers });
  return NextResponse.json({ error: "CHECK_UNAVAILABLE", message: "The check is unavailable. Try again shortly." }, { status: 500, headers });
}
export async function GET(_request: Request, context: Context) {
  const session = await readSession();
  if (!session || session.subjectType !== "user") return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  try {
    const { communityId, pollId } = await context.params;
    return NextResponse.json(await readCollectionChecks(communityId, pollId, session.userId), { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  const originError = rejectIfUntrustedWriteOrigin(request);
  if (originError) return originError;
  const session = await readSession();
  if (!session || session.subjectType !== "user") return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  try {
    if (Number(request.headers.get("content-length")) > 128) return NextResponse.json({ error: "INVALID_CHECK_INPUT" }, { status: 400, headers });
    const raw = await request.text();
    if (raw.length > 128) return NextResponse.json({ error: "INVALID_CHECK_INPUT" }, { status: 400, headers });
    const { communityId, pollId } = await context.params;
    const result = await runCollectionCheck(communityId, pollId, session.userId, JSON.parse(raw));
    return NextResponse.json(result, { status: result.replayed ? 200 : 201, headers });
  } catch (error) { return failure(error); }
}
