import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { z } from "zod";
import { requirePasskeyOrigin } from "@/lib/auth/passkey-policy";
import { safeAuthNext } from "@/lib/auth/redirect";
import { writeSessionCookie } from "@/lib/auth/session";
import { finishPasskeyAuthentication } from "@/lib/services/passkeys";
import { passkeyAuthenticationInput, passkeyFailure, passkeyResponse, readPasskeyJson, readPasskeyToken, writePasskeyToken } from "@/lib/http/passkeys";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const context = requirePasskeyOrigin(request);
    const body = z.object({ credential: passkeyAuthenticationInput, next: z.string().max(2048).optional() }).parse(await readPasskeyJson(request));
    const token = await readPasskeyToken();
    await writePasskeyToken("");
    const session = await finishPasskeyAuthentication(token, body.credential as AuthenticationResponseJSON, context);
    await writeSessionCookie(session);
    return passkeyResponse({ redirectTo: safeAuthNext(body.next) });
  } catch (error) { return passkeyFailure(error); }
}
