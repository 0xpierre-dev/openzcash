// @vitest-environment node
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { buildSourceProposal, buildSourceUpdate } from "@/lib/archive/source-proposals";
import { readPilotPackages } from "@/lib/archive/catalog";
import { EMPTY_SUBMISSION } from "@/lib/domain/proposal-submission";

const databaseUrl = process.env.TREASURY_TEST_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (url.hostname !== "127.0.0.1" || url.port !== (process.env.PARTICIPATE_TEST_PORT ?? "55438") || url.pathname !== "/community_treasury_tests") throw new Error("Requires the named disposable database");
}
const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? "postgresql://unused@127.0.0.1:1/unused" });
let failNotification = false;
const client = prisma.$extends({ query: { discussionNotification: { async createMany({ args, query }) {
  if (failNotification) throw new Error("Synthetic arrival failure");
  return query(args);
} } } });
vi.mock("@/lib/db", () => ({ db: client }));
const { publishArchiveRevision } = await import("@/lib/services/proposal-archives");
const { recordProposalArrival, readDiscussionNotifications, markDiscussionNotificationsRead } = await import("@/lib/services/discussion-notifications");
const { claimPreviewCredits } = await import("@/lib/services/participation-credits");
const { saveProposalSubmission, publishProposalSubmission } = await import("@/lib/services/proposal-submissions");
const inbox = (userId: string, communityId: string, cursor?: string) => readDiscussionNotifications(userId, communityId, cursor, true);
const markRead = (userId: string, communityId: string, input: unknown) => markDiscussionNotificationsRead(userId, communityId, input, true);
const sample = (await readPilotPackages())[0];
const newUser = (data = {}) => prisma.user.create({ data: { nick: `arrival-${randomUUID()}`, passwordHash: "test-only", role: "USER", email: `${randomUUID()}@example.invalid`, emailVerifiedAt: new Date(), ...data } });
const issue = (number = 999401) => ({ number, html_url: `https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/${number}`, title: `Local test application ${number}`, body: "# Synthetic application\n\nPreserved public proposal for notification testing only.", state: "open" as const, created_at: "2026-10-15T09:00:00.000Z", updated_at: "2026-10-15T09:01:00.000Z", user: { login: "test-applicant" }, labels: [{ name: "📋 Grant Application", color: "bbbb55", description: null }, { name: "👀 Ready For ZCG Review", color: "005555", description: null }] });
async function fixture() {
  const roles = ["OWNER", "MANAGER", "REVIEWER", "REVIEWER", "MODERATOR"] as const;
  const members = await Promise.all(roles.map(() => newUser()));
  const host = await prisma.community.create({ data: { name: "Notification host", slug: randomUUID(), createdById: members[0].id } });
  const committee = await prisma.community.create({ data: { name: "Notification committee", kind: "COMMITTEE", slug: randomUUID(), createdById: members[0].id } });
  await prisma.communityMembership.createMany({ data: members.map((m, i) => ({ communityId: committee.id, userId: m.id, role: roles[i] })) });
  const publish = async (source = issue(), revision = 1, previous: string | null = null) => {
    const bundle = await buildSourceProposal(source, source.number, "2026-10-15T10:00:00.000Z", revision, previous);
    return publishArchiveRevision(host.id, bundle.bundle, bundle.manifestHash, committee.id);
  };
  return { members, host, committee, publish };
}

