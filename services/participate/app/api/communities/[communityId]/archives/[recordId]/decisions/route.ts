import { z } from "zod";
import { readSession } from "@/lib/auth/session";
import { passkeyContext, requirePasskeyOrigin } from "@/lib/auth/passkey-policy";
import { passkeyResponse, readPasskeyJson, requirePasskeyAccount } from "@/lib/http/passkeys";
import { decisionFailure } from "@/lib/decisions/http";
import { createDecisionRound, readSignedDecisions } from "@/lib/services/signed-decisions";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ communityId: string; recordId: string }> };
export async function GET(request: Request, ctx: Context) {
  try {
    const { communityId, recordId } = await ctx.params;
    const revision = z.coerce.number().int().positive().max(10000).parse(new URL(request.url).searchParams.get("revision"));
    const session = await readSession();
    let context = null;
    try { context = passkeyContext(request); } catch { /* Public receipts remain readable on other preview hosts. */ }
    return passkeyResponse(await readSignedDecisions(communityId, recordId, revision, session?.subjectType === "user" ? session.userId : undefined, context));
  } catch (error) { return decisionFailure(error); }
}
export async function POST(request: Request, ctx: Context) {
  try {
    const context = requirePasskeyOrigin(request), userId = await requirePasskeyAccount();
    const { communityId, recordId } = await ctx.params;
    return passkeyResponse(await createDecisionRound(communityId, recordId, userId, await readPasskeyJson(request), context), 201);
  } catch (error) { return decisionFailure(error); }
}
