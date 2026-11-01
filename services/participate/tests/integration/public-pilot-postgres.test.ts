// @vitest-environment node
import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { readPilotPackages } from "@/lib/archive/catalog";
import { buildSourceProposal } from "@/lib/archive/source-proposals";
import { decodeFile, verifyArchivePackage } from "@/lib/archive/format";
import { EMPTY_SUBMISSION } from "@/lib/domain/proposal-submission";
import { committeeOperationsEnabled } from "@/lib/auth/committee-policy";

const databaseUrl = process.env.TREASURY_TEST_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (url.hostname !== "127.0.0.1" || url.port !== (process.env.PARTICIPATE_TEST_PORT ?? "55438") || url.pathname !== "/community_treasury_tests") throw new Error("Requires the named disposable database");
}
const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? "postgresql://unused@127.0.0.1:1/unused" });
vi.mock("@/lib/db", () => ({ db: prisma }));
const observer = vi.hoisted(() => vi.fn());
vi.mock("@/lib/zcash/credit-payment-observer", () => ({ getCreditPaymentObserver: observer }));
const { publishArchiveRevision } = await import("@/lib/services/proposal-archives");
const { claimPreviewCredits, readAccountCredits, isParticipationCreditSandbox } = await import("@/lib/services/participation-credits");
const { saveProposalSubmission, publishDemoSubmission, listOwnSubmissions } = await import("@/lib/services/proposal-submissions");
const { readArchiveDiscussion, readProposalParticipationBoard, mutateArchiveDiscussion, setArchiveProposalLike } = await import("@/lib/services/archive-discussion");
const { readDiscussionNotifications, markDiscussionNotificationsRead } = await import("@/lib/services/discussion-notifications");
const { readCommitteeEntry } = await import("@/lib/services/committee-access");
const { createCreditPurchase } = await import("@/lib/services/credit-purchases");
const { signInToDemo } = await import("@/lib/services/email-auth");
const { unlockPilotModeration, unlockCommitteePreview } = await import("@/lib/auth/committee-admin");
const { importSourceProposal } = await import("@/lib/services/source-intake");
const sample = (await readPilotPackages())[0];
const payload = { ...EMPTY_SUBMISSION, title: "Public pilot acceptance proposal", applicant: "Public test team", requestedAmountUsd: "1250.25",
  forumUrl: "https://forum.zcashcommunity.com/t/pilot-proposal/12345",
  body: "## Work\n\nA public demo proposal with reproducible results, a clear budget and two milestones. The original files stay intact.\n" };
const session = (user: { id: string; nick: string }) => ({ subjectType: "user" as const, userId: user.id, nick: user.nick, role: "USER" as const });
async function createUser(verified = true, shared = false) {
  return prisma.user.create({ data: { ...(shared ? { id: `preview_${randomUUID()}` } : {}), nick: `pilot-${randomUUID()}`, email: `pilot-${randomUUID()}@example.invalid`, emailVerifiedAt: verified ? new Date() : null, passwordHash: "test-only", role: "USER" } });
}
async function fixture() {
  const author = await createUser(), other = await createUser();
  const host = await prisma.community.create({ data: { name: "Public pilot host", slug: randomUUID(), createdById: author.id } });
  const committee = await prisma.community.create({ data: { name: "Public pilot committee", kind: "COMMITTEE", slug: randomUUID(), createdById: author.id, participationMode: "CREDITS", commentCost: 1, reactionCost: 1 } });
  await publishArchiveRevision(host.id, sample.bundle, sample.manifestHash, committee.id);
  vi.stubEnv("PARTICIPATE_COMMUNITY_ID", host.id);
  vi.stubEnv("PARTICIPATE_DEMO_COMMITTEE_ID", committee.id);
  const save = (userId = author.id) => saveProposalSubmission(host.id, userId, { id: randomUUID(), expectedVersion: 0, payload });
  const publish = (draft: Awaited<ReturnType<typeof save>>, userId = author.id, requestKey = randomUUID()) => publishDemoSubmission(host.id, userId, { id: draft.id, expectedVersion: draft.version, contentHash: draft.contentHash, priceVersion: 1, requestKey, consent: true });
  const balance = async () => (await readAccountCredits(author.id, committee.id)).accounts[0].balance;
  return { author, other, host, committee, save, publish, balance };
}

