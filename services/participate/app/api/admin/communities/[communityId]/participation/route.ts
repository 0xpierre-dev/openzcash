import { readSession } from "@/lib/auth/session";
import { privateCreditResponse, participationCreditResponseError, readParticipationJson } from "@/lib/http/participation-credit-response";
import { rejectIfUntrustedWriteOrigin } from "@/lib/http/write-origin";
import { readParticipationPolicy, updateParticipationPolicy } from "@/lib/services/participation-credits";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ communityId: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const session = await readSession();
    if (!session) return privateCreditResponse({ error: "unauthorized" }, 401);
    if (session.subjectType !== "user") return privateCreditResponse({ error: "PARTICIPATION_ACCOUNT_REQUIRED" }, 403);
    const { communityId } = await context.params;
    return privateCreditResponse({ policy: await readParticipationPolicy(communityId, session.userId) });
  } catch (error) { return participationCreditResponseError(error); }
}

export async function PATCH(request: Request, context: Context) {
  const origin = rejectIfUntrustedWriteOrigin(request);
  if (origin) return privateCreditResponse({ error: "forbidden_origin" }, 403);
  try {
    const session = await readSession();
    if (!session) return privateCreditResponse({ error: "unauthorized" }, 401);
    if (session.subjectType !== "user") return privateCreditResponse({ error: "PARTICIPATION_ACCOUNT_REQUIRED" }, 403);
    const { communityId } = await context.params;
    return privateCreditResponse({ policy: await updateParticipationPolicy(communityId, session.userId, await readParticipationJson(request)) });
  } catch (error) { return participationCreditResponseError(error); }
}