describe.skipIf(!databaseUrl)("New proposal committee inbox", () => {
  beforeEach(() => { failNotification = false; vi.stubEnv("DATABASE_URL", databaseUrl!); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("WORKSPACE_PREVIEW", "true"); vi.stubEnv("PARTICIPATE_PUBLIC_DEMO", "false"); vi.stubEnv("PARTICIPATE_COMMITTEE_ENABLED", "true"); });
  afterEach(() => { failNotification = false; vi.unstubAllEnvs(); });
  afterAll(() => prisma.$disconnect());

  it("notifies all five active members once, excluding disabled, demo, outside and unaccepted users", async () => {
    const f = await fixture();
    const outsider = await newUser(), disabled = await newUser({ status: "DISABLED" }), removed = await newUser(), demo = await newUser({ id: `preview_${randomUUID()}` });
    await prisma.communityMembership.createMany({ data: [
      { communityId: f.committee.id, userId: disabled.id, role: "REVIEWER", status: "ACTIVE" },
      { communityId: f.committee.id, userId: removed.id, role: "REVIEWER", status: "DISABLED" },
      { communityId: f.committee.id, userId: demo.id, role: "REVIEWER", status: "ACTIVE" },
      { communityId: f.host.id, userId: outsider.id, role: "OWNER", status: "ACTIVE" }
    ] });
    await prisma.committeeInvitation.create({ data: { id: randomUUID(), communityId: f.committee.id, email: outsider.email!, role: "REVIEWER", invitedById: f.members[0].id, expiresAt: new Date(Date.now() + 100_000) } });
    const first = await f.publish(); await f.publish();
    const rows = await prisma.discussionNotification.findMany({ where: { archiveId: first.archiveId } });
    expect(rows.map(r => r.recipientId).sort()).toEqual(f.members.map(m => m.id).sort());
    for (const member of f.members) {
      const result = await inbox(member.id, f.host.id);
      expect(result.unreadCount).toBe(1);
      expect(result.items[0]).toMatchObject({ kind: "PROPOSAL_ARRIVED", recordId: "zcg-github-999401", actorLabel: null, commentId: null, read: false });
      expect(JSON.stringify(result)).not.toContain(member.email!);
    }
    expect((await inbox(outsider.id, f.host.id)).items).toHaveLength(0);
    // A later revision, or a member added later, does not replay old arrival alerts.
    const updated = { ...issue(), title: "Updated local application" };
    await prisma.communityMembership.create({ data: { communityId: f.committee.id, userId: outsider.id, role: "REVIEWER" } });
    await f.publish(updated, 2, first.manifestHash);
    expect(await prisma.discussionNotification.count({ where: { archiveId: first.archiveId } })).toBe(5);
  });

  it("keeps read state private and revokes inbox access when membership or operation is disabled", async () => {
    const f = await fixture(); await f.publish();
    const [a, b] = f.members, item = (await inbox(a.id, f.host.id)).items[0];
    expect((await readDiscussionNotifications(a.id, f.host.id)).items).toHaveLength(0);
    expect(await markDiscussionNotificationsRead(a.id, f.host.id, { ids: [item.id] })).toEqual({ updated: 0 });
    expect(await markRead(b.id, f.host.id, { ids: [item.id] })).toEqual({ updated: 0 });
    await expect(inbox(b.id, f.host.id, item.id)).rejects.toMatchObject({ code: "INVALID_NOTIFICATION_CURSOR" });
    expect(await markRead(a.id, f.host.id, { ids: [item.id] })).toEqual({ updated: 1 });
    await f.publish(); expect((await inbox(a.id, f.host.id)).unreadCount).toBe(0);
    expect((await inbox(b.id, f.host.id)).unreadCount).toBe(1);
    await prisma.communityMembership.update({ where: { communityId_userId: { communityId: f.committee.id, userId: a.id } }, data: { status: "DISABLED" } });
    expect((await inbox(a.id, f.host.id)).items).toHaveLength(0);
    vi.stubEnv("PARTICIPATE_COMMITTEE_ENABLED", "false");
    expect((await inbox(b.id, f.host.id)).items).toHaveLength(0);
    expect(await markRead(b.id, f.host.id, { through: new Date().toISOString() })).toEqual({ updated: 0 });
  });

  it("does not confuse historical decisions, approved or withdrawn imports with new reviews", async () => {
    const f = await fixture();
    await publishArchiveRevision(f.host.id, sample.bundle, sample.manifestHash, f.committee.id);
    const approved = await buildSourceUpdate({ ...issue(999402), labels: [{ name: "✅ Grant Approved", color: "004400", description: null }] }, 999402, "2026-10-15T10:00:00.000Z", null, { events: [], comments: [] });
    await publishArchiveRevision(f.host.id, approved.bundle, approved.manifestHash, f.committee.id);
    const source = { ...issue(999403), state: "closed", labels: [{ name: "Grant Withdrawn by Submitter", color: "444444", description: null }] };
    const withdrawn = await buildSourceUpdate(source, source.number, "2026-10-15T10:00:00.000Z", null, { events: [], comments: [] });
    await publishArchiveRevision(f.host.id, withdrawn.bundle, withdrawn.manifestHash, f.committee.id);
    expect((await inbox(f.members[0].id, f.host.id)).items).toHaveLength(0);
  });

  it("rolls back the imported proposal with a notification failure, then recovers once on retry", async () => {
    const f = await fixture(); failNotification = true;
    await expect(f.publish()).rejects.toThrow("Synthetic arrival failure");
    expect(await prisma.proposalArchive.count({ where: { communityId: f.host.id } })).toBe(0);
    failNotification = false; const revision = await f.publish();
    expect(await prisma.discussionNotification.count({ where: { archiveId: revision.archiveId } })).toBe(5);
    const archive = await prisma.proposalArchive.findUniqueOrThrow({ where: { id: revision.archiveId } });
    await Promise.all([1, 2, 3].map(() => prisma.$transaction(tx => recordProposalArrival(tx, archive))));
    expect(await prisma.discussionNotification.count({ where: { archiveId: revision.archiveId } })).toBe(5);
  });

  it("retains recipient, committee and host restrictions through pagination, and marks only the read snapshot", async () => {
    const f = await fixture(); const first = await f.publish();
    const other = await fixture(); await other.publish();
    // Same recipient in a second committee, with older rows: cursor must not cross hosts.
    await prisma.communityMembership.create({ data: { communityId: other.committee.id, userId: f.members[0].id, role: "REVIEWER" } });
    await other.publish(issue(999499));
    for (let i = 0; i < 21; i++) await f.publish(issue(999410 + i));
    const page = await inbox(f.members[0].id, f.host.id);
    expect(page.items).toHaveLength(20); expect(page.unreadCount).toBe(22);
    const rest = await inbox(f.members[0].id, f.host.id, page.nextCursor!);
    expect(rest.items).toHaveLength(2); expect(rest.nextCursor).toBeNull();
    expect([...page.items, ...rest.items].every(item => item.recordId !== "zcg-github-999499")).toBe(true);
    const extra = await f.publish(issue(999450));
    // Explicitly newer than the snapshot, without a wall-clock sleep.
    await prisma.discussionNotification.updateMany({ where: { archiveId: extra.archiveId }, data: { createdAt: new Date(Date.parse(page.asOf) + 1000) } });
    expect(await markRead(f.members[0].id, f.host.id, { through: page.asOf })).toEqual({ updated: 22 });
    expect((await inbox(f.members[0].id, f.host.id)).unreadCount).toBe(1);
    expect(await prisma.discussionNotification.count({ where: { archiveId: first.archiveId, readAt: null } })).toBe(4);
  });

  it("notifies real native publication once and never publishes demo draft alerts", async () => {
    const f = await fixture(), author = await newUser();
    await publishArchiveRevision(f.host.id, sample.bundle, sample.manifestHash, f.committee.id);
    vi.stubEnv("PARTICIPATE_PUBLIC_DEMO", "true"); vi.stubEnv("PARTICIPATE_COMMUNITY_ID", f.host.id); vi.stubEnv("PARTICIPATE_DEMO_COMMITTEE_ID", f.committee.id);
    await claimPreviewCredits(author.id, f.committee.id);
    const payload = { ...EMPTY_SUBMISSION, title: "Local notification publication", applicant: "Local applicant", requestedAmountUsd: "100", forumUrl: "https://forum.zcashcommunity.com/t/testing/12345", body: "# Synthetic application\n\nThis fictional proposal tests private committee alerts, without publishing externally." };
    const draft = await saveProposalSubmission(f.host.id, author.id, { id: randomUUID(), expectedVersion: 0, payload });
    expect((await prisma.discussionNotification.count({ where: { recipientId: { in: f.members.map(m => m.id) } } }))).toBe(0);
    vi.stubEnv("PARTICIPATE_PUBLICATION_MODE", "production");
    const input = { id: draft.id, expectedVersion: draft.version, contentHash: draft.contentHash, priceVersion: 1, requestKey: randomUUID(), consent: true };
    failNotification = true;
    await expect(publishProposalSubmission(f.host.id, author.id, input)).rejects.toThrow("Synthetic arrival failure");
    expect((await prisma.creditAccount.findUniqueOrThrow({ where: { communityId_userId: { communityId: f.committee.id, userId: author.id } } })).balance).toBe(25);
    failNotification = false;
    const result = await publishProposalSubmission(f.host.id, author.id, input); await publishProposalSubmission(f.host.id, author.id, input);
    expect(result.draft.state).toBe("PUBLISHED");
    expect(await prisma.discussionNotification.count({ where: { archive: { communityId: f.host.id } } })).toBe(5);
    // The committee pause still hides private alerts; it is not bypassed by a publication.
    expect((await inbox(f.members[0].id, f.host.id)).items).toHaveLength(0);
    vi.stubEnv("PARTICIPATE_PUBLIC_DEMO", "false");
    expect((await inbox(f.members[0].id, f.host.id)).items[0]).toMatchObject({ recordId: result.draft.recordId, kind: "PROPOSAL_ARRIVED" });
    const demoAuthor = await newUser(); await claimPreviewCredits(demoAuthor.id, f.committee.id);
    const demo = await saveProposalSubmission(f.host.id, demoAuthor.id, { id: randomUUID(), expectedVersion: 0, payload });
    await publishProposalSubmission(f.host.id, demoAuthor.id, { ...input, id: demo.id, contentHash: demo.contentHash, expectedVersion: demo.version });
    expect(await prisma.discussionNotification.count({ where: { archive: { communityId: f.host.id } } })).toBe(5);
  });

  it("enforces the database target constraint for every notification kind", async () => {
    const f = await fixture(); const r = await f.publish();
    await expect(prisma.discussionNotification.create({ data: { kind: "COMMENT_LIKED", recipientId: f.members[0].id, archiveId: r.archiveId } })).rejects.toThrow();
    await expect(prisma.discussionNotification.create({ data: { kind: "PROPOSAL_ARRIVED", recipientId: f.members[0].id, actorId: f.members[1].id } })).rejects.toThrow();
  });
});
