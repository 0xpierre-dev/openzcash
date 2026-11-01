// @vitest-environment node
const mocks = vi.hoisted(() => ({ requestEmailCode: vi.fn(), finishEmailSignIn: vi.fn(), signInToDemo: vi.fn(), requestPasskeyEmailCode: vi.fn(), issueRecentPasskeyEmail: vi.fn(), readSession: vi.fn(), writeSessionCookie: vi.fn(), get: vi.fn(), set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.get, set: mocks.set }) }));
vi.mock("@/lib/auth/session", () => mocks);
vi.mock("@/lib/services/email-auth", async importOriginal => ({ ...await importOriginal<object>(), ...mocks }));
vi.mock("@/lib/services/passkey-enrollment", () => mocks);
import { POST as requestCode } from "@/app/api/auth/email/request/route";
import { POST as verifyCode } from "@/app/api/auth/email/verify/route";
import { POST as manage } from "@/app/api/account/email-code/route";
import { POST as demo } from "@/app/api/auth/demo/route";
import { EmailAuthError } from "@/lib/auth/email-policy";
const origin = "http://localhost:4411";
const req = (body: unknown, source = origin) => new Request(`${origin}/api/auth/email`, { method: "POST", headers: { origin: source, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("APP_BASE_URL", origin);
  mocks.requestEmailCode.mockResolvedValue({ token: "secret-browser-token", expiresIn: 600, retryAfter: 60 });
  mocks.get.mockReturnValue({ value: "browser-token" });
  mocks.finishEmailSignIn.mockResolvedValue({ subjectType: "user", userId: "user-1", nick: "member", role: "USER" });
  mocks.readSession.mockResolvedValue({ subjectType: "user", userId: "user-1" });
  mocks.requestPasskeyEmailCode.mockResolvedValue({ token: "management-token", expiresIn: 600, retryAfter: 60 });
  mocks.writeSessionCookie.mockResolvedValue("new-signed-session");
  mocks.issueRecentPasskeyEmail.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());
it("defaults the local demo to participant and rejects committee session creation", async () => {
  mocks.readSession.mockResolvedValue(null);
  mocks.signInToDemo.mockResolvedValue({ subjectType: "user", userId: "preview_participant", nick: "participant.preview", role: "USER" });
  expect((await demo(req({}))).status).toBe(200);
  expect(mocks.signInToDemo).toHaveBeenCalledWith("participant");
  expect((await demo(req({ persona: "committee" }))).status).toBe(403);
  for (const body of [{ persona: "owner" }, { persona: "participant", userId: "owner" }, { role: "OWNER" }]) expect((await demo(req(body))).status).toBe(400);
  expect(mocks.writeSessionCookie).toHaveBeenCalledTimes(1);
});
it("never promotes a participant or silently replaces a personal session", async () => {
  expect((await demo(req({ persona: "participant" }))).status).toBe(409);
  mocks.readSession.mockResolvedValue({ subjectType: "user", userId: "preview_participant" });
  expect((await demo(req({ persona: "committee" }))).status).toBe(403);
  expect(mocks.signInToDemo).not.toHaveBeenCalled();
  expect(mocks.writeSessionCookie).not.toHaveBeenCalled();
});
it("normalizes email, keeps secrets out of responses, and binds proof to an HttpOnly cookie", async () => {
  const response = await requestCode(req({ email: " Member@Example.test " }));
  expect(await response.json()).toEqual({ sent: true, expiresIn: 600, retryAfter: 60 });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.requestEmailCode).toHaveBeenCalledWith({ email: "member@example.test", purpose: "SIGN_IN", origin }, "browser-token");
  expect(mocks.set).toHaveBeenCalledWith("participate_email_login", "secret-browser-token", expect.objectContaining({ httpOnly: true, sameSite: "strict", maxAge: 600 }));
  expect(mocks.writeSessionCookie).not.toHaveBeenCalled();
});
it("creates a session only after verification and sanitizes next", async () => {
  const response = await verifyCode(req({ code: "123456", next: "//attacker.test" }));
  expect(await response.json()).toEqual({ redirectTo: "/participate", offerPasskeySetup: false });
  expect(mocks.finishEmailSignIn).toHaveBeenCalledWith({ code: "123456", token: "browser-token" }, origin);
  expect(mocks.set).toHaveBeenCalledWith("participate_email_login", "", expect.objectContaining({ maxAge: 0 }));
  expect(mocks.writeSessionCookie).toHaveBeenCalledOnce();
});
it("offers first-key setup only after OTP verification and binds its private cookie to the new session", async () => {
  mocks.issueRecentPasskeyEmail.mockResolvedValueOnce({ token: "opaque-enrollment-grant", expiresAt: new Date(Date.now() + 300_000) });
  const response = await verifyCode(req({ code: "123456", next: "/participate?record=zcg-github-479" }));
  expect(await response.json()).toEqual({ redirectTo: "/participate?record=zcg-github-479", offerPasskeySetup: true });
  expect(mocks.issueRecentPasskeyEmail).toHaveBeenCalledWith("user-1", { origin, rpId: "localhost" }, "new-signed-session");
  expect(mocks.set).toHaveBeenCalledWith("participate_passkey_email", "opaque-enrollment-grant", expect.objectContaining({ httpOnly: true, sameSite: "strict", path: "/", maxAge: 300 }));
  expect(mocks.requestPasskeyEmailCode).not.toHaveBeenCalled();
});
it("keeps verified email sign-in successful when optional passkey setup is unavailable", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.issueRecentPasskeyEmail.mockRejectedValueOnce(new Error("private database details"));
  try {
    const response = await verifyCode(req({ code: "123456" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ redirectTo: "/participate", offerPasskeySetup: false });
    expect(mocks.set).toHaveBeenCalledWith("participate_passkey_email", "", expect.objectContaining({ maxAge: 0 }));
    expect(warn).toHaveBeenCalledWith("Passkey setup offer unavailable after email sign-in");
  } finally { warn.mockRestore(); }
});
it("returns the actual cooldown in JSON and Retry-After for management requests", async () => {
  mocks.requestPasskeyEmailCode.mockRejectedValueOnce(new EmailAuthError("EMAIL_RATE_LIMITED", 429, 427));
  const response = await manage(req({ action: "add", label: "My phone" }));
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("427");
  expect(await response.json()).toEqual({ error: "EMAIL_RATE_LIMITED", retryAfter: 427 });
});
it("never claims a code was sent when delivery is unconfigured or failed", async () => {
  mocks.requestEmailCode.mockRejectedValueOnce(new EmailAuthError("EMAIL_NOT_CONFIGURED", 503));
  const response = await requestCode(req({ email: "member@example.test" }));
  expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "EMAIL_NOT_CONFIGURED" });
  expect(mocks.set).not.toHaveBeenCalled();
});
it("does not create a session after an invalid code and redacts internal errors", async () => {
  mocks.finishEmailSignIn.mockRejectedValueOnce(new EmailAuthError("EMAIL_CODE_INVALID"));
  expect((await verifyCode(req({ code: "123456" }))).status).toBe(400);
  mocks.finishEmailSignIn.mockRejectedValueOnce(new Error("private code or transport diagnostics"));
  expect(await (await verifyCode(req({ code: "123456" }))).json()).toEqual({ error: "EMAIL_UNAVAILABLE" });
  expect(mocks.writeSessionCookie).not.toHaveBeenCalled();
});
it("rejects cross-site writes including demo and management", async () => {
  for (const route of [requestCode, verifyCode, manage, demo]) expect((await route(req({}, "https://evil.test"))).status).toBe(403);
  expect(mocks.requestEmailCode).not.toHaveBeenCalled(); expect(mocks.signInToDemo).not.toHaveBeenCalled();
});
it("rejects malformed and oversized bodies", async () => {
  expect((await requestCode(req({ email: "bad" }))).status).toBe(400);
  expect((await verifyCode(req({ code: "123456", userId: "admin" }))).status).toBe(400);
  expect((await requestCode(req({ email: "x".repeat(3000) }))).status).toBe(413);
  expect(mocks.requestEmailCode).not.toHaveBeenCalled();
});
it("scopes passkey confirmation to the signed-in account and exact action", async () => {
  const response = await manage(req({ action: "add", label: "My phone" }));
  expect(response.status).toBe(200);
  expect(mocks.requestPasskeyEmailCode).toHaveBeenCalledWith("user-1", "add", "My phone", origin, "browser-token");
  expect(mocks.set).toHaveBeenCalledWith("participate_email_manage", "management-token", expect.any(Object));
  expect((await manage(req({ action: "add", label: "Phone", email: "attacker@test.com" }))).status).toBe(400);
});
it.each([null, { subjectType: "poll_voter_access", userId: "user-1" }])("rejects management without a personal session", async session => {
  mocks.readSession.mockResolvedValue(session);
  expect((await manage(req({ action: "add", label: "Phone" }))).status).toBe(401);
  expect(mocks.requestPasskeyEmailCode).not.toHaveBeenCalled();
});
