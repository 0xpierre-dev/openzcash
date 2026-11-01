import { z } from "zod";
import { requireEmailOrigin } from "@/lib/auth/email-policy";
import { emailInput, requestEmailCode } from "@/lib/services/email-auth";
import { emailFailure, emailResponse, readEmailJson, readEmailToken, writeEmailToken } from "@/lib/http/email-auth";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const origin = requireEmailOrigin(request);
    const { email } = z.object({ email: emailInput }).strict().parse(await readEmailJson(request));
    const { token, expiresIn, retryAfter } = await requestEmailCode({ email, origin, purpose: "SIGN_IN" }, await readEmailToken());
    await writeEmailToken(token);
    return emailResponse({ sent: true, expiresIn, retryAfter });
  } catch (error) { return emailFailure(error); }
}