describe.skipIf(!databaseUrl)("Public free pilot under production guards", () => {
  beforeEach(() => {
    observer.mockClear();
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("WORKSPACE_PREVIEW", "false");
    vi.stubEnv("PARTICIPATE_PUBLIC_DEMO", "true"); vi.stubEnv("APP_BASE_URL", "https://participate.example.org");
    vi.stubEnv("PARTICIPATE_COMMITTEE_ENABLED", "true"); // Public demo must override this.
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(() => prisma.$disconnect());

  it.each(["demo", "production"] as const)("runs %s publication → comment → like → recovery without payments or automatic native anchors", async mode => {
    vi.stubEnv("PARTICIPATE_PUBLICATION_MODE", mode);
    const f = await fixture();
    expect(isParticipationCreditSandbox()).toBe(false);
    const before = await prisma.archiveRevision.findFirstOrThrow({ where: { archive: { communityId: f.host.id } } });
    const grants = await Promise.all([1, 2, 3].map(() => claimPreviewCredits(f.author.id, f.committee.id)));
    expect(grants.filter(grant => !grant.replayed)).toHaveLength(1);
    expect(await f.balance()).toBe(25);
    expect((await readAccountCredits(f.other.id, f.committee.id)).accounts[0].balance).toBe(0);
    const draft = await f.save();
    expect(await listOwnSubmissions(f.host.id, f.other.id)).toEqual([]);
    expect((await readProposalParticipationBoard(f.host.id, null)).proposals).toHaveLength(1);
    const requestKey = randomUUID();
    const results = await Promise.all([1, 2, 3].map(() => f.publish(draft, f.author.id, requestKey)));
    expect(new Set(results.map(result => result.draft.recordId)).size).toBe(1);
    expect(await f.balance()).toBe(5);
    const recordId = results[0].draft.recordId!;
    const actor = session(f.author), commentKey = randomUUID(), likeKey = randomUUID();
    for (let i = 0; i < 2; i++) {
      await mutateArchiveDiscussion(f.host.id, recordId, actor, "post", { body: "A reproducible public comment.", requestKey: commentKey, policyVersion: 1 });
      await setArchiveProposalLike(f.host.id, recordId, actor, { liked: true, requestKey: likeKey, policyVersion: 1 });
    }
    expect(await f.balance()).toBe(3);
    expect((await readProposalParticipationBoard(f.host.id, null)).proposals.find(row => row.recordId === recordId)).toMatchObject({ likes: 1, commentCount: 1 });
    expect(await readCommitteeEntry(f.host.id, f.author.id)).toBeNull();
    expect(committeeOperationsEnabled()).toBe(false);
    await expect(f.publish(await f.save())).rejects.toMatchObject({ code: "INSUFFICIENT_PARTICIPATION_CREDITS" });
    const history = (await readAccountCredits(f.author.id, f.committee.id)).history;
    expect(history.map(row => row.delta).sort((a, b) => a - b)).toEqual([-20, -1, -1, 25]);
    const revision = await prisma.archiveRevision.findFirstOrThrow({ where: { archive: { communityId: f.host.id, recordId } } });
    const verified = await verifyArchivePackage(JSON.parse(revision.packageJson), revision.manifestHash);
    expect(new TextDecoder().decode(decodeFile(verified.bundle.files.find(file => file.path === "proposal.md")!))).toBe(payload.body);
    const application = JSON.parse(new TextDecoder().decode(decodeFile(verified.bundle.files.find(file => file.path === "application.json")!)));
    expect(application).toMatchObject({ externalReview: "NOT_SUBMITTED", publication: mode === "production" ? "COMMUNITY_PUBLICATION" : "PILOT_DEMO" });
    expect(results[0].draft.state).toBe(mode === "production" ? "PUBLISHED" : "PUBLISHED_DEMO");
    const publicBoard = await readProposalParticipationBoard(f.host.id, null);
    expect(publicBoard.publicationMode).toBe(mode);
    expect(publicBoard.proposals.find(row => row.recordId === recordId)?.application?.publication).toBe(application.publication);
    await expect(prisma.proposalSubmission.update({ where: { id: draft.id }, data: { state: "DRAFT" } })).rejects.toThrow();
    expect(revision.packageJson).not.toContain(f.author.email);
    expect(await prisma.archiveAnchor.count({ where: { revisionId: revision.id } })).toBe(0);
    expect(await prisma.archiveRevision.findUnique({ where: { id: before.id } })).toEqual(before);
    expect(observer).not.toHaveBeenCalled();
  });

  it("keeps two public participants' balances and notifications separate without scheduling a native anchor", async () => {
    vi.stubEnv("PARTICIPATE_PUBLICATION_MODE", "production");
    const f = await fixture();
    await claimPreviewCredits(f.author.id, f.committee.id);
    await claimPreviewCredits(f.other.id, f.committee.id);
    const published = await f.publish(await f.save());
    const recordId = published.draft.recordId!;
    const root = await mutateArchiveDiscussion(f.host.id, recordId, session(f.author), "post", {
      body: "Feedback on my public demo proposal.", requestKey: randomUUID(), policyVersion: 1
    });
    const replyRequest = { body: "A reply from a separate participant.", parentId: root.id, requestKey: randomUUID(), policyVersion: 1 };
    const [reply, replay] = await Promise.all([1, 2].map(() => mutateArchiveDiscussion(f.host.id, recordId, session(f.other), "post", replyRequest)));
    expect(replay.id).toBe(reply.id);
    const reaction = { liked: true, requestKey: randomUUID(), policyVersion: 1 };
    await Promise.all([1, 2].map(() => mutateArchiveDiscussion(f.host.id, recordId, session(f.other), "reaction", reaction, root.id)));

    const authorInbox = await readDiscussionNotifications(f.author.id, f.host.id);
    expect(authorInbox.unreadCount).toBe(2);
    expect(authorInbox.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "COMMENT_REPLIED", recordId, commentId: reply.id }),
      expect.objectContaining({ kind: "COMMENT_LIKED", recordId, commentId: root.id })
    ]));
    expect((await readDiscussionNotifications(f.other.id, f.host.id)).items).toEqual([]);
    const ids = authorInbox.items.map(item => item.id);
    expect(await markDiscussionNotificationsRead(f.other.id, f.host.id, { ids })).toEqual({ updated: 0 });
    expect((await readDiscussionNotifications(f.author.id, f.host.id)).unreadCount).toBe(2);
    expect(await markDiscussionNotificationsRead(f.author.id, f.host.id, { ids })).toEqual({ updated: 2 });
    expect((await readDiscussionNotifications(f.author.id, f.host.id)).unreadCount).toBe(0);

    // Fresh database reads establish persisted balances and discussion counts.
    expect(await f.balance()).toBe(4);
    const otherCredits = await readAccountCredits(f.other.id, f.committee.id);
    expect(otherCredits.accounts[0].balance).toBe(23);
    expect(otherCredits.history.map(row => row.delta).sort((a, b) => a - b)).toEqual([-1, -1, 25]);
    const board = await readProposalParticipationBoard(f.host.id, null);
    expect(board.proposals.find(row => row.recordId === recordId)?.commentCount).toBe(2);
    expect(await readCommitteeEntry(f.host.id, f.other.id)).toBeNull();
    expect(await prisma.participateAutomationJob.count({ where: { hostId: f.host.id } })).toBe(0);
    expect(await prisma.archiveAnchor.count({ where: { revision: { archive: { communityId: f.host.id, recordId } } } })).toBe(0);
    expect(await prisma.creditPurchase.count({ where: { communityId: f.committee.id } })).toBe(0);
    expect(observer).not.toHaveBeenCalled();
  });

  it("rejects shared or unverified accounts, including restoring a previously charged like", async () => {
    const f = await fixture();
    for (const user of [await createUser(false), await createUser(true, true)]) {
      expect((await readProposalParticipationBoard(f.host.id, session(user))).canParticipate).toBe(false);
      await expect(claimPreviewCredits(user.id, f.committee.id)).rejects.toMatchObject({ code: "VERIFIED_EMAIL_REQUIRED" });
      await expect(f.save(user.id)).rejects.toMatchObject({ code: "VERIFIED_EMAIL_REQUIRED" });
      await expect(setArchiveProposalLike(f.host.id, sample.manifest.recordId, session(user), { liked: true, requestKey: randomUUID(), policyVersion: 1 })).rejects.toMatchObject({ code: "forbidden" });
    }
    await claimPreviewCredits(f.author.id, f.committee.id);
    const result = await f.publish(await f.save()), recordId = result.draft.recordId!;
    await setArchiveProposalLike(f.host.id, recordId, session(f.author), { liked: true, requestKey: randomUUID(), policyVersion: 1 });
    await setArchiveProposalLike(f.host.id, recordId, session(f.author), { liked: false, requestKey: randomUUID(), policyVersion: 1 });
    await prisma.user.update({ where: { id: f.author.id }, data: { emailVerifiedAt: null } });
    await expect(setArchiveProposalLike(f.host.id, recordId, session(f.author), { liked: true, requestKey: randomUUID(), policyVersion: 1 })).rejects.toMatchObject({ code: "forbidden" });
    expect((await readArchiveDiscussion(f.host.id, recordId, session(f.author))).capabilities.canPost).toBe(false);
    expect(await f.balance()).toBe(4);
  });

  it("moderates with scoped admin elevation while preserving the original record and keeping committee operations closed", async () => {
    const f = await fixture();
    vi.stubEnv("ZCAP_SESSION_SECRET", "synthetic-test-key-at-least-32-bytes-long");
    await claimPreviewCredits(f.author.id, f.committee.id);
    const recordId = sample.manifest.recordId;
    const comment = await mutateArchiveDiscussion(f.host.id, recordId, session(f.author), "post", { body: "Original public content kept in its immutable record.", requestKey: randomUUID(), policyVersion: 1 });
    const archive = await prisma.proposalArchive.findUniqueOrThrow({ where: { communityId_recordId: { communityId: f.host.id, recordId } } });
    const before = await prisma.archiveActivityEvent.findMany({ where: { archiveId: archive.id }, orderBy: { sequence: "asc" } });
    const revision = await prisma.archiveRevision.findFirstOrThrow({ where: { archiveId: archive.id } });
    const password = "Synthetic moderation test password";
    await prisma.user.update({ where: { id: f.other.id }, data: { role: "ADMIN", passwordHash: await hash(password, 4) } });
    const actor = { ...session(f.other), role: "ADMIN" as const }, reason = { reason: "Spam during pilot acceptance test" };
    const preview = await unlockCommitteePreview(f.other.id, f.host.id, { password });
    for (const token of [undefined, preview, "forged"]) await expect(mutateArchiveDiscussion(f.host.id, recordId, actor, "hide", reason, comment.id, token)).rejects.toMatchObject({ code: "forbidden" });
    const token = await unlockPilotModeration(f.other.id, { password });
    await expect(mutateArchiveDiscussion(f.host.id, recordId, session(f.author), "hide", reason, comment.id, token)).rejects.toMatchObject({ code: "forbidden" });
    expect((await readArchiveDiscussion(f.host.id, recordId, actor, token)).capabilities.canModerate).toBe(true);
    const hidden = await mutateArchiveDiscussion(f.host.id, recordId, actor, "hide", reason, comment.id, token);
    await mutateArchiveDiscussion(f.host.id, recordId, actor, "hide", reason, comment.id, token);
    expect(hidden).toMatchObject({ hidden: true, body: null, moderation: { reason: reason.reason } });
    expect((await readArchiveDiscussion(f.host.id, recordId, null)).comments[0]).toMatchObject({ hidden: true, body: null });
    expect((await prisma.archiveComment.findUniqueOrThrow({ where: { id: comment.id } })).body).toBe("Original public content kept in its immutable record.");
    const after = await prisma.archiveActivityEvent.findMany({ where: { archiveId: archive.id }, orderBy: { sequence: "asc" } });
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after).toHaveLength(before.length + 1);
    expect(JSON.parse(after.at(-1)!.eventJson)).toMatchObject({ kind: "COMMENT_HIDDEN", commentId: comment.id, reason: reason.reason });
    expect(await prisma.archiveRevision.findUnique({ where: { id: revision.id } })).toEqual(revision);
    expect(await f.balance()).toBe(24); // Moderation neither charges nor refunds.
    expect(await readCommitteeEntry(f.host.id, f.other.id, token)).toBeNull();
    expect(committeeOperationsEnabled()).toBe(false);
    expect(await prisma.communityMembership.count({ where: { userId: f.other.id } })).toBe(0);
    expect(observer).not.toHaveBeenCalled();
  });

  it("imports a new complete official application once, shows pending review and recovers every byte before anchoring", async () => {
    const f = await fixture(), number = 99901;
    const issue = { number, html_url: `https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/${number}`, title: "Source intake acceptance", user: { login: "public-applicant" },
      body: "# Full proposal\r\n\r\n## Milestones\r\n1. A reproducible build\r\n2. Public documentation\r\n\r\n## Budget\r\n$12,345.67 USD\r\n", state: "open", created_at: "2026-10-08T10:00:00.000Z", updated_at: "2026-10-09T10:00:00.000Z",
      labels: [{ name: "📋 Grant Application", color: "bfbf4d", description: null }, { name: "👀 Ready For ZCG Review", color: "105556", description: null }] };
    const checked = await buildSourceProposal(issue, number, "2026-10-10T12:00:00.000Z");
    const first = await importSourceProposal(checked.bundle, checked.manifestHash);
    expect((await importSourceProposal(checked.bundle, checked.manifestHash)).id).toBe(first.id);
    const board = await readProposalParticipationBoard(f.host.id, null);
    const item = board.proposals.find(row => row.recordId === checked.manifest.recordId)!;
    expect(item.sourceCapture?.proposal).toMatchObject({ outcome: "under_review", applicant: "public-applicant" });
    expect(item.likes).toBe(0); expect(item.commentCount).toBe(0);
    const recovered = await verifyArchivePackage(JSON.parse(first.packageJson), first.manifestHash);
    expect(new TextDecoder().decode(decodeFile(recovered.bundle.files.find(file => file.path === "proposal.md")!))).toBe(issue.body);
    const changed = await buildSourceProposal({ ...issue, body: issue.body + "Updated scope" }, number, "2026-10-10T13:00:00.000Z");
    await expect(importSourceProposal(changed.bundle, changed.manifestHash)).rejects.toThrow("immutable revision");
    const next = await buildSourceProposal({ ...issue, body: issue.body + "Updated scope" }, number, "2026-10-10T13:00:00.000Z", 2, first.manifestHash);
    const revised = await importSourceProposal(next.bundle, next.manifestHash);
    expect(revised.revision).toBe(2);
    expect(await prisma.archiveRevision.findUnique({ where: { id: first.id } })).toEqual(first);
    expect(await prisma.archiveAnchor.count({ where: { revisionId: { in: [first.id, revised.id] } } })).toBe(0);
    expect(await prisma.creditOperation.count({ where: { communityId: f.committee.id } })).toBe(0);
    expect(observer).not.toHaveBeenCalled();
  });

  it("fails closed for disabled or mismatched configuration and never creates a purchase", async () => {
    const f = await fixture();
    await expect(claimPreviewCredits(f.author.id, f.host.id)).rejects.toMatchObject({ code: "PARTICIPATION_CREDITS_UNAVAILABLE" });
    await expect(createCreditPurchase(f.author.id, { communityId: f.committee.id, requestKey: randomUUID() })).rejects.toMatchObject({ code: "CREDIT_DEMO_ONLY" });
    await expect(signInToDemo()).rejects.toMatchObject({ code: "DEMO_UNAVAILABLE" });
    const draft = await f.save();
    vi.stubEnv("PARTICIPATE_COMMUNITY_ID", "wrong-host");
    await expect(claimPreviewCredits(f.author.id, f.committee.id)).rejects.toMatchObject({ code: "COMMUNITY_NOT_FOUND" });
    await expect(f.publish(draft)).rejects.toMatchObject({ code: "DEMO_PUBLICATION_ONLY" });
    vi.stubEnv("PARTICIPATE_COMMUNITY_ID", f.host.id);
    vi.stubEnv("PARTICIPATE_PUBLIC_DEMO", "false");
    await expect(claimPreviewCredits(f.author.id, f.committee.id)).rejects.toMatchObject({ code: "PARTICIPATION_CREDITS_UNAVAILABLE" });
    await expect(f.publish(draft)).rejects.toMatchObject({ code: "DEMO_PUBLICATION_ONLY" });
    expect(await prisma.creditPurchase.count({ where: { communityId: f.committee.id } })).toBe(0);
    expect(await prisma.creditOperation.count({ where: { communityId: f.committee.id } })).toBe(0);
    expect(observer).not.toHaveBeenCalled();
  });
});
