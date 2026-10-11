/** Return an application path without allowing URL normalization to leave this origin. */
export function safeAuthNext(value: unknown, fallback = "/communities"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") ||
      value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    return new URL(value, "https://dao.invalid").origin === "https://dao.invalid" ? value : fallback;
  } catch {
    return fallback;
  }
}

/** A document navigation reads the new session cookie before rendering account state. */
export function navigateAfterSignIn(
  value: unknown,
  fallback: string,
  replace: (href: string) => void = href => window.location.replace(href)
) {
  replace(safeAuthNext(value, fallback));
}
