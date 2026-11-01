import { EmailAuthError } from "@/lib/auth/email-policy";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME } from "@/lib/auth/guards";
import { PasskeyError, passkeyCookieName, recentPasskeyEmailCookieName, PASSKEY_TTL_SECONDS, RECENT_PASSKEY_EMAIL_TTL_SECONDS } from "@/lib/auth/passkey-policy";

export const passkeyManagementInput = z.object({
  code: z.string().regex(/^\d{6}$/).optional(),
  label: z.string().trim().min(1).max(60)
});
const encoded = z.string().min(1).max(60_000).regex(/^[A-Za-z0-9_-]+$/);
export const passkeyCredentialInput = z.object({
  id: encoded.max(2048), rawId: encoded.max(2048), type: z.literal("public-key"),
  response: z.object({ clientDataJSON: encoded }).passthrough(),
  clientExtensionResults: z.record(z.string(), z.unknown())
}).passthrough();
export const passkeyRegistrationInput = passkeyCredentialInput.extend({
  response: z.object({ clientDataJSON: encoded, attestationObject: encoded, transports: z.array(z.string().max(30)).max(10).optional() }).passthrough()
});
export const passkeyAuthenticationInput = passkeyCredentialInput.extend({
  response: z.object({ clientDataJSON: encoded, authenticatorData: encoded, signature: encoded, userHandle: encoded.max(256) }).passthrough()
});

export async function readPasskeyJson(request: Request): Promise<unknown> {
  const maxBytes = 64 * 1024;
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" || !request.body) {
    throw new PasskeyError("PASSKEY_INVALID");
  }
  if (Number(request.headers.get("content-length")) > maxBytes) throw new PasskeyError("PASSKEY_BODY_TOO_LARGE", 413);
  const reader = request.body.getReader();
  const bytes = new Uint8Array(maxBytes);
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (length + value.byteLength > maxBytes) {
        await reader.cancel();
        throw new PasskeyError("PASSKEY_BODY_TOO_LARGE", 413);
      }
      bytes.set(value, length); length += value.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes.subarray(0, length)));
  } catch (error) {
    if (error instanceof PasskeyError) throw error;
    throw new PasskeyError("PASSKEY_INVALID");
  } finally { reader.releaseLock(); }
}

export async function requirePasskeyAccount() {
  const session = await readSession();
  if (!session) throw new PasskeyError("unauthorized", 401);
  if (session.subjectType !== "user") throw new PasskeyError("PASSKEY_ACCOUNT_REQUIRED", 403);
  return session.userId;
}

export async function readPasskeyToken() {
  return (await cookies()).get(passkeyCookieName())?.value;
}

export async function readRecentPasskeyEmailProof() {
  const store = await cookies();
  return { token: store.get(recentPasskeyEmailCookieName())?.value, sessionToken: store.get(SESSION_COOKIE_NAME)?.value };
}

export async function writeRecentPasskeyEmailToken(token: string) {
  (await cookies()).set(recentPasskeyEmailCookieName(), token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/",
    maxAge: token ? RECENT_PASSKEY_EMAIL_TTL_SECONDS : 0
  });
}

export async function writePasskeyToken(token: string) {
  (await cookies()).set(passkeyCookieName(), token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/",
    maxAge: token ? PASSKEY_TTL_SECONDS : 0
  });
}

export function passkeyResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
}

export function passkeyFailure(error: unknown) {
  if ((error instanceof PasskeyError || error instanceof EmailAuthError)) return passkeyResponse({ error: error.code }, error.status);
  if (error instanceof z.ZodError) return passkeyResponse({ error: "PASSKEY_INVALID" }, 400);
  // No credential, password, challenge, key material or library diagnostics in responses/logs.
  return passkeyResponse({ error: "PASSKEY_UNAVAILABLE" }, 503);
}
