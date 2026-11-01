// @vitest-environment node
import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { testAuthenticator } from "@/tests/helpers/passkey-authenticator";

const delivery = vi.hoisted(() => ({ deliverEmailCode: vi.fn(), emailDeliveryAvailable: () => true }));
vi.mock("@/lib/services/email-delivery", () => delivery);
const databaseUrl = process.env.TREASURY_TEST_DATABASE_URL;
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (target.hostname !== "127.0.0.1" || target.port !== (process.env.PARTICIPATE_TEST_PORT ?? "55438") || target.pathname !== "/community_treasury_tests") throw new Error("Passkey tests require the isolated local test database");
}
const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? "postgresql://unused@127.0.0.1:1/unused" });
vi.mock("@/lib/db", () => ({ db: prisma }));
const { beginPasskeyRegistration, finishPasskeyRegistration, beginPasskeyAuthentication, finishPasskeyAuthentication, listPasskeys, revokePasskey } = await import("@/lib/services/passkeys");
const { requestPasskeyEmailCode } = await import("@/lib/services/email-auth");
const context = { origin: "http://localhost:4411", rpId: "localhost" };
const password = "isolated-test-account-password";

async function confirmation(userId: string, action: "add" | "remove", binding: string) {
  await prisma.emailAuthThrottle.updateMany({ data: { lastSentAt: new Date(0) } });
  const result = await requestPasskeyEmailCode(userId, action, binding, context.origin);
  return { token: result.token, code: delivery.deliverEmailCode.mock.calls.at(-1)![1] as string };
}
async function fixture(register = true) {
  const user = await prisma.user.create({ data: { nick: `passkey-test-${randomUUID()}`, email: `passkey-${randomUUID()}@example.test`, emailVerifiedAt: new Date(), passwordHash: await hashPassword(password), role: "USER" } });
  const authenticator = testAuthenticator();
  const proof = await confirmation(user.id, "add", "Test device");
  const ceremony = await beginPasskeyRegistration(user.id, { label: "Test device", code: proof.code }, context, undefined, proof.token);
  const key = register ? await finishPasskeyRegistration(user.id, ceremony.token, authenticator.registration(ceremony.options.challenge), context) : null;
  return { user, authenticator, ceremony, key, userHandle: ceremony.options.user.id };
}

