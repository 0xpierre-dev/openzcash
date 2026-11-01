import { env as processEnvironment } from "node:process";

/**
 * The committee demo is a separate deployment of this portal (its own host and
 * Participate backend) where testers try the full committee flow with test
 * data. Production never sets this flag; the backend also refuses demo actions
 * unless its own demo database is connected.
 */
export function participateDemoMode(
  env: Record<string, string | undefined> = processEnvironment,
): boolean {
  return env.PARTICIPATE_DEMO_ENVIRONMENT === "true";
}

export const DEMO_HOME = "/zcg/participate?view=practice";

// The demo host serves Participate only: its page, the pilot's proxied APIs,
// the portal's own Participate routes, the verifier downloads and static files.
const DEMO_PREFIXES = [
  "/api/participate/",
  "/api/auth/",
  "/api/account/",
  "/api/communities/",
  "/verify/",
  "/_next/",
];

export function demoPathAllowed(pathname: string): boolean {
  // `/api` is the Railway healthcheck (railway.toml); it must answer 200, not redirect.
  if (pathname === "/zcg/participate" || pathname === "/api") return true;
  if (DEMO_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  // Public files such as icons and fonts, never pages.
  return (
    /^\/[\w./-]+\.(?:svg|png|ico|webp|jpg|jpeg|woff2?|txt|webmanifest|json)$/.test(
      pathname,
    ) && !pathname.startsWith("/api/")
  );
}
