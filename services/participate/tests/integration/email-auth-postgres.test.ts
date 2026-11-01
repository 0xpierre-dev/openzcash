// @vitest-environment node
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
const delivery = vi.hoisted(() => ({ deliverEmailCode: vi.fn(), emailDeliveryAvailable: vi.fn() }));
vi.mock("@/lib/services/email-delivery", () => delivery);
const databaseUrl = process.env.TREASURY_TEST_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (url.hostname !== "127.0.0.1" || url.port !== (process.env.PARTICIPATE_TEST_PORT ?? "55438") || url.pathname !== "/community_treasury_tests") throw new Error("Requires isolated local test database");
}
const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? "postgresql://unused@127.0.0.1:1/unused" });
vi.mock("@/lib/db", () => ({ db: prisma }));
const { requestEmailCode, finishEmailSignIn, emailDigest, requestPasskeyEmailCode, confirmPasskeyEmail, signInToDemo } = await import("@/lib/services/email-auth");
const origin = "http://localhost:4411";
const address = () => `email-test-${randomUUID()}@example.test`;
async function issue(email = address(), previousToken?: string) {
  const result = await requestEmailCode({ email, origin, purpose: "SIGN_IN" }, previousToken);
  const code = delivery.deliverEmailCode.mock.calls.at(-1)![1] as string;
  return { ...result, email, code };
}
async function account(email = address(), extra = {}) {
  return prisma.user.create({ data: { nick: `email-test-${randomUUID()}`, email, emailVerifiedAt: new Date(), passwordHash: "", role: "USER", ...extra } });
}
describe.skipIf(!databaseUrl)("verified email authentication with PostgreSQL", () => {
  beforeEach(async () => {
    vi.stubEnv("EMAIL_AUTH_SECRET", "isolated-test-secret-for-email-authentication");
    delivery.deliverEmailCode.mockReset().mockResolvedValue(undefined);
    delivery.emailDeliveryAvailable.mockReturnValue(true);
    await prisma.emailAuthThrottle.deleteMany();
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => prisma.$disconnect());
  it("creates only a verified regular user after the code is consumed, without granting membership", async () => {
    const f = await issue();
    expect(await prisma.user.count({ where: { email: f.email } })).toBe(0);
    const saved = await prisma.emailAuthChallenge.findUniqueOrThrow({ where: { id: emailDigest(f.token) } });
    expect(saved.codeHash).toHaveLength(64); expect(saved.codeHash).not.toBe(f.code); expect(saved.id).not.toBe(f.token);
    const session = await finishEmailSignIn(f, origin);
    expect(session.role).toBe("USER");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
    expect(user).toMatchObject({ email: f.email, emailVerifiedAt: expect.any(Date), passwordHash: "" });
    expect(await prisma.communityMembership.count({ where: { userId: user.id } })).toBe(0);
    await expect(finishEmailSignIn(f, origin)).rejects.toMatchObject({ code: "EMAIL_CODE_INVALID" });
  });
  it("preserves an existing profile and role with case-insensitive verified email matching", async () => {
    const email = address(); const user = await account(email.toUpperCase(), { displayName: "Existing name", emailVerifiedAt: null });
    const f = await issue(` ${email} `);
    const session = await finishEmailSignIn(f, origin);
    expect(session.userId).toBe(user.id); expect(session.role).toBe("USER");
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toMatchObject({ displayName: "Existing name", emailVerifiedAt: expect.any(Date) });
  });
  it("allows exactly one concurrent consumption", async () => {
    const f = await issue(); const results = await Promise.allSettled([finishEmailSignIn(f, origin), finishEmailSignIn(f, origin)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  });
  it("commits failed attempts and locks the challenge after five guesses", async () => {
    const f = await issue(); const wrong = f.code === "000000" ? "999999" : "000000";
    for (let i = 0; i < 5; i++) await expect(finishEmailSignIn({ token: f.token, code: wrong }, origin)).rejects.toMatchObject({ code: "EMAIL_CODE_INVALID" });
    expect(await prisma.emailAuthChallenge.findUnique({ where: { id: emailDigest(f.token) } })).toMatchObject({ attempts: 5 });
    await expect(finishEmailSignIn(f, origin)).rejects.toMatchObject({ code: "EMAIL_CODE_INVALID" });
  });
  it("rejects absent browser proof, a different origin and an expired code", async () => {
    const f = await issue();
    await expect(finishEmailSignIn({ code: f.code }, origin)).rejects.toMatchObject({ code: "EMAIL_CODE_INVALID" });
    await expect(finishEmailSignIn(f, "https://attacker.test")).rejects.toMatchObject({ code: "EMAIL_CODE_INVALID" });
    await prisma.emailAuthChallenge.update({ where: { id: emailDigest(f.token) }, data: { expiresAt: new Date(0) } });
    await expect(finishEmailSignIn(f, origin)).rejects.toMatchObject({ code: "EMAIL_CODE_INVALID" });
  });
  it("expires the old browser code when another code is sent", async () => {
    const first = await issue();
    await prisma.emailAuthThrottle.updateMany({ data: { lastSentAt: new Date(0) } });
    const second = await issue(first.email, first.token);
    await expect(finishEmailSignIn(first, origin)).rejects.toMatchObject({ code: "EMAIL_CODE_INVALID" });
    await expect(finishEmailSignIn(second, origin)).resolves.toMatchObject({ role: "USER" });
  });
  it("rate-limits resends and concurrent deliveries for the same email", async () => {
    const email = address();
    const results = await Promise.allSettled([issue(email), issue(email.toUpperCase())]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(delivery.deliverEmailCode).toHaveBeenCalledOnce();
    await expect(issue(email)).rejects.toMatchObject({ code: "EMAIL_RATE_LIMITED" });
  });
  it("fails closed when sending is unavailable or fails", async () => {
    const email = address(); delivery.emailDeliveryAvailable.mockReturnValueOnce(false);
    await expect(issue(email)).rejects.toMatchObject({ code: "EMAIL_NOT_CONFIGURED" });
    expect(delivery.deliverEmailCode).not.toHaveBeenCalled();
    delivery.deliverEmailCode.mockRejectedValueOnce(new Error("Transport failure"));
    await expect(issue(email)).rejects.toThrow();
    expect(await prisma.emailAuthChallenge.count({ where: { email } })).toBe(0);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });
  it.each(["disabled", "collision", "demo"])("does not claim a %s account", async kind => {
    const email = address();
    await account(email, kind === "disabled" ? { status: "DISABLED" } : kind === "demo" ? { id: `preview_${randomUUID()}` } : {});
    if (kind === "collision") await account(email.toUpperCase());
    const f = await issue(email);
    await expect(finishEmailSignIn(f, origin)).rejects.toMatchObject({ code: "EMAIL_ACCOUNT_UNAVAILABLE" });
  });
  it("binds management confirmation to account, action and label, separately from sign-in", async () => {
    const user = await account();
    const f = await requestPasskeyEmailCode(user.id, "add", "My phone", origin);
    const proof = { token: f.token, code: delivery.deliverEmailCode.mock.calls.at(-1)![1] };
    await expect(finishEmailSignIn(proof, origin)).rejects.toMatchObject({ code: "EMAIL_CODE_INVALID" });
    await expect(confirmPasskeyEmail("another-user", "add", "My phone", proof, origin)).rejects.toMatchObject({ code: "EMAIL_CODE_INVALID" });
    await expect(confirmPasskeyEmail(user.id, "remove", "My phone", proof, origin)).rejects.toMatchObject({ code: "EMAIL_CODE_INVALID" });
    await expect(confirmPasskeyEmail(user.id, "add", "Other device", proof, origin)).rejects.toMatchObject({ code: "EMAIL_CODE_INVALID" });
    await expect(confirmPasskeyEmail(user.id, "add", "My phone", proof, origin)).resolves.toMatchObject({ id: user.id });
    await expect(confirmPasskeyEmail(user.id, "add", "My phone", proof, origin)).rejects.toMatchObject({ code: "EMAIL_CODE_INVALID" });
  });
  it("blocks passkey enrollment for demo and unverified accounts", async () => {
    for (const extra of [{ id: `preview_${randomUUID()}` }, { emailVerifiedAt: null }]) {
      const user = await account(undefined, extra);
      await expect(requestPasskeyEmailCode(user.id, "add", "Phone", origin)).rejects.toMatchObject({ code: "EMAIL_ACCOUNT_REQUIRED" });
    }
    expect(delivery.deliverEmailCode).not.toHaveBeenCalled();
  });
  it("rejects management if the account email changes after code delivery", async () => {
    const user = await account(); const f = await requestPasskeyEmailCode(user.id, "add", "Phone", origin);
    await prisma.user.update({ where: { id: user.id }, data: { email: address() } });
    await expect(confirmPasskeyEmail(user.id, "add", "Phone", { token: f.token, code: delivery.deliverEmailCode.mock.calls.at(-1)![1] }, origin)).rejects.toMatchObject({ code: "EMAIL_CODE_INVALID" });
  });
  it("cannot enable the demo on production or a non-preview database", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("WORKSPACE_PREVIEW", "true");
    await expect(signInToDemo()).rejects.toMatchObject({ code: "DEMO_UNAVAILABLE" });
    vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("DATABASE_URL", "postgresql://example.test/production");
    await expect(signInToDemo()).rejects.toMatchObject({ code: "DEMO_UNAVAILABLE" });
  });
});
