/** Only an explicitly configured parent may embed or send appearance messages. */
export function participateParentOrigin(raw: string | undefined, environment = process.env.NODE_ENV): string | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || url.hostname.includes("*")) return null;
    if (url.protocol !== "https:" && !(environment === "development" && local && url.protocol === "http:")) return null;
    if (local && environment !== "development") return null;
    return url.origin;
  } catch { return null; }
}

export function participationThemeMessage(value: unknown): "light" | "dark" | null {
  if (!value || typeof value !== "object") return null;
  const message = value as Record<string, unknown>;
  if (message.type !== "participate:theme" || message.version !== 1) return null;
  return message.theme === "light" || message.theme === "dark" ? message.theme : null;
}
