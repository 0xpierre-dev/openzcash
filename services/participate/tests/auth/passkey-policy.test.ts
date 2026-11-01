import { passkeyContext, passkeyCookieName, requirePasskeyOrigin } from "@/lib/auth/passkey-policy";

afterEach(() => vi.unstubAllEnvs());
function request(url = "http://localhost:4411", origin = url, extra: Record<string, string> = {}) {
  return new Request(`${url}/api/auth/passkeys/options`, { method: "POST", headers: { origin, ...extra } });
}

describe("passkey origin policy", () => {
  beforeEach(() => { vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("PASSKEY_ORIGIN", undefined); vi.stubEnv("APP_BASE_URL", undefined); });
  it("supports localhost development without trusting forwarded headers", () => {
    expect(requirePasskeyOrigin(request(undefined, undefined, { "x-forwarded-host": "attacker.example" })))
      .toEqual({ origin: "http://localhost:4411", rpId: "localhost" });
  });
  it.each(["http://127.0.0.1:4411", "http://evil.example", "https://unconfigured.example"])("rejects unconfigured %s", url => {
    expect(() => passkeyContext(request(url))).toThrow("PASSKEY_UNAVAILABLE");
  });
  it("requires a pinned HTTPS production origin and a host-only secure cookie", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => passkeyContext(request())).toThrow("PASSKEY_UNAVAILABLE");
    vi.stubEnv("PASSKEY_ORIGIN", "https://dao.example");
    expect(requirePasskeyOrigin(request("http://internal:3000", "https://dao.example"))).toEqual({ origin: "https://dao.example", rpId: "dao.example" });
    expect(passkeyCookieName()).toBe("__Host-dao_passkey");
  });
  it.each(["http://dao.example", "http://localhost:4411", "https://user:pass@dao.example", "not-a-url"])("fails closed on unsafe production config %s", value => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("PASSKEY_ORIGIN", value);
    expect(() => passkeyContext(request())).toThrow("PASSKEY_UNAVAILABLE");
  });
  it("rejects absent, cross-site, or mismatched origins including port changes", () => {
    for (const req of [request(undefined, ""), request(undefined, "http://localhost:3000"), request(undefined, undefined, { "sec-fetch-site": "cross-site" })]) {
      expect(() => requirePasskeyOrigin(req)).toThrow("forbidden_origin");
    }
  });
});
