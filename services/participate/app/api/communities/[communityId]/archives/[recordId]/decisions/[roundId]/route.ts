import { z } from "zod";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { requirePasskeyOrigin } from "@/lib/auth/passkey-policy";
import { passkeyAuthenticationInput, passkeyResponse, readPasskeyJson, requirePasskeyAccount } from "@/lib/http/passkeys";
import { decisionFailure, decisionId, type DecisionRouteContext } from "@/lib/decisions/http";
import { decisionChoice, decisionRationale, decisionHash } from "@/lib/decisions/format";
import { canonicalJson } from "@/lib/archive/format";
import { beginDecisionSignature, finishDecisionSignature, readPublishedDecisionReceipt } from "@/lib/services/signed-decisions";

export const dynamic = "force-dynamic";
const credential = passkeyAuthenticationInput.extend({ response: passkeyAuthenticationInput.shape.response.extend({ userHandle: z.string().max(256).regex(/^[A-Za-z0-9_-]+$/).nullable().optional() }) });
const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare"), choice: decisionChoice, rationale: decisionRationale.optional() }).strict(),
  z.object({ action: z.literal("sign"), ceremonyId: decisionId, credential }).strict()
]);
export async function POST(request: Request, ctx: DecisionRouteContext) {
  try {
    const context = requirePasskeyOrigin(request), userId = await requirePasskeyAccount();
    const { communityId, recordId, roundId } = await ctx.params;
    decisionId.parse(roundId);
    const input = action.parse(await readPasskeyJson(request));
    return passkeyResponse(input.action === "prepare"
      ? await beginDecisionSignature(communityId, recordId, roundId, userId, { choice: input.choice, ...(input.rationale !== undefined ? { rationale: input.rationale } : {}) }, context)
      : await finishDecisionSignature(communityId, recordId, roundId, userId, input.ceremonyId, input.credential as AuthenticationResponseJSON, context));
  } catch (error) { return decisionFailure(error); }
}
export async function GET(_request: Request, ctx: DecisionRouteContext) {
  try {
    const { communityId, recordId, roundId } = await ctx.params;
    decisionId.parse(roundId);
    const receipt = await readPublishedDecisionReceipt(communityId, recordId, roundId);
    return new Response(canonicalJson(receipt), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="decision-${roundId}.json"`,
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Receipt-SHA256": await decisionHash(receipt) } });
  } catch (error) { return decisionFailure(error); }
}
