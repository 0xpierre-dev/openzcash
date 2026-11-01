// @vitest-environment node
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { readPilotPackages } from "@/lib/archive/catalog";

const databaseUrl = process.env.TREASURY_TEST_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (url.hostname !== "127.0.0.1" || url.port !== (process.env.PARTICIPATE_TEST_PORT ?? "55438") || url.pathname !== "/community_treasury_tests") throw new Error("Requires the named disposable database");
}
const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? "postgresql://unused@127.0.0.1:1/unused" });
let failNotification = false;
const client = prisma.$extends({ query: { discussionNotification: { async upsert({ args, query }) {
  if (failNotification) throw new Error("Synthetic notification persistence failure");
  return query(args);
} } } });
vi.mock("@/lib/db", () => ({ db: client }));
const { publishArchiveRevision } = await import("@/lib/services/proposal-archives");
const { mutateArchiveDiscussion } = await import("@/lib/services/archive-discussion");
const { claimPreviewCredits } = await import("@/lib/services/participation-credits");
const { readDiscussionNotifications: inbox, markDiscussionNotificationsRead: markRead } = await import("@/lib/services/discussion-notifications");
const sample = (await readPilotPackages())[0];
const session = (user: { id: string; nick: string }) => ({ subjectType: "user" as const, userId: user.id, nick: user.nick, role: "USER" as const });
const newUser = () => prisma.user.create({ data: { nick: `notification-${randomUUID()}`, passwordHash: "test-only", role: "USER", displayName: "Private name", email: `notification-${randomUUID()}@example.invalid`, emailVerifiedAt: new Date() } });
async function fixture() {
  const author = await newUser(), actor = await newUser(), other = await newUser();
  const community = await prisma.community.create({ data: { name: "Notification test", slug: randomUUID(), createdById: author.id, memberships: { create: { userId: author.id, role: "OWNER" } } } });
  const revision = await publishArchiveRevision(community.id, sample.bundle, sample.manifestHash);
  const post = (user = author, body = "A public comment", parentId?: string, requestKey = randomUUID()) => mutateArchiveDiscussion(community.id, sample.manifest.recordId, session(user), "post", { body, parentId, requestKey, policyVersion: 1 });
  const root = await post();
  const like = (user = actor, liked = true, requestKey = randomUUID()) => mutateArchiveDiscussion(community.id, sample.manifest.recordId, session(user), "reaction", { liked, requestKey, policyVersion: 1 }, root.id);
  return { author, actor, other, community, revision, root, post, like };
}
describe.skipIf(!databaseUrl)("Private discussion notifications", () => {
  beforeEach(() => { failNotification = false; vi.stubEnv("DATABASE_URL", databaseUrl!); vi.stubEnv("PARTICIPATE_PUBLIC_DEMO", "false"); vi.stubEnv("WORKSPACE_PREVIEW", "true"); vi.stubEnv("PARTICIPATE_COMMITTEE_ENABLED", "true"); vi.stubEnv("NODE_ENV", "test"); });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(() => prisma.$disconnect());

  it("deduplicates concurrent likes and retries, without charging again on a re-like", async () => {
    const f = await fixture();
    await prisma.community.update({ where: { id: f.community.id }, data: { participationMode: "CREDITS", reactionCost: 1, commentCost: 1 } });
    await claimPreviewCredits(f.actor.id, f.community.id);
    const key = randomUUID();
    await Promise.all([f.like(f.actor, true, key), f.like(f.actor, true, key), f.like()]);
    const first = await inbox(f.author.id, f.community.id);
    expect(first.items).toHaveLength(1); expect(first.unreadCount).toBe(1);
    expect(first.items[0]).toMatchObject({ kind: "COMMENT_LIKED", commentId: f.root.id, recordId: sample.manifest.recordId });
    await markRead(f.author.id, f.community.id, { ids: [first.items[0].id] });
    await f.like(f.actor, false);
    expect((await inbox(f.author.id, f.community.id)).items).toEqual([]);
    await f.like();
    const restored = await inbox(f.author.id, f.community.id);
    expect(restored.items[0]).toMatchObject({ id: first.items[0].id, read: true, createdAt: first.items[0].createdAt });
    expect(restored.unreadCount).toBe(0);
    expect((await prisma.creditAccount.findUniqueOrThrow({ where: { communityId_userId: { communityId: f.community.id, userId: f.actor.id } } })).balance).toBe(24);
  });

  it("notifies only the parent author, links to the reply and excludes self-interactions", async () => {
    const f = await fixture();
    await f.like(f.author);
    await f.post(f.author, "My own follow-up", f.root.id);
    expect((await inbox(f.author.id, f.community.id)).unreadCount).toBe(0);
    const key = randomUUID();
    const [reply, replay] = await Promise.all([f.post(f.actor, "A reply for the author", f.root.id, key), f.post(f.actor, "A reply for the author", f.root.id, key)]);
    expect(reply.id).toBe(replay.id);
    const result = await inbox(f.author.id, f.community.id);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ kind: "COMMENT_REPLIED", commentId: reply.id, excerpt: "A reply for the author" });
    expect((await inbox(f.actor.id, f.community.id)).items).toEqual([]);
    expect((await inbox(f.other.id, f.community.id)).items).toEqual([]);
    expect(await markRead(f.other.id, f.community.id, { ids: [result.items[0].id] })).toEqual({ updated: 0 });
    await expect(inbox(f.other.id, f.community.id, result.items[0].id)).rejects.toMatchObject({ code: "INVALID_NOTIFICATION_CURSOR" });
    expect((await inbox(f.author.id, f.community.id)).unreadCount).toBe(1);
  });

  it("does not leak private profile data or moderated comment bodies", async () => {
    const f = await fixture(); await f.like();
    let result = await inbox(f.author.id, f.community.id);
    expect(result.items[0].actorLabel).toMatch(/^Participant [a-f0-9]{6}$/);
    for (const secret of [f.actor.id, f.actor.nick, f.actor.email!, f.actor.displayName!]) expect(JSON.stringify(result)).not.toContain(secret);
    await prisma.user.update({ where: { id: f.actor.id }, data: { shareProfileInDiscussion: true, displayName: "Shared name" } });
    expect((await inbox(f.author.id, f.community.id)).items[0].actorLabel).toBe("Shared name");
    await prisma.user.update({ where: { id: f.actor.id }, data: { status: "DISABLED" } });
    expect((await inbox(f.author.id, f.community.id)).items[0].actorLabel).toMatch(/^Participant /);
    await mutateArchiveDiscussion(f.community.id, sample.manifest.recordId, session(f.author), "hide", { reason: "Test moderation" }, f.root.id);
    result = await inbox(f.author.id, f.community.id);
    expect(result).toMatchObject({ items: [], unreadCount: 0 });
    await expect(inbox(f.actor.id, f.community.id)).rejects.toMatchObject({ code: "ACCOUNT_UNAVAILABLE" });
  });

  it("replies to an emoji at multiple levels, charges once and notifies its immediate author", async () => {
    const f = await fixture();
    const emoji = await f.post(f.actor, "🛡️", f.root.id);
    await prisma.community.update({ where: { id: f.community.id }, data: { participationMode: "CREDITS", commentCost: 1 } });
    await claimPreviewCredits(f.other.id, f.community.id);
    const key = randomUUID();
    const [reply, retry] = await Promise.all([
      f.post(f.other, "Replying directly to the shield", emoji.id, key),
      f.post(f.other, "Replying directly to the shield", emoji.id, key)
    ]);
    expect(reply.id).toBe(retry.id);
    expect(reply.parentId).toBe(emoji.id);
    expect((await inbox(f.actor.id, f.community.id)).items).toEqual([expect.objectContaining({ commentId: reply.id, kind: "COMMENT_REPLIED" })]);
    expect((await inbox(f.author.id, f.community.id)).items.map(item => item.commentId)).toEqual([emoji.id]);
    expect((await prisma.creditAccount.findUniqueOrThrow({ where: { communityId_userId: { communityId: f.community.id, userId: f.other.id } } })).balance).toBe(24);
    expect(await prisma.archiveComment.count({ where: { archiveId: f.revision.archiveId } })).toBe(3);
    const deeper = await f.post(f.other, "One more level", reply.id);
    expect(deeper.parentId).toBe(reply.id);
    expect((await inbox(f.other.id, f.community.id)).items).toEqual([]);
  });

  it("keeps deep replies inside the same archive and rejects moderated parents", async () => {
    const f = await fixture();
    let parent = f.root;
    for (let depth = 1; depth <= 8; depth++) {
      const reply = await f.post(depth % 2 ? f.actor : f.author, `Depth ${depth}`, parent.id);
      expect(reply.parentId).toBe(parent.id);
      parent = reply;
    }
    const foreign = await fixture();
    await expect(foreign.post(foreign.actor, "Wrong archive", parent.id)).rejects.toMatchObject({ code: "PARENT_COMMENT_NOT_FOUND" });
    const directReply = (archiveId: string) => prisma.archiveComment.create({ data: {
      archiveId, authorId: f.other.id, authorLabel: "Participant", body: "Direct reply", parentId: parent.id, requestKey: randomUUID()
    } });
    await expect(directReply(foreign.revision.archiveId)).rejects.toThrow(/Invalid reply/);
    await expect(prisma.archiveComment.update({ where: { id: parent.id }, data: { parentId: f.root.id } })).rejects.toThrow(/Comment identity is immutable/);
    await expect(prisma.archiveComment.delete({ where: { id: parent.id } })).rejects.toThrow(/Comments must be retained/);
    await mutateArchiveDiscussion(f.community.id, sample.manifest.recordId, session(f.author), "hide", { reason: "Test moderation" }, parent.id);
    await expect(f.post(f.other, "Hidden parent", parent.id)).rejects.toMatchObject({ code: "PARENT_COMMENT_NOT_FOUND" });
    await expect(directReply(f.revision.archiveId)).rejects.toThrow(/Invalid reply/);
    expect(await prisma.archiveComment.count({ where: { archiveId: f.revision.archiveId } })).toBe(9);
  });

  it("rolls back the comment, debit and activity if the notification cannot be saved", async () => {
    const f = await fixture();
    await prisma.community.update({ where: { id: f.community.id }, data: { participationMode: "CREDITS", commentCost: 1 } });
    await claimPreviewCredits(f.actor.id, f.community.id);
    const events = await prisma.archiveActivityEvent.count({ where: { archiveId: f.revision.archiveId } });
    failNotification = true;
    await expect(f.post(f.actor, "Must roll back", f.root.id)).rejects.toThrow("Synthetic notification persistence failure");
    failNotification = false;
    expect(await prisma.archiveComment.count({ where: { archiveId: f.revision.archiveId } })).toBe(1);
    expect(await prisma.archiveActivityEvent.count({ where: { archiveId: f.revision.archiveId } })).toBe(events);
    expect((await inbox(f.author.id, f.community.id)).unreadCount).toBe(0);
    expect((await prisma.creditAccount.findUniqueOrThrow({ where: { communityId_userId: { communityId: f.community.id, userId: f.actor.id } } })).balance).toBe(25);
  });

  it("paginates the private inbox and leaves later arrivals unread when marking a snapshot", async () => {
    const f = await fixture();
    const actors = Array.from({ length: 24 }, () => ({ id: randomUUID(), nick: randomUUID(), passwordHash: "test-only", role: "USER" as const }));
    await prisma.user.createMany({ data: actors });
    await prisma.discussionNotification.createMany({ data: actors.slice(0, 23).map(actor => ({ kind: "COMMENT_LIKED", actorId: actor.id, recipientId: f.author.id, commentId: f.root.id, createdAt: new Date(Date.now() - 60000) })) });
    const first = await inbox(f.author.id, f.community.id);
    const next = await inbox(f.author.id, f.community.id, first.nextCursor!);
    expect(first.items).toHaveLength(20); expect(next.items).toHaveLength(3); expect(next.nextCursor).toBeNull();
    expect(new Set([...first.items, ...next.items].map(item => item.id)).size).toBe(23);
    await prisma.discussionNotification.create({ data: { kind: "COMMENT_LIKED", actorId: actors[23].id, recipientId: f.author.id, commentId: f.root.id, createdAt: new Date(new Date(first.asOf).getTime() + 1) } });
    expect(await markRead(f.author.id, f.community.id, { through: first.asOf })).toEqual({ updated: 23 });
    expect((await inbox(f.author.id, f.community.id)).unreadCount).toBe(1);
    const other = await fixture();
    expect((await inbox(f.author.id, other.community.id)).items).toEqual([]);
  });

  it("enforces verified-account and configured-host boundaries in the public pilot", async () => {
    const f = await fixture(); await f.like();
    vi.stubEnv("PARTICIPATE_PUBLIC_DEMO", "true"); vi.stubEnv("PARTICIPATE_COMMUNITY_ID", f.community.id); vi.stubEnv("PARTICIPATE_DEMO_COMMITTEE_ID", "another-committee");
    expect((await inbox(f.author.id, f.community.id)).items).toEqual([]);
    await expect(inbox(f.author.id, "different-host")).rejects.toMatchObject({ code: "forbidden" });
    await prisma.user.update({ where: { id: f.author.id }, data: { emailVerifiedAt: null } });
    await expect(inbox(f.author.id, f.community.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(markRead(f.author.id, f.community.id, { ids: ["guess"] })).rejects.toMatchObject({ code: "forbidden" });
  });
});
