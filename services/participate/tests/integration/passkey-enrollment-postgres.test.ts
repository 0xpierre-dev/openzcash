// @vitest-environment node
import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { testAuthenticator } from "@/tests/helpers/passkey-authenticator";

const delivery = vi.hoisted(() => ({ deliverEmailCode: vi.fn(), emailDeliveryAvailable: () => true }));
vi.mock("@/lib/services/email-delivery", () => delivery);
const databaseUrl = process.env.TREASURY_TEST_DATABASE_URL;
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (target.hostname !== "127.0.0.1" || target.port !== (process.env.PARTICIPATE_TEST_PORT ?? "55438") || target.pathname !== "/community_treasury_tests") throw new Error("Passkey enrollment tests require the isolated local test database");
}
const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? "postgresql://unused@127.0.0.1:1/unused" });
vi.mock("@/lib/db", () => ({ db: prisma }));
const { issueRecentPasskeyEmail, recentPasskeyEmailAccess } = await import("@/lib/services/passkey-enrollment");
const { beginPasskeyRegistration, finishPasskeyRegistration, beginPasskeyAuthentication, finishPasskeyAuthentication } = await import("@/lib/services/passkeys");
const { requestEmailCode, finishEmailSignIn, requestPasskeyEmailCode } = await import("@/lib/services/email-auth");
const context = { origin: "http://localhost:4411", rpId: "localhost" };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

async function fixture() {
  const email = `enrollment-${randomUUID()}@example.test`;
  const code = await requestEmailCode({ email, purpose: "SIGN_IN", origin: context.origin });
  const session = await finishEmailSignIn({ token: code.token, code: delivery.deliverEmailCode.mock.calls.at(-1)![1] }, context.origin);
  const sessionToken = `verified-session-${randomUUID()}`;
  const grant = await issueRecentPasskeyEmail(session.userId, context, sessionToken);
  expect(grant).not.toBeNull();
  const proof = { token: grant!.token, sessionToken };
  return { session, grant: grant!, proof, authenticator: testAuthenticator() };
}