describe.skipIf(!databaseUrl)("PostgreSQL passkeys with signed WebAuthn responses", () => {
  beforeEach(async () => { vi.stubEnv("EMAIL_AUTH_SECRET", "isolated-test-secret-for-email-authentication"); await prisma.emailAuthThrottle.deleteMany(); });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => { await prisma.$disconnect(); });
  it("registers a discoverable key and authenticates its account with a real signature", async () => {
    const f = await fixture();
    const stored = await prisma.passkey.findUniqueOrThrow({ where: { id: f.key!.id } });
    expect(stored.publicKey.byteLength).toBeGreaterThan(0);
    expect(f.ceremony.options.authenticatorSelection).toMatchObject({ residentKey: "required", userVerification: "required" });
    const login = await beginPasskeyAuthentication(context);
    expect(login.options.allowCredentials ?? []).toHaveLength(0);
    const session = await finishPasskeyAuthentication(login.token, f.authenticator.authentication(login.options.challenge, f.userHandle), context);
    expect(session).toEqual({ subjectType: "user", userId: f.user.id, nick: f.user.nick, role: "USER" });
    expect(await prisma.passkey.findUnique({ where: { id: f.key!.id } })).toMatchObject({ counter: 1n, lastUsedAt: expect.any(Date) });
    const listed = await listPasskeys(f.user.id, context);
    expect(Object.keys(listed[0]).sort()).toEqual(["createdAt", "id", "label", "lastUsedAt"]);
  });

  it("allows just one concurrent verification of the same challenge", async () => {
    const f = await fixture();
    const login = await beginPasskeyAuthentication(context);
    const response = f.authenticator.authentication(login.options.challenge, f.userHandle);
    const results = await Promise.allSettled([finishPasskeyAuthentication(login.token, response, context), finishPasskeyAuthentication(login.token, response, context)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    await expect(finishPasskeyAuthentication(login.token, response, context)).rejects.toMatchObject({ code: "PASSKEY_EXPIRED" });
  });

  it.each(["origin", "rp", "verification", "challenge", "signature", "handle", "crossOrigin"])("rejects incorrect authentication %s and consumes the challenge", async fault => {
    const f = await fixture(); const login = await beginPasskeyAuthentication(context);
    const response = f.authenticator.authentication(fault === "challenge" ? "wrong-challenge" : login.options.challenge, fault === "handle" ? "wrong-handle" : f.userHandle, {
      ...(fault === "origin" ? { origin: "https://attacker.example" } : {}), ...(fault === "rp" ? { rpId: "attacker.example" } : {}),
      ...(fault === "verification" ? { verified: false } : {}), ...(fault === "crossOrigin" ? { crossOrigin: true } : {})
    });
    if (fault === "signature") response.response.signature = Buffer.alloc(64).toString("base64url");
    await expect(finishPasskeyAuthentication(login.token, response, context)).rejects.toMatchObject({ code: "PASSKEY_INVALID" });
    await expect(finishPasskeyAuthentication(login.token, f.authenticator.authentication(login.options.challenge, f.userHandle), context)).rejects.toMatchObject({ code: "PASSKEY_EXPIRED" });
    expect(await prisma.passkey.findUnique({ where: { id: f.key!.id } })).toMatchObject({ counter: 0n, lastUsedAt: null });
  });

  it.each(["origin", "verification", "user", "password-change"])("rejects registration with invalid %s", async fault => {
    const f = await fixture(false);
    if (fault === "password-change") await prisma.user.update({ where: { id: f.user.id }, data: { passwordHash: await hashPassword("changed-test-password") } });
    await expect(finishPasskeyRegistration(fault === "user" ? "another-account" : f.user.id, f.ceremony.token, f.authenticator.registration(f.ceremony.options.challenge, {
      ...(fault === "origin" ? { origin: "https://attacker.example" } : {}), ...(fault === "verification" ? { verified: false } : {})
    }), context)).rejects.toMatchObject({ code: fault === "user" ? "EMAIL_ACCOUNT_REQUIRED" : fault === "password-change" ? "PASSKEY_EXPIRED" : "PASSKEY_INVALID" });
    expect(await prisma.passkey.count({ where: { userId: f.user.id } })).toBe(0);
  });

  it("rejects expired, replaced and absent browser challenges", async () => {
    const f = await fixture(); const login = await beginPasskeyAuthentication(context);
    const response = f.authenticator.authentication(login.options.challenge, f.userHandle);
    await expect(finishPasskeyAuthentication(undefined, response, context)).rejects.toMatchObject({ code: "PASSKEY_EXPIRED" });
    await prisma.passkeyChallenge.update({ where: { id: createHash("sha256").update(login.token).digest("hex") }, data: { expiresAt: new Date(0) } });
    await expect(finishPasskeyAuthentication(login.token, response, context)).rejects.toMatchObject({ code: "PASSKEY_EXPIRED" });
    const first = await beginPasskeyAuthentication(context);
    await beginPasskeyAuthentication(context, first.token);
    await expect(finishPasskeyAuthentication(first.token, response, context)).rejects.toMatchObject({ code: "PASSKEY_EXPIRED" });
  });

  it("rejects a disabled account at verification", async () => {
    const f = await fixture(); const login = await beginPasskeyAuthentication(context);
    await prisma.user.update({ where: { id: f.user.id }, data: { status: "DISABLED" } });
    await expect(finishPasskeyAuthentication(login.token, f.authenticator.authentication(login.options.challenge, f.userHandle), context)).rejects.toMatchObject({ code: "EMAIL_ACCOUNT_REQUIRED" });
  });

  it("rejects a rolled-back authenticator counter even with a fresh challenge", async () => {
    const f = await fixture();
    const first = await beginPasskeyAuthentication(context);
    await finishPasskeyAuthentication(first.token, f.authenticator.authentication(first.options.challenge, f.userHandle, { counter: 5 }), context);
    const second = await beginPasskeyAuthentication(context);
    await expect(finishPasskeyAuthentication(second.token, f.authenticator.authentication(second.options.challenge, f.userHandle, { counter: 4 }), context)).rejects.toMatchObject({ code: "PASSKEY_INVALID" });
    expect(await prisma.passkey.findUnique({ where: { id: f.key!.id } })).toMatchObject({ counter: 5n });
  });

  it("supports authenticators whose signature counter remains zero with new challenges", async () => {
    const f = await fixture();
    for (let i = 0; i < 2; i++) {
      const login = await beginPasskeyAuthentication(context);
      await expect(finishPasskeyAuthentication(login.token, f.authenticator.authentication(login.options.challenge, f.userHandle, { counter: 0 }), context)).resolves.toMatchObject({ userId: f.user.id });
    }
  });

  it("guards removal with a fresh email code and ownership, and prevents revoked-key login", async () => {
    const f = await fixture(); const other = await fixture();
    await expect(revokePasskey(f.user.id, f.key!.id, { code: "000000" }, context)).rejects.toMatchObject({ code: "EMAIL_CODE_INVALID" });
    await expect(confirmation(other.user.id, "remove", f.key!.id)).rejects.toMatchObject({ code: "PASSKEY_NOT_FOUND" });
    const login = await beginPasskeyAuthentication(context);
    await revokePasskey(f.user.id, f.key!.id, await confirmation(f.user.id, "remove", f.key!.id), context);
    expect(await listPasskeys(f.user.id, context)).toEqual([]);
    await expect(finishPasskeyAuthentication(login.token, f.authenticator.authentication(login.options.challenge, f.userHandle), context)).rejects.toMatchObject({ code: "PASSKEY_INVALID" });
  });

  it("does not create a registration ceremony without an email confirmation", async () => {
    const f = await fixture(false);
    await expect(beginPasskeyRegistration(f.user.id, { label: "Test", code: "123456" }, context)).rejects.toMatchObject({ code: "EMAIL_CODE_INVALID" });
    expect(await prisma.passkey.count({ where: { userId: f.user.id } })).toBe(0);
  });

  it("bounds anonymous challenge creation without collecting IP addresses", async () => {
    const limitedContext = { origin: "https://rate-test.example", rpId: `rate-${randomUUID()}.example` };
    await prisma.passkeyThrottle.create({ data: { id: `authentication:${limitedContext.rpId}`, attempts: 500, resetsAt: new Date(Date.now() + 60_000) } });
    await expect(beginPasskeyAuthentication(limitedContext)).rejects.toMatchObject({ code: "PASSKEY_RATE_LIMITED" });
    expect(await prisma.passkeyChallenge.count({ where: { rpId: limitedContext.rpId } })).toBe(0);
  });
});
