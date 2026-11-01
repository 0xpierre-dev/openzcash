import { z } from "zod";
import { readSession } from "@/lib/auth/session";
import { requireEmailOrigin } from "@/lib/auth/email-policy";
import { CommitteeAdminError, unlockCommitteePreview } from "@/lib/auth/committee-admin";
import { clearCommitteePreviewToken, writeCommitteePreviewToken } from "@/lib/auth/committee-admin-cookie";
import { emailFailure, emailResponse, readEmailJson } from "@/lib/http/email-auth";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    requireEmailOrigin(request);
    const session = await readSession();
    if (session?.subjectType !== "user" || session.role !== "ADMIN") throw new CommitteeAdminError("ADMIN_ACCESS_DENIED");
    const hostId = process.env.PARTICIPATE_COMMUNITY_ID;
    if (!hostId) throw new CommitteeAdminError("ADMIN_ACCESS_UNAVAILABLE", 503);
    await writeCommitteePreviewToken(await unlockCommitteePreview(session.userId, hostId, await readEmailJson(request)));
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
  try { requireEmailOrigin(request); await clearCommitteePreviewToken(); return emailResponse({ ok: true }); }
  catch (error) { return emailFailure(error); }
}
