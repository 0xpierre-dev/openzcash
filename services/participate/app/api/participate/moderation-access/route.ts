import { z } from "zod";
import { readSession } from "@/lib/auth/session";
import { requireEmailOrigin } from "@/lib/auth/email-policy";
import { CommitteeAdminError, unlockPilotModeration, verifyPilotModeration } from "@/lib/auth/committee-admin";
import { clearPilotModerationToken, readPilotModerationToken, writePilotModerationToken } from "@/lib/auth/pilot-moderation-cookie";
import { publicPilotScope } from "@/lib/auth/public-pilot-policy";
import { emailFailure, emailResponse, readEmailJson } from "@/lib/http/email-auth";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const session = await readSession(), scope = publicPilotScope();
    const active = Boolean(scope && session?.subjectType === "user" && await verifyPilotModeration(session.userId, scope.hostId, scope.committeeId, await readPilotModerationToken()));
    return emailResponse({ active });
  } catch (error) { return emailFailure(error); }
}
export async function POST(request: Request) {
  try {
    requireEmailOrigin(request);
    const session = await readSession();
    if (session?.subjectType !== "user" || session.role !== "ADMIN") throw new CommitteeAdminError("ADMIN_ACCESS_DENIED");
    await writePilotModerationToken(await unlockPilotModeration(session.userId, await readEmailJson(request)));
    return emailResponse({ ok: true });
  } catch (error) {
    if (error instanceof CommitteeAdminError) {
      const response = emailResponse({ error: error.code }, error.status);
      if (error.status === 429) response.headers.set("Retry-After", "900");
      return response;
    }
    if (error instanceof z.ZodError) return emailResponse({ error: "ADMIN_INVALID_INPUT" }, 400);
    return emailFailure(error);
  }
}
export async function DELETE(request: Request) {
  try { requireEmailOrigin(request); await clearPilotModerationToken(); return emailResponse({ ok: true }); }
  catch (error) { return emailFailure(error); }
}
