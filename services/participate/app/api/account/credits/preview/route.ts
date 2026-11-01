import { readSession } from "@/lib/auth/session";
import { previewCreditInputSchema } from "@/lib/domain/participation-credits";
import { privateCreditResponse, participationCreditResponseError, readParticipationJson } from "@/lib/http/participation-credit-response";
import { rejectIfUntrustedWriteOrigin } from "@/lib/http/write-origin";
import { claimPreviewCredits, readAccountCredits, ParticipationCreditError } from "@/lib/services/participation-credits";

export async function POST(request: Request) {
  const origin = rejectIfUntrustedWriteOrigin(request);
  if (origin) return privateCreditResponse({ error: "forbidden_origin" }, 403);
  try {
    const session = await readSession();
    if (!session) return privateCreditResponse({ error: "unauthorized" }, 401);
    if (session.subjectType !== "user") return privateCreditResponse({ error: "PARTICIPATION_ACCOUNT_REQUIRED" }, 403);
    const parsed = previewCreditInputSchema.safeParse(await readParticipationJson(request));
    if (!parsed.success) throw new ParticipationCreditError("Choose a community for preview credits", 400, "INVALID_PARTICIPATION_INPUT");
    const result = await claimPreviewCredits(session.userId, parsed.data.communityId);
    return privateCreditResponse({ credits: await readAccountCredits(session.userId), replayed: result.replayed }, result.replayed ? 200 : 201);
  } catch (error) { return participationCreditResponseError(error); }
}
