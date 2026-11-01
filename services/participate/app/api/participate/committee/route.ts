import { readCommitteePreviewToken } from "@/lib/auth/committee-admin-cookie";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { readSession } from "@/lib/auth/session";
import { requireEmailOrigin } from "@/lib/auth/email-policy";
import { passkeyContext } from "@/lib/auth/passkey-policy";
import { passkeyResponse, readPasskeyJson, requirePasskeyAccount, passkeyFailure } from "@/lib/http/passkeys";
import { CommitteeError } from "@/lib/services/committee-access";
import { mutateCommittee, readCommitteeWorkspace } from "@/lib/services/committee";
import { committeeAction } from "@/lib/domain/committee";
import { joinDemoCommittee, scopeDemoWorkspace } from "@/lib/demo/seats";

export const dynamic = "force-dynamic";
function host() { const id = process.env.PARTICIPATE_COMMUNITY_ID; if (!id) throw new CommitteeError("COMMITTEE_UNAVAILABLE", 503); return id; }
function failure(error: unknown) {
  if (error instanceof CommitteeError) return passkeyResponse({ error: error.code }, error.status);
  if (error instanceof z.ZodError) return passkeyResponse({ error: "COMMITTEE_INVALID_INPUT" }, 400);
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) return passkeyResponse({ error: "COMMITTEE_REFRESH_REQUIRED" }, 409);
  return passkeyFailure(error);
}
export async function GET(request: Request) {
  try {
    const session = await readSession();
    let context = null;
    try { context = passkeyContext(request); } catch { /* Readiness cannot be assumed on an unsupported origin. */ }
    const raw = new URL(request.url).searchParams.get("before");
    const before = raw ? z.coerce.number().int().positive().parse(raw) : undefined;
    const userId = session?.subjectType === "user" ? session.userId : undefined;
    // Demo deployments only: seat the tester and scope the view to their demo committee. No-op elsewhere.
    await joinDemoCommittee(host(), userId, context);
    return passkeyResponse(await scopeDemoWorkspace(await readCommitteeWorkspace(host(), userId, context, before, await readCommitteePreviewToken()), host(), userId));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    requireEmailOrigin(request);
    const userId = await requirePasskeyAccount();
    return passkeyResponse(await mutateCommittee(host(), userId, committeeAction.parse(await readPasskeyJson(request))));
  } catch (error) { return failure(error); }
}
