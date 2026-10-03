import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { createSession, verifySession, SESSION_COOKIE } from "@/lib/auth/session";
import { isRetiredPath, proxy } from "./proxy";

const retired = [
  "/admin",
  "/login",
  "/onboarding?token=old-invite",
  "/viewing-keys",
  "/projects",
  "/invites",
  "/api/login",
  "/api/logout",
  "/api/health",
  "/api/onboarding",
  "/api/onboarding/invites",
  "/api/overrides",
  "/api/projects",
  "/api/scan",
  "/api/treasuries",
  "/api/zcg/proposals",
  "/api/zcg/disbursements",
  "/api/zcg/meetings",
  "/api/zcg/elections",
  "/api/zcg/links",
  "/api/zarvis/metrics",
];

describe("retired admin routes", () => {
  it.each(retired)("returns 404 despite an old valid session: %s", async (path) => {
    const secret = "test-only-session-secret";
    const session = await createSession(secret);
    expect(await verifySession(session, secret)).toBe(true);
    const request = new NextRequest(new URL(path, "https://openzcash.org"), {
      headers: { cookie: `${SESSION_COOKIE}=${session}` },
    });
    const response = proxy(request);
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("keeps public routes and removes a forged admin header", () => {
    for (const path of ["/api", "/api/zcg/data/grants", "/zcg", "/zarvis"]) {
      const response = proxy(new NextRequest(`https://openzcash.org${path}`, {
        headers: { "x-admin": "1" },
      }));
      expect(isRetiredPath(path)).toBe(false);
      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-request-x-admin")).toBe("0");
    }
    expect(isRetiredPath("/api/zcg/proposals-public")).toBe(false);
  });
});
