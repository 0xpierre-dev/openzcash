import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { rejectIfUntrustedWriteOrigin } from "@/lib/http/write-origin";
import { createFundingQuote, readFundingQuotes, FundingQuoteError } from "@/lib/services/funding-quotes";

type Context = { params: Promise<{ communityId: string; pollId: string }> };
const headers = { "Cache-Control": "private, no-store" };

function failure(error: unknown) {
  if (error instanceof FundingQuoteError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status, headers });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "INVALID_QUOTE_INPUT" }, { status: 400, headers });
  return NextResponse.json({ error: "QUOTE_UNAVAILABLE", message: "The estimate is unavailable. Try again shortly." }, { status: 500, headers });
}

export async function GET(_request: Request, context: Context) {
  const session = await readSession();
  if (!session || session.subjectType !== "user") return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  try {
    const { communityId, pollId } = await context.params;
    return NextResponse.json(await readFundingQuotes(communityId, pollId, session.userId), { headers });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, context: Context) {
  const originError = rejectIfUntrustedWriteOrigin(request);
  if (originError) return originError;
  const session = await readSession();
  if (!session || session.subjectType !== "user") return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  try {
    const { communityId, pollId } = await context.params;
    const raw = await request.text();
    if (raw.length > 512) return NextResponse.json({ error: "INVALID_QUOTE_INPUT" }, { status: 400, headers });
    const result = await createFundingQuote(communityId, pollId, session.userId, JSON.parse(raw));
    return NextResponse.json(result, { status: result.replayed ? 200 : 201, headers });
  } catch (error) { return failure(error); }
}
