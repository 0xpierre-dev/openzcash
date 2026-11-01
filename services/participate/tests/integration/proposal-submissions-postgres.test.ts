// @vitest-environment node
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { readPilotPackages } from "@/lib/archive/catalog";
import { verifyArchivePackage, decodeFile } from "@/lib/archive/format";
import { verifyActivityBundle } from "@/lib/archive/activity";
import { signingKey, signingContext } from "@/tests/helpers/signed-decision";
import { EMPTY_SUBMISSION } from "@/lib/domain/proposal-submission";

const databaseUrl = process.env.TREASURY_TEST_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (url.hostname !== "127.0.0.1" || url.port !== (process.env.PARTICIPATE_TEST_PORT ?? "55438") || url.pathname !== "/community_treasury_tests") throw new Error("Requires the named disposable database");
}
const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? "postgresql://unused@127.0.0.1:1/unused" });
let rejectAbandonment = false;
const client = prisma.$extends({ query: { proposalArchive: { async create({ args, query }) {
  if (args.data.title === "Rollback publication fixture") throw new Error("Test failure after credit debit");
  return query(args);
} }, proposalAbandonment: { async create({ args, query }) {
  if (rejectAbandonment) throw new Error("Test failure after abandonment event");
  return query(args);
} } } });
vi.mock("@/lib/db", () => ({ db: client }));
const { publishArchiveRevision } = await import("@/lib/services/proposal-archives");
const { claimPreviewCredits } = await import("@/lib/services/participation-credits");
const { listOwnSubmissions, saveProposalSubmission, publishDemoSubmission, deleteProposalDraft, abandonProposalSubmission } = await import("@/lib/services/proposal-submissions");
const { readProposalParticipationBoard, mutateArchiveDiscussion, setArchiveProposalLike } = await import("@/lib/services/archive-discussion");
const { readArchiveActivity, readActivityReceipt, prepareActivityBatch, exportActivityBatch } = await import("@/lib/services/activity-anchors");
const { createDecisionRound, beginDecisionSignature, finishDecisionSignature, readSignedDecisions, readDecisionReceipt } = await import("@/lib/services/signed-decisions");
const { readCommitteeWorkspace } = await import("@/lib/services/committee");
const sample = (await readPilotPackages())[0];
const payload = { ...EMPTY_SUBMISSION, title: "A native proposal for Zcash", applicant: "Public team", requestedAmountUsd: "1250.25",
  forumUrl: "https://forum.zcashcommunity.com/t/pilot-proposal/12345",
  body: "## Work\n\nPreserve this exact public proposal, with reproducible results, a clear budget, and two milestones.\n\n  Keep whitespace.\n" };

async function fixture() {
  const owner = await prisma.user.create({ data: { nick: `submission-owner-${randomUUID()}`, passwordHash: "test-only", role: "USER" } });
  const author = await prisma.user.create({ data: { nick: `submission-author-${randomUUID()}`, email: `private-${randomUUID()}@example.invalid`, passwordHash: "test-only", role: "USER" } });
  const host = await prisma.community.create({ data: { name: "Submission host", slug: randomUUID(), createdById: owner.id } });
  const committee = await prisma.community.create({ data: { name: "ZCG test committee", kind: "COMMITTEE", slug: randomUUID(), createdById: owner.id, participationMode: "CREDITS" } });
  await publishArchiveRevision(host.id, sample.bundle, sample.manifestHash, committee.id);
  await claimPreviewCredits(author.id, committee.id);
  const balance = async () => (await prisma.creditAccount.findUniqueOrThrow({ where: { communityId_userId: { communityId: committee.id, userId: author.id } } })).balance;
  const save = (overrides = {}) => saveProposalSubmission(host.id, author.id, { id: randomUUID(), expectedVersion: 0, payload: { ...payload, ...overrides } });
  const remove = (draft: Awaited<ReturnType<typeof save>>, overrides = {}) => deleteProposalDraft(host.id, author.id, { id: draft.id, expectedVersion: draft.version, consent: true, ...overrides });
  const abandon = (draft: Awaited<ReturnType<typeof save>>, overrides = {}) => abandonProposalSubmission(host.id, author.id, { id: draft.id, contentHash: draft.contentHash, reason: "The team cannot meet the planned milestones.", requestKey: randomUUID(), consent: true, ...overrides });
  const publish = (draft: Awaited<ReturnType<typeof save>>, overrides = {}) => publishDemoSubmission(host.id, author.id, {
    id: draft.id, expectedVersion: draft.version, contentHash: draft.contentHash, priceVersion: 1, requestKey: randomUUID(), consent: true, ...overrides
  });
  return { owner, author, host, committee, balance, save, publish, remove, abandon };
}

