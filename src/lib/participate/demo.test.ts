import { describe, expect, it } from "vitest";
import { demoPathAllowed, participateDemoMode } from "./demo";

describe("committee demo deployment flag", () => {
  it("is on only for the explicit value", () => {
    expect(participateDemoMode({ PARTICIPATE_DEMO_ENVIRONMENT: "true" })).toBe(true);
    for (const value of [undefined, "", "1", "TRUE", "yes"]) {
      expect(participateDemoMode({ PARTICIPATE_DEMO_ENVIRONMENT: value })).toBe(false);
    }
  });
  it.each([
    "/zcg/participate",
    "/api",
    "/api/participate/committee",
    "/api/participate/demo",
    "/api/auth/email/request",
    "/api/account/passkeys",
    "/api/communities/host/archives/participation",
    "/verify/decision-verify.mjs",
    "/_next/static/chunks/app.js",
    "/favicon.ico",
    "/fonts/openzcash-inter-latin.woff2",
  ])("allows Participate paths on the demo host: %s", (path) => {
    expect(demoPathAllowed(path)).toBe(true);
  });
  it.each(["/", "/zcg", "/zarvis", "/zcg/participate/extra", "/coinholders", "/api/zarvis/chat", "/api/zcg/data/grants", "/api/og.png"])(
    "redirects everything else: %s",
    (path) => {
      expect(demoPathAllowed(path)).toBe(false);
    },
  );
});
