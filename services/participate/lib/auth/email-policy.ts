export class EmailAuthError extends Error {
  constructor(public code: string, public status = 400, public retryAfter?: number) { super(code); }
}
export const EMAIL_CODE_TTL_SECONDS = 600;
export const EMAIL_CODE_COOLDOWN_SECONDS = 60;
export type EmailPurpose = "SIGN_IN" | "PASSKEY_ADD" | "PASSKEY_REMOVE";
export const isDemoAccount = (id: string) => id.startsWith("preview_");

export function requireEmailOrigin(request: Pick<Request, "url" | "headers">) {
  let url: URL;
  try { url = new URL(process.env.APP_BASE_URL || request.url); }
  catch { throw new EmailAuthError("EMAIL_UNAVAILABLE", 503); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || (process.env.NODE_ENV === "production" && (!process.env.APP_BASE_URL || local)) ||
      (url.protocol !== "https:" && !(local && process.env.NODE_ENV !== "production" && url.protocol === "http:"))) {
    throw new EmailAuthError("EMAIL_UNAVAILABLE", 503);
  }
  // Accept the local preview alias only in development; never trust proxy headers.
  if (local && process.env.NODE_ENV !== "production") {
    const incoming = new URL(request.url);
    if (["localhost", "127.0.0.1", "[::1]"].includes(incoming.hostname) && incoming.port === url.port) url = incoming;
  }
  if (request.headers.get("origin") !== url.origin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new EmailAuthError("forbidden_origin", 403);
  }
  return url.origin;
}

export function emailCookieName(management = false) {
  return `${process.env.NODE_ENV === "production" ? "__Host-" : ""}participate_email_${management ? "manage" : "login"}`;
}
