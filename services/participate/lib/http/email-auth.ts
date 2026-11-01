import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth/session";
import { EmailAuthError, emailCookieName, EMAIL_CODE_TTL_SECONDS } from "@/lib/auth/email-policy";

export async function readEmailJson(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" || !request.body) throw new EmailAuthError("EMAIL_INPUT_INVALID");
  const reader = request.body.getReader();
  const bytes = new Uint8Array(2048);
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (length + value.byteLength > bytes.length) { await reader.cancel(); throw new EmailAuthError("EMAIL_INPUT_INVALID", 413); }
      bytes.set(value, length); length += value.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes.subarray(0, length)));
  } catch (error) { if (error instanceof EmailAuthError) throw error; throw new EmailAuthError("EMAIL_INPUT_INVALID"); }
  finally { reader.releaseLock(); }
}
export async function readEmailToken(management = false) { return (await cookies()).get(emailCookieName(management))?.value; }
export async function writeEmailToken(token: string, management = false) {
  (await cookies()).set(emailCookieName(management), token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: token ? EMAIL_CODE_TTL_SECONDS : 0
  });
}
export async function requireEmailAccount() {
  const session = await readSession();
  if (!session || session.subjectType !== "user") throw new EmailAuthError("EMAIL_ACCOUNT_REQUIRED", 401);
  return session.userId;
}
export function emailResponse(body: unknown, status = 200, retryAfter = 60) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie", ...(status === 429 ? { "Retry-After": String(retryAfter) } : {}) } });
}
export function emailFailure(error: unknown) {
  if (error instanceof EmailAuthError) {
    const retryAfter = error.status === 429 ? Math.max(1, Math.ceil(error.retryAfter ?? 60)) : undefined;
    return emailResponse({ error: error.code, ...(retryAfter ? { retryAfter } : {}) }, error.status, retryAfter);
  }
  if (error instanceof z.ZodError) return emailResponse({ error: "EMAIL_INPUT_INVALID" }, 400);
  return emailResponse({ error: "EMAIL_UNAVAILABLE" }, 503);
}