describe.skipIf(!databaseUrl)("Native Participate intake", () => {
  beforeEach(() => { rejectAbandonment = false; vi.stubEnv("DATABASE_URL", databaseUrl!); vi.stubEnv("WORKSPACE_PREVIEW", "true"); vi.stubEnv("NODE_ENV", "test"); });
  afterEach(() => { rejectAbandonment = false; vi.unstubAllEnvs(); });
  afterAll(() => prisma.$disconnect());

  it("keeps free drafts private and enforces author ownership and optimistic edits", async () => {
    const f = await fixture(), draft = await f.save({ title: "" });
    expect(await f.balance()).toBe(25);
    expect(await listOwnSubmissions(f.host.id, f.owner.id)).toEqual([]);
    expect((await listOwnSubmissions(f.host.id, f.author.id))[0].id).toBe(draft.id);
    expect((await readProposalParticipationBoard(f.host.id, null)).proposals).toHaveLength(1);
    const input = { id: draft.id, expectedVersion: draft.version, payload: { ...payload, title: "Updated title for this draft" } };
    await expect(saveProposalSubmission(f.host.id, f.owner.id, input)).rejects.toMatchObject({ code: "DRAFT_NOT_FOUND" });
    const updated = await saveProposalSubmission(f.host.id, f.author.id, input);
    expect(updated.version).toBe(2);
    expect((await saveProposalSubmission(f.host.id, f.author.id, input)).version).toBe(2);
    await expect(saveProposalSubmission(f.host.id, f.author.id, { ...input, payload })).rejects.toMatchObject({ code: "DRAFT_CHANGED" });
  });

  it("publishes a complete immutable package and charges concurrent retries exactly once", async () => {
    const f = await fixture(), draft = await f.save(), requestKey = randomUUID();
    const results = await Promise.all([1, 2, 3].map(() => f.publish(draft, { requestKey })));
    expect(new Set(results.map(result => result.draft.recordId)).size).toBe(1);
    expect(await f.balance()).toBe(5);
    const row = await prisma.archiveRevision.findFirstOrThrow({ where: { archive: { communityId: f.host.id, recordId: results[0].draft.recordId! } } });
    const checked = await verifyArchivePackage(JSON.parse(row.packageJson), row.manifestHash);
    expect(checked.manifest).toMatchObject({ kind: "NATIVE_PROPOSAL", sources: [payload.forumUrl] });
    const markdown = new TextDecoder().decode(decodeFile(checked.bundle.files.find(file => file.path === "proposal.md")!));
    expect(markdown).toBe(payload.body);
    const application = JSON.parse(new TextDecoder().decode(decodeFile(checked.bundle.files.find(file => file.path === "application.json")!)));
    expect(application).toMatchObject({ requestedAmountUsdCents: "125025", externalReview: "NOT_SUBMITTED", publication: "PILOT_DEMO", forumUrl: payload.forumUrl });
    expect(JSON.stringify(application)).not.toContain(f.author.email);
    expect(JSON.stringify(application)).not.toContain(f.author.id);
    expect(await prisma.creditOperation.count({ where: { userId: f.author.id, kind: "PROPOSAL_SUBMISSION" } })).toBe(1);
    expect(await prisma.poll.count({ where: { communityId: f.host.id } })).toBe(0);
    expect(await prisma.archiveAnchor.count({ where: { revisionId: row.id } })).toBe(0);
    await expect(prisma.proposalSubmission.update({ where: { id: draft.id }, data: { payload: { ...payload, body: "changed" } } })).rejects.toThrow();
    await expect(saveProposalSubmission(f.host.id, f.author.id, { id: draft.id, expectedVersion: draft.version, payload })).rejects.toMatchObject({ code: "ALREADY_PUBLISHED" });
  });

  it("rejects stale price, changed body, missing consent and incomplete input before debit", async () => {
    const f = await fixture(), draft = await f.save();
    await expect(f.publish(draft, { priceVersion: 2 })).rejects.toMatchObject({ code: "PRICE_CHANGED" });
    await expect(f.publish(draft, { contentHash: "a".repeat(64) })).rejects.toMatchObject({ code: "DRAFT_CHANGED" });
    await expect(f.publish(draft, { consent: false })).rejects.toMatchObject({ code: "INVALID_PROPOSAL_INPUT" });
    await expect(f.publish(await f.save({ body: "Short" }))).rejects.toMatchObject({ code: "INCOMPLETE_PROPOSAL" });
    expect(await f.balance()).toBe(25);
  });

  it("does not overspend concurrent publications or fall back to a DAO account", async () => {
    const f = await fixture();
    await prisma.communityMembership.create({ data: { communityId: f.host.id, userId: f.author.id, role: "MANAGER" } });
    await claimPreviewCredits(f.author.id, f.host.id);
    const first = await f.save(), second = await f.save({ title: "Another complete proposal" });
    const results = await Promise.allSettled([f.publish(first), f.publish(second)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "INSUFFICIENT_PARTICIPATION_CREDITS" } });
    expect(await f.balance()).toBe(5);
    expect((await prisma.creditAccount.findUniqueOrThrow({ where: { communityId_userId: { communityId: f.host.id, userId: f.author.id } } })).balance).toBe(25);
  });

  it("rejects missing or invalid forum topics on the server before any debit or public record", async () => {
    const f = await fixture();
    for (const forumUrl of ["", "https://forum.zcashcommunity.com/", "https://example.org/t/proposal/12345"]) {
      const draft = await f.save({ forumUrl });
      await expect(f.publish(draft)).rejects.toMatchObject({ code: "INCOMPLETE_PROPOSAL" });
      expect((await listOwnSubmissions(f.host.id, f.author.id)).find(row => row.id === draft.id)?.state).toBe("DRAFT");
    }
    expect(await f.balance()).toBe(25);
    expect(await prisma.creditOperation.count({ where: { userId: f.author.id, kind: "PROPOSAL_SUBMISSION" } })).toBe(0);
    expect(await prisma.proposalArchive.count({ where: { communityId: f.host.id } })).toBe(1);
  });

  it("rolls back the credit debit if the immutable publication cannot be saved", async () => {
    const f = await fixture(), draft = await f.save({ title: "Rollback publication fixture" });
    await expect(f.publish(draft)).rejects.toThrow("Test failure after credit debit");
    expect(await f.balance()).toBe(25);
    expect(await prisma.creditOperation.count({ where: { userId: f.author.id, kind: "PROPOSAL_SUBMISSION" } })).toBe(0);
    expect((await listOwnSubmissions(f.host.id, f.author.id))[0].state).toBe("DRAFT");
  });

  it("rejects unfunded or review accounts, inactive users and production publication", async () => {
    const f = await fixture(), draft = await f.save();
    await prisma.creditAccount.update({ where: { communityId_userId: { communityId: f.committee.id, userId: f.author.id } }, data: { paymentReview: true } });
    await expect(f.publish(draft)).rejects.toMatchObject({ code: "CREDIT_PAYMENT_REVIEW" });
    await prisma.creditAccount.create({ data: { communityId: f.committee.id, userId: f.owner.id } });
    const other = await saveProposalSubmission(f.host.id, f.owner.id, { id: randomUUID(), expectedVersion: 0, payload });
    await expect(publishDemoSubmission(f.host.id, f.owner.id, { id: other.id, expectedVersion: other.version, contentHash: other.contentHash, priceVersion: 1, requestKey: randomUUID(), consent: true })).rejects.toMatchObject({ code: "INSUFFICIENT_PARTICIPATION_CREDITS" });
    vi.stubEnv("NODE_ENV", "production");
    await expect(f.publish(draft)).rejects.toMatchObject({ code: "DEMO_PUBLICATION_ONLY" });
    vi.stubEnv("NODE_ENV", "test");
    await prisma.user.update({ where: { id: f.author.id }, data: { status: "DISABLED" } });
    await expect(f.publish(draft)).rejects.toMatchObject({ code: "unauthorized" });
    expect(await f.balance()).toBe(25);
  });

  it("supports inline comments and likes on the new public record with committee credits", async () => {
    const f = await fixture(), result = await f.publish(await f.save());
    const session = { subjectType: "user" as const, userId: f.author.id, nick: f.author.nick, role: f.author.role };
    await mutateArchiveDiscussion(f.host.id, result.draft.recordId!, session, "post", { body: "Feedback on the pilot record", requestKey: randomUUID(), policyVersion: 1 });
    await setArchiveProposalLike(f.host.id, result.draft.recordId!, session, { liked: true, requestKey: randomUUID(), policyVersion: 1 });
    const board = await readProposalParticipationBoard(f.host.id, session);
    expect(board.proposals.find(item => item.recordId === result.draft.recordId)).toMatchObject({ commentCount: 1, likes: 1 });
    expect(await f.balance()).toBe(3);
  });
  it("deletes only the author's confirmed current draft, without retaining its private text", async () => {
    const f = await fixture(), draft = await f.save();
    await expect(deleteProposalDraft(f.host.id, f.owner.id, { id: draft.id, expectedVersion: 1, consent: true })).rejects.toMatchObject({ code: "DRAFT_NOT_FOUND" });
    await expect(f.remove(draft, { consent: false })).rejects.toMatchObject({ code: "INVALID_PROPOSAL_INPUT" });
    await expect(f.remove(draft, { expectedVersion: 2 })).rejects.toMatchObject({ code: "DRAFT_CHANGED" });
    const result = await Promise.all([f.remove(draft), f.remove(draft)]);
    expect(result.map(row => row.replayed).sort()).toEqual([false, true]);
    expect(await listOwnSubmissions(f.host.id, f.author.id)).toEqual([]);
    expect(await prisma.proposalSubmission.findUnique({ where: { id: draft.id } })).toBeNull();
    const tombstone = await prisma.proposalDraftDeletion.findUniqueOrThrow({ where: { id: draft.id } });
    expect(JSON.stringify(tombstone)).not.toContain(payload.body);
    expect(tombstone).not.toHaveProperty("payload");
    for (const version of [0, 1]) await expect(saveProposalSubmission(f.host.id, f.author.id, { id: draft.id, expectedVersion: version, payload })).rejects.toMatchObject({ code: "DRAFT_NOT_FOUND" });
    expect(await f.balance()).toBe(25);
    expect(await prisma.archiveActivityEvent.count({ where: { archive: { communityId: f.host.id } } })).toBe(0);
  });

  it("does not delete a newer save or resurrect a draft when save races deletion", async () => {
    const f = await fixture(), draft = await f.save();
    const results = await Promise.allSettled([f.remove(draft), saveProposalSubmission(f.host.id, f.author.id, { id: draft.id, expectedVersion: draft.version, payload: { ...payload, title: "Changed before the deletion" } })]);
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1);
    const row = await prisma.proposalSubmission.findUnique({ where: { id: draft.id } });
    if (row) expect(row.version).toBe(2);
    else expect(await prisma.proposalDraftDeletion.count({ where: { id: draft.id } })).toBe(1);
  });

  it("serializes publishing against deletion and never deletes a published record", async () => {
    const f = await fixture(), draft = await f.save();
    const results = await Promise.allSettled([f.remove(draft), f.publish(draft)]);
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1);
    const row = await prisma.proposalSubmission.findUnique({ where: { id: draft.id } });
    expect(await f.balance()).toBe(row ? 5 : 25);
    if (row) { expect(row.state).toBe("PUBLISHED_DEMO"); await expect(f.remove(draft)).rejects.toMatchObject({ code: "ALREADY_PUBLISHED" }); }
    else expect(await prisma.proposalArchive.count({ where: { recordId: `pilot-${draft.id}` } })).toBe(0);
  });

  it("requires publication, the original author, exact content and explicit public reason", async () => {
    const f = await fixture(), draft = await f.save();
    await expect(f.abandon(draft)).rejects.toMatchObject({ code: "PROPOSAL_NOT_PUBLISHED" });
    await f.publish(draft);
    await expect(abandonProposalSubmission(f.host.id, f.owner.id, { id: draft.id, contentHash: draft.contentHash, reason: "Not my proposal at all.", requestKey: randomUUID(), consent: true })).rejects.toMatchObject({ code: "DRAFT_NOT_FOUND" });
    for (const overrides of [{ consent: false }, { reason: "" }, { reason: "x".repeat(1001) }, { authorId: f.author.id }]) await expect(f.abandon(draft, overrides)).rejects.toMatchObject({ code: "INVALID_PROPOSAL_INPUT" });
    await expect(f.abandon(draft, { contentHash: "0".repeat(64) })).rejects.toMatchObject({ code: "DRAFT_CHANGED" });
    expect(await prisma.proposalAbandonment.count({ where: { submissionId: draft.id } })).toBe(0);
  });

  it("appends one abandonment receipt, keeps files and discussion, batches it with existing activity", async () => {
    const f = await fixture(), draft = await f.save(), publication = await f.publish(draft), recordId = publication.draft.recordId!;
    const session = { subjectType: "user" as const, userId: f.author.id, nick: f.author.nick, role: f.author.role };
    await mutateArchiveDiscussion(f.host.id, recordId, session, "post", { body: "Keep this public discussion.", requestKey: randomUUID(), policyVersion: 1 });
    const before = await prisma.archiveRevision.findFirstOrThrow({ where: { archive: { communityId: f.host.id, recordId } } });
    const balance = await f.balance(), requestKey = randomUUID();
    const results = await Promise.all([f.abandon(draft, { requestKey }), f.abandon(draft, { requestKey }), f.abandon(draft, { requestKey })]);
    expect(new Set(results.map(r => r.draft.abandonment!.eventId)).size).toBe(1);
    const value = results[0].draft.abandonment!;
    await expect(f.abandon(draft, { requestKey, reason: "A different reason cannot replace this one." })).rejects.toMatchObject({ code: "ALREADY_ABANDONED" });
    expect(await f.balance()).toBe(balance);
    expect(await prisma.archiveRevision.findUnique({ where: { id: before.id } })).toEqual(before);
    expect((await listOwnSubmissions(f.host.id, f.author.id))[0].state).toBe("ABANDONED");
    expect((await readProposalParticipationBoard(f.host.id, null)).proposals.find(p => p.recordId === recordId)).toMatchObject({ commentCount: 1, abandonment: value });
    const activity = await readArchiveActivity(f.host.id, recordId);
    expect(activity!.items[0]).toMatchObject({ label: "Proposal abandoned by author", reason: value.reason, state: "RECORDED" });
    let receipt = (await readActivityReceipt(f.host.id, recordId, value.eventId))!;
    expect((await verifyActivityBundle(receipt.bundle, value.eventHash)).event).toMatchObject({ kind: "PROPOSAL_ABANDONED", reason: value.reason, sequence: 2, authority: "AUTHOR_ACCOUNT", proposalManifestHash: before.manifestHash });
    expect(JSON.stringify(receipt.bundle)).not.toContain(f.author.email);
    expect(JSON.stringify(receipt.bundle)).not.toContain(f.author.id);
    const config = { network: "testnet" as const, receiver: "ztestsapling1" + "q".repeat(60), publicViewingKey: "zxviewtestsapling1" + "q".repeat(80), birthdayHeight: 80, walletVersion: "0.1.0-beta.3", requiredConfirmations: 10, reader: { url: "http://127.0.0.1:28233" }, chain: { url: "http://127.0.0.1:18232" } };
    const batch = await prepareActivityBatch(f.host.id, config);
    const exported = await exportActivityBatch(batch!.id);
    expect(exported.events).toHaveLength(2);
    receipt = (await readActivityReceipt(f.host.id, recordId, value.eventId))!;
    expect(receipt.proof.state).toBe("PREPARED");
    expect(receipt.bundle.chain).toBeNull();
    expect((await verifyActivityBundle(receipt.bundle, value.eventHash)).bundle.inclusion).not.toBeNull();
    await expect(prisma.proposalAbandonment.delete({ where: { submissionId: draft.id } })).rejects.toThrow();
    await expect(prisma.archiveActivityEvent.update({ where: { id: value.eventId }, data: { eventJson: "{}" } })).rejects.toThrow();
  });

  it("stops new reviews and prepared signatures while preserving prior committee ballots", async () => {
    vi.stubEnv("PARTICIPATE_COMMITTEE_ENABLED", "true");
    const f = await fixture(), draft = await f.save(), publication = await f.publish(draft), recordId = publication.draft.recordId!;
    const key = await signingKey();
    await prisma.user.update({ where: { id: f.owner.id }, data: { email: `${randomUUID()}@example.invalid`, emailVerifiedAt: new Date() } });
    await prisma.passkey.create({ data: { userId: f.owner.id, credentialId: key.credential.id, userHandle: key.userHandle, rpId: signingContext.rpId, publicKey: key.credential.publicKey, transports: ["internal"], deviceType: "singleDevice", backedUp: false, label: "Lifecycle test" } });
    await prisma.communityMembership.create({ data: { userId: f.owner.id, communityId: f.committee.id, role: "OWNER" } });
    const priorKey = await signingKey();
    await prisma.user.update({ where: { id: f.author.id }, data: { emailVerifiedAt: new Date() } });
    await prisma.passkey.create({ data: { userId: f.author.id, credentialId: priorKey.credential.id, userHandle: priorKey.userHandle, rpId: signingContext.rpId, publicKey: priorKey.credential.publicKey, transports: ["internal"], deviceType: "singleDevice", backedUp: false, label: "Prior ballot test" } });
    await prisma.communityMembership.create({ data: { userId: f.author.id, communityId: f.committee.id, role: "REVIEWER" } });
    for (let i = 0; i < 3; i++) {
      const extra = await signingKey();
      const member = await prisma.user.create({ data: { nick: randomUUID(), email: `${randomUUID()}@example.test`, emailVerifiedAt: new Date(), role: "USER", passwordHash: "test-only" } });
      await prisma.passkey.create({ data: { userId: member.id, credentialId: extra.credential.id, userHandle: extra.userHandle, rpId: signingContext.rpId, publicKey: extra.credential.publicKey, deviceType: "singleDevice", backedUp: false, label: "Lifecycle test" } });
      await prisma.communityMembership.create({ data: { userId: member.id, communityId: f.committee.id, role: "REVIEWER" } });
    }
    const round = await createDecisionRound(f.host.id, recordId, f.owner.id, { revision: 1, policy: "ZCG_MAJORITY" }, signingContext);
    const input = { choice: "APPROVE", rationale: "The recorded milestones meet our expectations." };
    const prior = await beginDecisionSignature(f.host.id, recordId, round.id, f.author.id, input, signingContext);
    await finishDecisionSignature(f.host.id, recordId, round.id, f.author.id, prior.ceremonyId, priorKey.authenticator.authentication(prior.options.challenge, priorKey.userHandle), signingContext);
    const priorReceipt = await readDecisionReceipt(f.host.id, recordId, round.id);
    const ceremony = await beginDecisionSignature(f.host.id, recordId, round.id, f.owner.id, input, signingContext);
    await f.abandon(draft);
    await expect(finishDecisionSignature(f.host.id, recordId, round.id, f.owner.id, ceremony.ceremonyId, key.authenticator.authentication(ceremony.options.challenge, key.userHandle), signingContext)).rejects.toMatchObject({ code: "PROPOSAL_ABANDONED" });
    await expect(beginDecisionSignature(f.host.id, recordId, round.id, f.owner.id, input, signingContext)).rejects.toMatchObject({ code: "PROPOSAL_ABANDONED" });
    await expect(createDecisionRound(f.host.id, recordId, f.owner.id, { revision: 1, policy: "ZCG_MAJORITY" }, signingContext)).rejects.toMatchObject({ code: "PROPOSAL_ABANDONED" });
    expect(await readSignedDecisions(f.host.id, recordId, 1, f.owner.id, signingContext)).toMatchObject({ canSign: false, signingError: "PROPOSAL_ABANDONED" });
    expect((await readDecisionReceipt(f.host.id, recordId, round.id)).ballots).toEqual(priorReceipt.ballots);
    expect(priorReceipt.ballots).toHaveLength(1);
    const workspace = await readCommitteeWorkspace(f.host.id, f.owner.id, signingContext);
    expect(workspace.queue.find(p => p.recordId === recordId)).toMatchObject({ state: "ABANDONED", myPending: false });
  });

  it("rolls back the event if the abandonment projection fails", async () => {
    const f = await fixture(), draft = await f.save();
    await f.publish(draft);
    rejectAbandonment = true;
    await expect(f.abandon(draft)).rejects.toThrow("Test failure after abandonment event");
    expect(await prisma.proposalAbandonment.count({ where: { submissionId: draft.id } })).toBe(0);
    expect(await prisma.archiveActivityEvent.count({ where: { archive: { communityId: f.host.id } } })).toBe(0);
    expect((await listOwnSubmissions(f.host.id, f.author.id))[0].state).toBe("PUBLISHED_DEMO");
    expect(await f.balance()).toBe(5);
  });

});
