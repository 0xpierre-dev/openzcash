import { clearCommitteePreviewToken } from "@/lib/auth/committee-admin-cookie";
import { clearPilotModerationToken } from "@/lib/auth/pilot-moderation-cookie";
import { NextResponse, type NextRequest } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";
import { safeAuthNext } from "@/lib/auth/redirect";
import { buildRequestUrl } from "@/lib/http/request-url";
import { rejectIfUntrustedWriteOrigin } from "@/lib/http/write-origin";

export async function POST(request: NextRequest) {
  const untrustedOrigin = rejectIfUntrustedWriteOrigin(request);

  if (untrustedOrigin) {
    return untrustedOrigin;
  }

  await clearSessionCookie();
  await clearCommitteePreviewToken();
  await clearPilotModerationToken();

  const contentType = request.headers.get("content-type") ?? "";
  let requestedNext: unknown;
  if (contentType.includes("application/json")) {
    const body: unknown = await request.json().catch(() => null);
    requestedNext = body && typeof body === "object" && "next" in body ? body.next : undefined;
  } else {
    const body = await request.formData().catch(() => null);
    requestedNext = body?.get("next");
  }

  const next = safeAuthNext(requestedNext);
  if (request.headers.get("accept")?.includes("application/json")) {
    return NextResponse.json({ redirectTo: next }, { headers: { "Cache-Control": "private, no-store" } });
  }
  return NextResponse.redirect(buildRequestUrl(request, next), 303);
}
