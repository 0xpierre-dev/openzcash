import { readSession } from "@/lib/auth/session";
import { privateCreditResponse, participationCreditResponseError } from "@/lib/http/participation-credit-response";
import { readAccountCredits, ParticipationCreditError } from "@/lib/services/participation-credits";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await readSession();
    if (!session) return privateCreditResponse({ error: "unauthorized" }, 401);
    if (session.subjectType !== "user") return privateCreditResponse({ error: "PARTICIPATION_ACCOUNT_REQUIRED" }, 403);
    const values = new URL(request.url).searchParams.getAll("communityId");
    if (values.length > 1) throw new ParticipationCreditError("Choose one community", 400, "INVALID_PARTICIPATION_INPUT");
    return privateCreditResponse({ credits: await readAccountCredits(session.userId, values[0]) });
  } catch (error) { return participationCreditResponseError(error); }
}
