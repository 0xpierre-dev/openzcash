/** Server configuration only. This origin is never passed to the browser. */
export function participationUpstream(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw);
    const privateHost =
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      /^[a-z0-9-]+\.railway\.internal$/.test(url.hostname);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      url.hostname.includes("*")
    )
      return null;
    if (url.protocol !== "https:" && !(url.protocol === "http:" && privateHost))
      return null;
    if (["openzcash.org", "www.openzcash.org"].includes(url.hostname))
      return null; // Reject a proxy loop.
    return url.origin;
  } catch {
    return null;
  }
}

// Only the pilot's JSON APIs and recovery downloads cross the proxy. The
// screens are OpenZcash's own; the service's pages, assets, DAO module, legacy
// passwords, internal reconcilers and administrative APIs are not mounted.
export const participationRoutes = [
  "/api/auth/email/:action(request|verify|options)",
  "/api/auth/:action(logout|session)",
  "/api/auth/passkeys/:action(options|verify)",
  "/api/account/:action(settings|notifications|email-code)",
  "/api/account/credits",
  "/api/account/credits/preview",
  "/api/account/passkeys",
  "/api/account/passkeys/:id",
  "/api/participate/:action(proposals|admin-access|moderation-access|committee|zec-price)",
  "/api/communities/:communityId/archives/:path*",
  "/verify/:file(archive-verify\\.mjs|activity-verify\\.mjs|decision-verify\\.mjs|ZOD-LICENSE\\.txt)",
] as const;

// Demo deployments only: the committee demo's test-seat and reset actions.
// Production builds never mount this path.
export const participationDemoRoutes = ["/api/participate/demo"] as const;

export function participationRewrites(
  raw: string | undefined,
  { demo = false }: { demo?: boolean } = {},
) {
  const origin = participationUpstream(raw);
  const routes: readonly string[] = demo
    ? [...participationRoutes, ...participationDemoRoutes]
    : participationRoutes;
  return origin
    ? routes.map((source) => ({
        source,
        destination: `${origin}${source.replace(/(:\w+)\([^)]*\)/g, "$1")}`,
      }))
    : [];
}
