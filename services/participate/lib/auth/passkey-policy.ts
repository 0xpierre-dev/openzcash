export class PasskeyError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}

export type PasskeyContext = { origin: string; rpId: string };
export const PASSKEY_TTL_SECONDS = 300;
export const RECENT_PASSKEY_EMAIL_TTL_SECONDS = 300;

// Pin production to an explicit origin. Never derive the RP from forwarded headers.
export function passkeyContext(request: Pick<Request, "url">): PasskeyContext {
  const configured = process.env.PASSKEY_ORIGIN ?? (process.env.NODE_ENV === "production" ? process.env.APP_BASE_URL : undefined);
  let url: URL;
  try { url = new URL(configured ?? request.url); }
  catch { throw new PasskeyError("PASSKEY_UNAVAILABLE", 503); }
  const local = url.hostname === "localhost";
  if ((!configured && !local) || url.username || url.password ||
      (url.protocol !== "https:" && !(local && process.env.NODE_ENV !== "production" && url.protocol === "http:")) ||
      (process.env.NODE_ENV === "production" && (!configured || local))) {
    throw new PasskeyError("PASSKEY_UNAVAILABLE", 503);
  }
  return { origin: url.origin, rpId: url.hostname };
}

export function requirePasskeyOrigin(request: Pick<Request, "url" | "headers">) {
  const context = passkeyContext(request);
  if (request.headers.get("origin") !== context.origin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new PasskeyError("forbidden_origin", 403);
  }
  return context;
}

export function passkeyCookieName() {
  return process.env.NODE_ENV === "production" ? "__Host-dao_passkey" : "dao_passkey";
}

export function recentPasskeyEmailCookieName() {
  return process.env.NODE_ENV === "production" ? "__Host-participate_passkey_email" : "participate_passkey_email";
}
