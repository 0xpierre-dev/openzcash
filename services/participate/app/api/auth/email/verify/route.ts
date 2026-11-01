import { z } from "zod";
import { requireEmailOrigin } from "@/lib/auth/email-policy";
import { safeAuthNext } from "@/lib/auth/redirect";
import { writeSessionCookie } from "@/lib/auth/session";
import { emailCodeInput, finishEmailSignIn } from "@/lib/services/email-auth";
import { emailFailure, emailResponse, readEmailJson, readEmailToken, writeEmailToken } from "@/lib/http/email-auth";
import { passkeyContext } from "@/lib/auth/passkey-policy";
import { issueRecentPasskeyEmail } from "@/lib/services/passkey-enrollment";
import { writeRecentPasskeyEmailToken } from "@/lib/http/passkeys";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const origin = requireEmailOrigin(request);
    const input = z.object({ code: emailCodeInput, next: z.string().max(1024).optional() }).strict().parse(await readEmailJson(request));
    const session = await finishEmailSignIn({ token: await readEmailToken(), code: input.code }, origin);
    await writeEmailToken("");
    const sessionToken = await writeSessionCookie(session);
    let offerPasskeySetup = false;
    // Optional setup must not turn a successful email sign-in into an error.
    try {
      const context = passkeyContext(request);
      const grant = context.origin === origin ? await issueRecentPasskeyEmail(session.userId, context, sessionToken) : null;
      await writeRecentPasskeyEmailToken(grant?.token ?? "");
      offerPasskeySetup = Boolean(grant);
    } catch {
      await writeRecentPasskeyEmailToken("");
      console.warn("Passkey setup offer unavailable after email sign-in");
    }
    return emailResponse({ redirectTo: safeAuthNext(input.next, "/participate"), offerPasskeySetup });
  } catch (error) { return emailFailure(error); }
}
