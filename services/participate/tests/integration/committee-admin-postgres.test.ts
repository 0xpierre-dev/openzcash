// @vitest-environment node
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.TREASURY_TEST_DATABASE_URL;
if (databaseUrl) { const url = new URL(databaseUrl); if (url.hostname !== "127.0.0.1" || url.port !== (process.env.PARTICIPATE_TEST_PORT ?? "55438") || url.pathname !== "/community_treasury_tests") throw new Error("Only the isolated local test database is permitted"); }
const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? "postgresql://unused@127.0.0.1:1/unused" });
vi.mock("@/lib/db", () => ({ db: prisma }));
const { unlockCommitteePreview, verifyCommitteePreview, unlockPilotModeration, verifyPilotModeration } = await import("@/lib/auth/committee-admin");
const password = "Synthetic admin password, only for tests";
async function admin() {
  return prisma.user.create({ data: { nick: randomUUID(), email: `${randomUUID()}@example.test`, emailVerifiedAt: new Date(), role: "ADMIN", passwordHash: await hash(password, 4) } });
}

describe.skipIf(!databaseUrl)("Password-protected committee preview", () => {
  beforeEach(() => vi.stubEnv("ZCAP_SESSION_SECRET", "synthetic-test-key-at-least-32-bytes-long"));
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
  afterAll(() => prisma.$disconnect());

  it("binds the grant to the authenticated admin, host and current password", async () => {
    const user = await admin(), other = await admin();
    const token = await unlockCommitteePreview(user.id, "host-a", { password });
    expect(await verifyCommitteePreview(user.id, "host-a", token)).toBe(true);
    expect(await verifyCommitteePreview(other.id, "host-a", token)).toBe(false);
    expect(await verifyCommitteePreview(user.id, "host-b", token)).toBe(false);
    expect(await verifyCommitteePreview(undefined, "host-a", token)).toBe(false);
    const pieces = token.split("."); pieces[1] = Buffer.from(JSON.stringify({ sub: other.id, hostId: "host-b" })).toString("base64url");
    expect(await verifyCommitteePreview(other.id, "host-b", pieces.join("."))).toBe(false);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hash("rotated test-only password", 4) } });
    expect(await verifyCommitteePreview(user.id, "host-a", token)).toBe(false);
    expect(await prisma.communityMembership.count({ where: { userId: user.id } })).toBe(0);
  });

  it.each([{ role: "USER" as const }, { status: "DISABLED" as const }, { emailVerifiedAt: null }, { passwordHash: "" }])("revokes access immediately when account state changes: %j", async change => {
    const user = await admin(), token = await unlockCommitteePreview(user.id, "host", { password });
    await prisma.user.update({ where: { id: user.id }, data: change });
    expect(await verifyCommitteePreview(user.id, "host", token)).toBe(false);
    await expect(unlockCommitteePreview(user.id, "host", { password })).rejects.toMatchObject({ code: "ADMIN_ACCESS_DENIED" });
  });

  it("rejects demo administrators, injected identities, oversized input and missing secrets", async () => {
    const user = await admin();
    await prisma.user.create({ data: { id: `preview_${randomUUID()}`, nick: randomUUID(), role: "ADMIN", passwordHash: user.passwordHash } }).then(async demo => {
      await expect(unlockCommitteePreview(demo.id, "host", { password })).rejects.toMatchObject({ code: "ADMIN_ACCESS_DENIED" });
    });
    for (const body of [{ password, userId: user.id }, { password: "é".repeat(40) }, { password: "x".repeat(73) }]) await expect(unlockCommitteePreview(user.id, "host", body)).rejects.toThrow();
    vi.stubEnv("ZCAP_SESSION_SECRET", undefined);
    await expect(unlockCommitteePreview(user.id, "host", { password })).rejects.toMatchObject({ code: "ADMIN_ACCESS_UNAVAILABLE" });
  });

  it("commits failed attempts and enforces the limit across concurrent requests", async () => {
    const user = await admin();
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => unlockCommitteePreview(user.id, "host", { password: "wrong" })));
    const codes = results.map(result => result.status === "rejected" ? result.reason.code : "unexpected-success");
    expect(codes.filter(code => code === "ADMIN_ACCESS_DENIED")).toHaveLength(5);
    expect(codes.filter(code => code === "ADMIN_RATE_LIMITED")).toHaveLength(3);
    expect(await prisma.passkeyThrottle.findUnique({ where: { id: `committee-admin:${user.id}` } })).toMatchObject({ attempts: 5 });
    await expect(unlockCommitteePreview(user.id, "host", { password })).rejects.toMatchObject({ code: "ADMIN_RATE_LIMITED" });
    await prisma.passkeyThrottle.update({ where: { id: `committee-admin:${user.id}` }, data: { resetsAt: new Date(Date.now() - 1) } });
    expect(await verifyCommitteePreview(user.id, "host", await unlockCommitteePreview(user.id, "host", { password }))).toBe(true);
  });

  it("expires the read-only grant after fifteen minutes", async () => {
    const user = await admin(), token = await unlockCommitteePreview(user.id, "host", { password });
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(Date.now() + 901000);
    expect(await verifyCommitteePreview(user.id, "host", token)).toBe(false);
  });
});

