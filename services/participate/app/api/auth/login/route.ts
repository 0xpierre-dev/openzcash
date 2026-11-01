import { requireEmailOrigin } from "@/lib/auth/email-policy";
import { emailFailure, emailResponse } from "@/lib/http/email-auth";
// Legacy password endpoints intentionally cannot create sessions.
export async function POST(request: Request) {
  try {
    requireEmailOrigin(request);
    return emailResponse({ error: "PASSWORD_SIGN_IN_RETIRED", signInUrl: "/login" }, 410);
  } catch (error) { return emailFailure(error); }
}