describe.skipIf(!databaseUrl)("recent email authorization for the first passkey", () => {
  beforeEach(async () => {
    vi.stubEnv("EMAIL_AUTH_SECRET", "isolated-test-secret-for-email-authentication");
    delivery.deliverEmailCode.mockReset().mockResolvedValue(undefined);
    await prisma.emailAuthThrottle.deleteMany();
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => prisma.$disconnect());

  it("completes real first-key registration and authentication without sending a redundant email", async () => {
    const f = await fixture();
    expect(await recentPasskeyEmailAccess(f.session.userId, f.proof, context)).toEqual({ expiresAt: f.grant.expiresAt });
    const stored = await prisma.passkeyChallenge.findUniqueOrThrow({ where: { id: hash(f.proof.token) } });
    expect(stored.challenge).toBe(hash(f.proof.sessionToken));
    expect(stored.challenge).not.toBe(f.proof.sessionToken);
    const options = await beginPasskeyRegistration(f.session.userId, { label: "Phone" }, context, undefined, undefined, f.proof);
    const key = await finishPasskeyRegistration(f.session.userId, options.token, f.authenticator.registration(options.options.challenge), context);
    expect(delivery.deliverEmailCode).toHaveBeenCalledOnce();
    const login = await beginPasskeyAuthentication(context);
    await expect(finishPasskeyAuthentication(login.token, f.authenticator.authentication(login.options.challenge, options.options.user.id), context)).resolves.toMatchObject({ userId: f.session.userId });
    expect(await recentPasskeyEmailAccess(f.session.userId, f.proof, context)).toBeNull();
    expect(await issueRecentPasskeyEmail(f.session.userId, context, "another-session")).toBeNull();
    await prisma.passkey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
    expect(await issueRecentPasskeyEmail(f.session.userId, context, "another-session")).toBeNull();
  });

  it.each(["missing", "session", "account", "origin", "rp", "expired", "email", "unverified", "disabled", "password"])("rejects %s proof without starting registration", async fault => {
    const f = await fixture();
    const userId = fault === "account" ? "other-account" : f.session.userId;
    const proof = fault === "missing" ? {} : fault === "session" ? { ...f.proof, sessionToken: "different-session" } : f.proof;
    const boundContext = fault === "origin" ? { ...context, origin: "https://other.example" } : fault === "rp" ? { ...context, rpId: "other.example" } : context;
    if (fault === "expired") await prisma.passkeyChallenge.update({ where: { id: hash(f.proof.token) }, data: { expiresAt: new Date(0) } });
    if (fault === "email") await prisma.user.update({ where: { id: userId }, data: { email: `changed-${randomUUID()}@example.test` } });
    if (fault === "unverified") await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: null } });
    if (fault === "disabled") await prisma.user.update({ where: { id: userId }, data: { status: "DISABLED" } });
    if (fault === "password") await prisma.user.update({ where: { id: userId }, data: { passwordHash: "changed-version" } });
    expect(await recentPasskeyEmailAccess(userId, proof, boundContext)).toBeNull();
    await expect(beginPasskeyRegistration(userId, { label: "Phone" }, boundContext, undefined, undefined, proof)).rejects.toMatchObject({ code: "PASSKEY_EMAIL_CONFIRMATION_REQUIRED" });
    expect(await prisma.passkey.count({ where: { userId: f.session.userId } })).toBe(0);
  });

  it("consumes the grant once even with concurrent registration requests", async () => {
    const f = await fixture();
    const attempts = await Promise.allSettled([
      beginPasskeyRegistration(f.session.userId, { label: "Phone" }, context, undefined, undefined, f.proof),
      beginPasskeyRegistration(f.session.userId, { label: "Laptop" }, context, undefined, undefined, f.proof)
    ]);
    expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await recentPasskeyEmailAccess(f.session.userId, f.proof, context)).toBeNull();
    await expect(beginPasskeyRegistration(f.session.userId, { label: "Retry after cancellation" }, context, undefined, undefined, f.proof)).rejects.toMatchObject({ code: "PASSKEY_EMAIL_CONFIRMATION_REQUIRED" });
    expect(delivery.deliverEmailCode).toHaveBeenCalledOnce();
  });

  it("allows only one first-key completion across grants from distinct email sign-ins", async () => {
    const f = await fixture();
    const secondSession = `verified-session-${randomUUID()}`;
    const secondGrant = await issueRecentPasskeyEmail(f.session.userId, context, secondSession);
    const secondAuthenticator = testAuthenticator();
    const first = await beginPasskeyRegistration(f.session.userId, { label: "First" }, context, undefined, undefined, f.proof);
    const second = await beginPasskeyRegistration(f.session.userId, { label: "Second" }, context, undefined, undefined, { token: secondGrant!.token, sessionToken: secondSession });
    const attempts = await Promise.allSettled([
      finishPasskeyRegistration(f.session.userId, first.token, f.authenticator.registration(first.options.challenge), context),
      finishPasskeyRegistration(f.session.userId, second.token, secondAuthenticator.registration(second.options.challenge), context)
    ]);
    expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await prisma.passkey.count({ where: { userId: f.session.userId } })).toBe(1);
  });

  it("reports the remaining cooldown and longer recipient cap without accepting sign-in proof for management", async () => {
    const f = await fixture();
    await expect(requestPasskeyEmailCode(f.session.userId, "add", "Phone", context.origin)).rejects.toMatchObject({ code: "EMAIL_RATE_LIMITED", status: 429, retryAfter: expect.any(Number) });
    await prisma.emailAuthThrottle.updateMany({ data: { lastSentAt: new Date(Date.now() - 45_000) } });
    try {
      await requestPasskeyEmailCode(f.session.userId, "add", "Phone", context.origin);
      throw new Error("Expected cooldown");
    } catch (error) {
      expect(error).toMatchObject({ code: "EMAIL_RATE_LIMITED", retryAfter: 15 });
    }
    await prisma.emailAuthThrottle.updateMany({ data: { attempts: 5, resetsAt: new Date(Date.now() + 420_000), lastSentAt: new Date(0) } });
    await expect(requestPasskeyEmailCode(f.session.userId, "add", "Phone", context.origin)).rejects.toMatchObject({ code: "EMAIL_RATE_LIMITED", retryAfter: 420 });
  });
});
