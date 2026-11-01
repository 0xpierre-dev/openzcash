import { z } from "zod";
import { EmailAuthError, isDemoAccount, requireEmailOrigin } from "@/lib/auth/email-policy";
import { DEMO_PERSONAS } from "@/lib/auth/demo-persona";
import { safeAuthNext } from "@/lib/auth/redirect";
import { readSession, writeSessionCookie } from "@/lib/auth/session";
import { signInToDemo } from "@/lib/services/email-auth";
import { emailFailure, emailResponse, readEmailJson } from "@/lib/http/email-auth";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireEmailOrigin(request);
    const { next, persona } = z.object({ next: z.string().max(1024).optional(), persona: z.enum(DEMO_PERSONAS).default("participant") }).strict().parse(await readEmailJson(request));
    if (persona === "committee") throw new EmailAuthError("COMMITTEE_ADMIN_REQUIRED", 403);
    const session = await readSession();
    if (session && (session.subjectType !== "user" || !isDemoAccount(session.userId))) throw new EmailAuthError("DEMO_SIGN_OUT_REQUIRED", 409);
    await writeSessionCookie(await signInToDemo(persona));
    return emailResponse({ redirectTo: safeAuthNext(next, "/participate") });
  } catch (error) { return emailFailure(error); }
}
