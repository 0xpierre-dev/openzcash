// @vitest-environment node
const mocks = vi.hoisted(() => ({
  readSession: vi.fn(), writeSessionCookie: vi.fn(), getCookie: vi.fn(), setCookie: vi.fn(),
  beginPasskeyAuthentication: vi.fn(), finishPasskeyAuthentication: vi.fn(), beginPasskeyRegistration: vi.fn(),
  finishPasskeyRegistration: vi.fn(), listPasskeys: vi.fn(), revokePasskey: vi.fn(), recentPasskeyEmailAccess: vi.fn()
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.getCookie, set: mocks.setCookie }) }));
vi.mock("@/lib/auth/session", () => ({ readSession: mocks.readSession, writeSessionCookie: mocks.writeSessionCookie }));
vi.mock("@/lib/services/passkeys", () => mocks);
vi.mock("@/lib/services/passkey-enrollment", () => mocks);
vi.mock("@/lib/services/email-auth", () => ({ passkeyEmailAccess: async () => ({ canManage: true, emailAvailable: true }) }));
import { POST as options } from "@/app/api/auth/passkeys/options/route";
import { POST as authenticate } from "@/app/api/auth/passkeys/verify/route";
import { GET as list, POST as register } from "@/app/api/account/passkeys/route";
import { POST as verifyRegistration } from "@/app/api/account/passkeys/verify/route";
import { DELETE as remove } from "@/app/api/account/passkeys/[passkeyId]/route";
import { PasskeyError } from "@/lib/auth/passkey-policy";

const credential = { id: "credential", rawId: "credential", type: "public-key", clientExtensionResults: {}, response: { clientDataJSON: "test", authenticatorData: "test", signature: "test", userHandle: "test", attestationObject: "test" } };
function req(body: unknown = {}, origin = "http://localhost:4411") {
  return new Request("http://localhost:4411/api/passkeys", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("PASSKEY_ORIGIN", undefined);
  mocks.readSession.mockResolvedValue({ subjectType: "user", userId: "user-1", nick: "maya", role: "USER" });
  mocks.getCookie.mockReturnValue({ value: "opaque-challenge-token" });
  mocks.beginPasskeyAuthentication.mockResolvedValue({ token: "new-token", options: { challenge: "challenge" } });
  mocks.beginPasskeyRegistration.mockResolvedValue({ token: "registration-token", options: { challenge: "registration" } });
  mocks.recentPasskeyEmailAccess.mockResolvedValue(null);
  mocks.finishPasskeyAuthentication.mockResolvedValue({ subjectType: "user", userId: "user-1", nick: "maya", role: "USER" });
});
afterEach(() => vi.unstubAllEnvs());

describe("passkey HTTP routes", () => {
  it("uses private responses and an HttpOnly ceremony cookie", async () => {
    const response = await options(req());
    expect(await response.json()).toEqual({ options: { challenge: "challenge" } });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.setCookie).toHaveBeenCalledWith("dao_passkey", "new-token", expect.objectContaining({ httpOnly: true, sameSite: "strict", path: "/", maxAge: 300 }));
  });
  it("creates a normal account session only after verification and sanitizes the destination", async () => {
    const response = await authenticate(req({ credential, next: "//attacker.example" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ redirectTo: "/communities" });
    expect(mocks.finishPasskeyAuthentication).toHaveBeenCalledWith("opaque-challenge-token", credential, { origin: "http://localhost:4411", rpId: "localhost" });
    expect(mocks.writeSessionCookie).toHaveBeenCalledWith({ subjectType: "user", userId: "user-1", nick: "maya", role: "USER" });
    expect(mocks.setCookie).toHaveBeenCalledWith("dao_passkey", "", expect.objectContaining({ maxAge: 0 }));
  });
  it("does not write a session after an invalid assertion", async () => {
    mocks.finishPasskeyAuthentication.mockRejectedValueOnce(new PasskeyError("PASSKEY_INVALID", 401));
    expect((await authenticate(req({ credential }))).status).toBe(401);
    expect(mocks.writeSessionCookie).not.toHaveBeenCalled();
  });
  it.each([null, { subjectType: "poll_voter_access", userId: "" }])("excludes anonymous and temporary-invitation sessions from passkey management", async session => {
    mocks.readSession.mockResolvedValue(session);
    for (const response of [await list(req()), await register(req({ label: "Device", code: "123456" })), await verifyRegistration(req(credential)), await remove(req({ code: "123456" }), { params: Promise.resolve({ passkeyId: "other" }) })]) {
      expect(response.status).toBe(session ? 403 : 401);
    }
    expect(mocks.beginPasskeyRegistration).not.toHaveBeenCalled();
    expect(mocks.revokePasskey).not.toHaveBeenCalled();
  });
  it("derives the registering user exclusively from the session", async () => {
    await register(req({ label: "Phone", code: "123456", userId: "attacker" }));
    expect(mocks.beginPasskeyRegistration).toHaveBeenCalledWith("user-1", { label: "Phone", code: "123456" }, expect.any(Object), "opaque-challenge-token", "opaque-challenge-token", { token: "opaque-challenge-token", sessionToken: "opaque-challenge-token" });
  });
  it("passes code-free enrollment through the server-bound proof instead of trusting request flags", async () => {
    const response = await register(req({ label: "Phone", recentEmailVerified: true }));
    expect(response.status).toBe(200);
    expect(mocks.beginPasskeyRegistration).toHaveBeenCalledWith("user-1", { label: "Phone" }, expect.any(Object), "opaque-challenge-token", "opaque-challenge-token", { token: "opaque-challenge-token", sessionToken: "opaque-challenge-token" });
    expect(mocks.setCookie).toHaveBeenCalledWith("participate_passkey_email", "", expect.objectContaining({ maxAge: 0, httpOnly: true }));
  });
  it("exposes only enrollment availability and expiry, never the proof", async () => {
    const expiresAt = new Date("2026-10-12T23:05:00Z");
    mocks.recentPasskeyEmailAccess.mockResolvedValueOnce({ expiresAt });
    mocks.listPasskeys.mockResolvedValueOnce([]);
    const response = await list(req());
    expect(await response.json()).toEqual({ passkeys: [], canManage: true, emailAvailable: true, canEnrollWithRecentEmail: true, recentEmailExpiresAt: expiresAt.toISOString() });
  });
  it("requires fresh email confirmation after the enrollment grant expires", async () => {
    mocks.beginPasskeyRegistration.mockRejectedValueOnce(new PasskeyError("PASSKEY_EMAIL_CONFIRMATION_REQUIRED", 403));
    const response = await register(req({ label: "Phone" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "PASSKEY_EMAIL_CONFIRMATION_REQUIRED" });
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });
  it("rejects origin spoofing for every write", async () => {
    for (const response of [await options(req({}, "https://evil.example")), await authenticate(req({ credential }, "https://evil.example")), await register(req({}, "https://evil.example")), await verifyRegistration(req(credential, "https://evil.example")), await remove(req({}, "https://evil.example"), { params: Promise.resolve({ passkeyId: "key" }) })]) expect(response.status).toBe(403);
    expect(mocks.writeSessionCookie).not.toHaveBeenCalled();
    expect(mocks.beginPasskeyAuthentication).not.toHaveBeenCalled();
  });
  it("rejects malformed and oversized input before crypto verification", async () => {
    expect((await authenticate(req({ credential: { id: "only-id" } }))).status).toBe(400);
    expect((await authenticate(req({ credential, padding: "x".repeat(70_000) }))).status).toBe(413);
    expect(mocks.finishPasskeyAuthentication).not.toHaveBeenCalled();
  });
});