describe.skipIf(!databaseUrl)("Scoped pilot moderation grant", () => {
  beforeEach(() => {
    vi.stubEnv("ZCAP_SESSION_SECRET", "synthetic-test-key-at-least-32-bytes-long");
    vi.stubEnv("PARTICIPATE_PUBLIC_DEMO", "true"); vi.stubEnv("PARTICIPATE_COMMUNITY_ID", "host"); vi.stubEnv("PARTICIPATE_DEMO_COMMITTEE_ID", "committee");
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
  it("separates moderation from preview and binds host, committee, account and live configuration", async () => {
    const user = await admin(), other = await admin();
    const token = await unlockPilotModeration(user.id, { password });
    const preview = await unlockCommitteePreview(user.id, "host", { password });
    expect(await verifyPilotModeration(user.id, "host", "committee", token)).toBe(true);
    for (const [id, host, committee, grant] of [[other.id, "host", "committee", token], [user.id, "other", "committee", token], [user.id, "host", "other", token], [user.id, "host", "committee", preview], [user.id, "host", "committee", undefined]]) {
      expect(await verifyPilotModeration(id, host!, committee!, grant)).toBe(false);
    }
    expect(await verifyCommitteePreview(user.id, "host", token)).toBe(false);
    vi.stubEnv("PARTICIPATE_PUBLIC_DEMO", "false");
    expect(await verifyPilotModeration(user.id, "host", "committee", token)).toBe(false);
    await expect(unlockPilotModeration(user.id, { password })).rejects.toMatchObject({ code: "ADMIN_ACCESS_UNAVAILABLE" });
  });
  it("expires and revokes moderation when the admin password or role changes", async () => {
    const user = await admin(), token = await unlockPilotModeration(user.id, { password });
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(Date.now() + 901_000);
    expect(await verifyPilotModeration(user.id, "host", "committee", token)).toBe(false);
    vi.useRealTimers();
    await prisma.user.update({ where: { id: user.id }, data: { role: "USER" } });
    expect(await verifyPilotModeration(user.id, "host", "committee", token)).toBe(false);
    await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN", passwordHash: await hash("new synthetic test password", 4) } });
    expect(await verifyPilotModeration(user.id, "host", "committee", token)).toBe(false);
  });
  it("shares failed attempts between preview and moderation", async () => {
    const user = await admin();
    for (let i = 0; i < 5; i++) await expect((i % 2 ? unlockCommitteePreview(user.id, "host", { password: "wrong" }) : unlockPilotModeration(user.id, { password: "wrong" }))).rejects.toMatchObject({ code: "ADMIN_ACCESS_DENIED" });
    await expect(unlockPilotModeration(user.id, { password })).rejects.toMatchObject({ code: "ADMIN_RATE_LIMITED" });
    await expect(unlockCommitteePreview(user.id, "host", { password })).rejects.toMatchObject({ code: "ADMIN_RATE_LIMITED" });
  });
});
