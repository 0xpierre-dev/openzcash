// @vitest-environment node
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { decisionPackage, signingContext as context, signingKey } from "@/tests/helpers/signed-decision";
import { decisionHash } from "@/lib/decisions/format";
import { verifyDecisionReceipt } from "@/lib/decisions/verify";
import { COMMITTEE_LABELS } from "@/lib/domain/committee-labels";
import { verifyActivityBundle } from "@/lib/archive/activity";
import { readPilotPackages } from "@/lib/archive/catalog";
import { ZCG_PROPOSAL_EXAMPLES } from "@/lib/data/zcg-proposal-examples";
import { readReviewPackages } from "@/lib/archive/review-proposals";
import * as sourceMetadata from "@/lib/data/zcg-source-metadata";

const databaseUrl = process.env.TREASURY_TEST_DATABASE_URL;
if (databaseUrl) { const url = new URL(databaseUrl); if (url.hostname !== "127.0.0.1" || url.port !== (process.env.PARTICIPATE_TEST_PORT ?? "55438") || url.pathname !== "/community_treasury_tests") throw new Error("Only the isolated local test database is permitted"); }
const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? "postgresql://unused@127.0.0.1:1/unused" });
vi.mock("@/lib/db", () => ({ db: prisma }));
const { mutateCommittee, readCommitteeWorkspace } = await import("@/lib/services/committee");
const { readCommitteeEntry } = await import("@/lib/services/committee-access");
const { bootstrapCommitteeOwner } = await import("@/lib/services/committee-bootstrap");
const { publishArchiveRevision } = await import("@/lib/services/proposal-archives");
const { createDecisionRound, beginDecisionSignature, finishDecisionSignature, readDecisionReceipt, readSignedDecisions } = await import("@/lib/services/signed-decisions");
const { mutateArchiveDiscussion } = await import("@/lib/services/archive-discussion");
const { readProposalParticipationBoard } = await import("@/lib/services/archive-discussion");
const { readActivityReceipt } = await import("@/lib/services/activity-anchors");

async function person() {
  const user = await prisma.user.create({ data: { nick: `committee-${randomUUID()}`, email: `${randomUUID()}@example.test`, emailVerifiedAt: new Date(), role: "USER", passwordHash: "test-only-no-login" } });
  const signing = await signingKey();
  await prisma.passkey.create({ data: { userId: user.id, credentialId: signing.credential.id, userHandle: signing.userHandle, rpId: context.rpId, publicKey: signing.credential.publicKey,
    deviceType: "singleDevice", backedUp: false, label: "Synthetic test key" } });
  return { user, ...signing };
}
async function fixture() {
  const people = await Promise.all([1, 2, 3, 4, 5, 6].map(() => person()));
  const host = await prisma.community.create({ data: { name: "Committee test host", slug: randomUUID(), createdById: people[0].user.id } });
  const committee = await prisma.community.create({ data: { name: "Independent test committee", kind: "COMMITTEE", slug: randomUUID(), createdById: people[0].user.id } });
  const roles = ["OWNER", "MANAGER", "REVIEWER", "MODERATOR", "REVIEWER", "REVIEWER"] as const;
  const members = await Promise.all(people.map((p, i) => prisma.communityMembership.create({ data: { communityId: committee.id, userId: p.user.id, role: roles[i], publicName: `Test person ${i + 1}` } })));
  const proposal = await decisionPackage(randomUUID());
  await publishArchiveRevision(host.id, proposal.bundle, proposal.manifestHash, committee.id);
  const recordId = proposal.manifest.recordId;
  const mutate = (input: unknown, index = 0) => mutateCommittee(host.id, people[index].user.id, input);
  const read = (index = 0) => readCommitteeWorkspace(host.id, people[index].user.id, context);
  const open = (index = 0) => createDecisionRound(host.id, recordId, people[index].user.id, { revision: 1, policy: "ZCG_MAJORITY" }, context);
  return { people, host, committee, members, recordId, mutate, read, open };
}

describe.skipIf(!databaseUrl)("Committee operations in PostgreSQL", () => {
  beforeEach(() => vi.stubEnv("PARTICIPATE_COMMITTEE_ENABLED", "true"));
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
  afterAll(() => prisma.$disconnect());

  it("defaults to public participant access and blocks old committee sessions and writes", async () => {
    const f = await fixture();
    vi.stubEnv("PARTICIPATE_COMMITTEE_ENABLED", undefined);
    for (const identity of [undefined, f.people[0].user.id, "preview_maya"]) {
      expect(await readCommitteeWorkspace(f.host.id, identity, context)).toMatchObject({ access: "RESTRICTED", members: [], invitations: [], queue: [], history: [], canMutate: false });
      expect(await readCommitteeEntry(f.host.id, identity)).toBeNull();
    }
    await expect(f.mutate({ action: "invite", email: "synthetic@example.test", role: "REVIEWER" })).rejects.toMatchObject({ code: "COMMITTEE_NOT_ENABLED" });
    await expect(f.mutate({ action: "labels", recordId: f.recordId, version: 0, labels: [] })).rejects.toMatchObject({ code: "COMMITTEE_NOT_ENABLED" });
    await expect(f.open()).rejects.toMatchObject({ code: "COMMITTEE_NOT_ENABLED" });
    expect(await readSignedDecisions(f.host.id, f.recordId, 1, f.people[0].user.id, context)).toMatchObject({ canManage: false, canCreate: false, roster: [] });
    const user = f.people[0].user;
    const session = { subjectType: "user" as const, userId: user.id, nick: user.nick, role: user.role };
    const comment = await mutateArchiveDiscussion(f.host.id, f.recordId, session, "post", { body: "A real participant can still discuss a public proposal.", requestKey: randomUUID() });
    expect(comment.body).toContain("real participant");
    await expect(mutateArchiveDiscussion(f.host.id, f.recordId, session, "hide", { reason: "Old committee permission" }, comment.id)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("provides a redacted admin preview without creating committee membership or authority", async () => {
    const { hash } = await import("bcryptjs");
    const { unlockCommitteePreview } = await import("@/lib/auth/committee-admin");
    const f = await fixture(), password = "Synthetic isolated-test admin password";
    const user = await prisma.user.create({ data: { nick: randomUUID(), email: `${randomUUID()}@example.test`, emailVerifiedAt: new Date(), role: "ADMIN", passwordHash: await hash(password, 4) } });
    vi.stubEnv("PARTICIPATE_COMMITTEE_ENABLED", "false");
    vi.stubEnv("ZCAP_SESSION_SECRET", "synthetic-test-key-at-least-32-bytes-long");
    expect(await readCommitteeWorkspace(f.host.id, user.id, context)).toMatchObject({ access: "RESTRICTED" });
    const token = await unlockCommitteePreview(user.id, f.host.id, { password });
    const view = await readCommitteeWorkspace(f.host.id, user.id, context, undefined, token);
    expect(view).toMatchObject({ access: "MEMBER", role: null, demo: true, canMutate: false, invitations: [], history: [], permissions: { canOpen: false, canManageTeam: false, canModerate: false, canReview: false } });
    expect(view.queue).toHaveLength(1); expect(view.members.every(member => member.email === null && !member.isMe)).toBe(true);
    expect(await readCommitteeEntry(f.host.id, user.id, token)).toMatchObject({ label: "Committee preview" });
    expect(await prisma.communityMembership.count({ where: { userId: user.id } })).toBe(0);
    await expect(mutateCommittee(f.host.id, user.id, { action: "labels", recordId: f.recordId, version: 0, labels: [] })).rejects.toMatchObject({ code: "COMMITTEE_NOT_ENABLED" });
    await expect(createDecisionRound(f.host.id, f.recordId, user.id, { revision: 1, policy: "ZCG_MAJORITY" }, context)).rejects.toMatchObject({ code: "COMMITTEE_NOT_ENABLED" });
  });

  it("stops new and already prepared signatures when committee operation is disabled", async () => {
    const f = await fixture(), round = await f.open();
    const choice = { choice: "APPROVE", rationale: "Synthetic approval before the release gate is closed." };
    const pending = await beginDecisionSignature(f.host.id, f.recordId, round.id, f.people[0].user.id, choice, context);
    vi.stubEnv("PARTICIPATE_COMMITTEE_ENABLED", "false");
    await expect(beginDecisionSignature(f.host.id, f.recordId, round.id, f.people[1].user.id, choice, context)).rejects.toMatchObject({ code: "COMMITTEE_NOT_ENABLED" });
    await expect(finishDecisionSignature(f.host.id, f.recordId, round.id, f.people[0].user.id, pending.ceremonyId, f.people[0].authenticator.authentication(pending.options.challenge, f.people[0].userHandle), context)).rejects.toMatchObject({ code: "COMMITTEE_NOT_ENABLED" });
    expect(await prisma.signedDecisionBallot.count({ where: { roundId: round.id } })).toBe(0);
    expect(await readSignedDecisions(f.host.id, f.recordId, 1, f.people[0].user.id, context)).toMatchObject({ canSign: false, signingError: "COMMITTEE_NOT_ENABLED" });
    expect((await readDecisionReceipt(f.host.id, f.recordId, round.id)).ballots).toHaveLength(0);
  });

  it("reconciles source withdrawal in the committee queue without rewriting the anchored snapshot", async () => {
    const f = await fixture();
    const item = (await readReviewPackages()).find(p => p.manifest.recordId === "zcg-github-439")!;
    const saved = await publishArchiveRevision(f.host.id, item.bundle, item.manifestHash, f.committee.id);
    const view = await readSignedDecisions(f.host.id, item.manifest.recordId, 1, f.people[0].user.id, context);
    expect(view).toMatchObject({ canCreate: false, abandonment: null, sourceWithdrawal: { url: "https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/439" } });
    expect((await f.read()).queue.find(row => row.recordId === item.manifest.recordId)).toMatchObject({ state: "ABANDONED", myPending: false });
    await expect(createDecisionRound(f.host.id, item.manifest.recordId, f.people[0].user.id, { revision: 1, policy: "ZCG_MAJORITY" }, context)).rejects.toMatchObject({ code: "PROPOSAL_SOURCE_WITHDRAWN" });
    expect(await prisma.archiveRevision.findUniqueOrThrow({ where: { id: saved.id } })).toMatchObject({ manifestHash: item.manifestHash, packageJson: saved.packageJson });
    expect(await prisma.proposalAbandonment.count({ where: { archiveId: saved.archiveId } })).toBe(0);
    expect(await prisma.archiveActivityEvent.count({ where: { archiveId: saved.archiveId } })).toBe(0);
  });

  it("stops new and prepared signatures after a source withdrawal, preserving prior ballots", async () => {
    const f = await fixture();
    const item = (await readReviewPackages()).find(p => p.manifest.recordId !== "zcg-github-439")!;
    await publishArchiveRevision(f.host.id, item.bundle, item.manifestHash, f.committee.id);
    const id = item.manifest.recordId;
    const round = await createDecisionRound(f.host.id, id, f.people[0].user.id, { revision: 1, policy: "ZCG_MAJORITY" }, context);
    const choice = { choice: "APPROVE", rationale: "Synthetic audit of a source status update." };
    const first = await beginDecisionSignature(f.host.id, id, round.id, f.people[0].user.id, choice, context);
    await finishDecisionSignature(f.host.id, id, round.id, f.people[0].user.id, first.ceremonyId, f.people[0].authenticator.authentication(first.options.challenge, f.people[0].userHandle), context);
    const pending = await beginDecisionSignature(f.host.id, id, round.id, f.people[1].user.id, choice, context);
    const original = sourceMetadata.zcgSourceWithdrawal;
    const spy = vi.spyOn(sourceMetadata, "zcgSourceWithdrawal").mockImplementation(manifest => manifest.recordId === id ? { url: "https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/386", checkedAt: new Date().toISOString() } : original(manifest));
    try {
      expect(await readSignedDecisions(f.host.id, id, 1, f.people[1].user.id, context)).toMatchObject({ canSign: false, signingError: "PROPOSAL_SOURCE_WITHDRAWN", progress: { signed: 1, eligible: 5 } });
      await expect(beginDecisionSignature(f.host.id, id, round.id, f.people[1].user.id, choice, context)).rejects.toMatchObject({ code: "PROPOSAL_SOURCE_WITHDRAWN" });
      await expect(finishDecisionSignature(f.host.id, id, round.id, f.people[1].user.id, pending.ceremonyId, f.people[1].authenticator.authentication(pending.options.challenge, f.people[1].userHandle), context)).rejects.toMatchObject({ code: "PROPOSAL_SOURCE_WITHDRAWN" });
      expect((await f.read()).queue.find(row => row.recordId === id)).toMatchObject({ state: "ABANDONED", signed: 1, myPending: false });
      expect((await readDecisionReceipt(f.host.id, id, round.id)).ballots).toHaveLength(1);
    } finally { spy.mockRestore(); }
  });

  it("returns the preserved source decisions and feedback without creating new committee votes", async () => {
    const f = await fixture();
    const packages = await readPilotPackages();
    for (const item of packages) await publishArchiveRevision(f.host.id, item.bundle, item.manifestHash, f.committee.id);
    const before = await prisma.archiveRevision.findMany({ where: { archive: { communityId: f.host.id } }, orderBy: { id: "asc" } });
    const workspace = await f.read();
    const historical = workspace.queue.filter(row => row.kind === "HISTORICAL_SUMMARY");
    expect(historical).toHaveLength(5);
    for (const row of historical) {
      expect(row.sourceDecision).toEqual(ZCG_PROPOSAL_EXAMPLES.find(example => example.id === row.recordId));
      expect(row).toMatchObject({ state: "HISTORICAL", roundId: null, signed: 0, myChoice: null, myPending: false });
    }
    expect(await prisma.signedDecisionRound.count({ where: { scopeId: f.committee.id } })).toBe(0);
    expect(await prisma.archiveRevision.findMany({ where: { archive: { communityId: f.host.id } }, orderBy: { id: "asc" } })).toEqual(before);
  });

  it("requires exactly five ready voting members and never treats moderator access as a vote", async () => {
    const f = await fixture();
    await prisma.communityMembership.update({ where: { id: f.members[5].id }, data: { status: "DISABLED" } });
    expect(await readSignedDecisions(f.host.id, f.recordId, 1, f.people[0].user.id, context)).toMatchObject({ canCreate: false, defaults: { quorum: 5, approvalPercent: 60, durationHours: null } });
    await expect(f.open()).rejects.toMatchObject({ code: "DECISION_FIVE_MEMBERS_REQUIRED" });
    await prisma.communityMembership.update({ where: { id: f.members[5].id }, data: { status: "ACTIVE" } });
    await prisma.communityMembership.update({ where: { id: f.members[3].id }, data: { role: "REVIEWER" } });
    await expect(f.open()).rejects.toMatchObject({ code: "DECISION_FIVE_MEMBERS_REQUIRED" });
    expect(await prisma.signedDecisionRound.count({ where: { scopeId: f.committee.id } })).toBe(0);
  });

  it("can update labels while a review opens without altering the frozen proposal", async () => {
    const f = await fixture();
    const [opened] = await Promise.all([f.open(), f.mutate({ action: "labels", recordId: f.recordId, version: 0, labels: [COMMITTEE_LABELS[0].id] }, 2)]);
    const receipt = await readDecisionReceipt(f.host.id, f.recordId, opened.id);
    expect(await verifyDecisionReceipt(receipt)).toMatchObject({ outcome: "OPEN", eligible: 5, signed: 0 });
    expect((await f.read()).queue[0]).toMatchObject({ labelsVersion: 1, labels: [COMMITTEE_LABELS[0].id] });
  });

  it("persists all ZCG labels with public receipts without changing proposal files or signed outcomes", async () => {
    const f = await fixture(), round = await f.open();
    const original = await prisma.archiveRevision.findFirstOrThrow({ where: { archive: { recordId: f.recordId } } });
    const decision = await readDecisionReceipt(f.host.id, f.recordId, round.id);
    const labels = COMMITTEE_LABELS.map(label => label.id).sort();
    expect(await f.mutate({ action: "labels", recordId: f.recordId, version: 0, labels }, 2)).toEqual({ labels, labelsVersion: 1 });
    expect((await f.read()).queue[0]).toMatchObject({ labels, labelsVersion: 1, state: "OPEN", signed: 0 });
    expect((await readProposalParticipationBoard(f.host.id, null)).proposals[0]).toMatchObject({ labels });
    const after = await prisma.archiveRevision.findUniqueOrThrow({ where: { id: original.id } });
    expect(after).toEqual(original);
    expect((await readDecisionReceipt(f.host.id, f.recordId, round.id)).roundHash).toBe(decision.roundHash);
    const event = await prisma.archiveActivityEvent.findFirstOrThrow({ where: { archive: { recordId: f.recordId } } });
    const receipt = await readActivityReceipt(f.host.id, f.recordId, event.id);
    const verified = await verifyActivityBundle(receipt!.bundle, event.eventHash);
    expect(verified.event).toMatchObject({ kind: "PROPOSAL_LABELS_SET", authority: "COMMITTEE_ACCOUNT", previousLabels: [], labelsVersion: 1, proposalManifestHash: original.manifestHash });
    expect(event.eventJson.length).toBeLessThan(16000);
    expect(receipt!.bundle.inclusion).toBeNull();
    expect((await f.read()).history[0]).toMatchObject({ action: "PROPOSAL_LABELS_SET" });
    expect(await prisma.creditOperation.count({ where: { userId: f.people[2].user.id } })).toBe(0);
  });

  it("serializes competing label edits, rejects stale versions, and records removals without duplicate no-ops", async () => {
    const f = await fixture();
    const actions = COMMITTEE_LABELS.slice(0, 2).map(label => ({ action: "labels", recordId: f.recordId, version: 0, labels: [label.id] }));
    const results = await Promise.allSettled(actions.map((action, index) => f.mutate(action, index)));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "COMMITTEE_REFRESH_REQUIRED" } });
    const row = (await f.read()).queue[0];
    await f.mutate({ action: "labels", recordId: f.recordId, version: 1, labels: row.labels });
    expect(await prisma.archiveActivityEvent.count({ where: { archive: { recordId: f.recordId } } })).toBe(1);
    await f.mutate({ action: "labels", recordId: f.recordId, version: 1, labels: [] });
    expect((await f.read()).queue[0]).toMatchObject({ labels: [], labelsVersion: 2 });
    const events = await prisma.archiveActivityEvent.findMany({ where: { archive: { recordId: f.recordId } }, orderBy: { sequence: "asc" } });
    expect(events).toHaveLength(2);
    expect(JSON.parse(events[1].eventJson)).toMatchObject({ previousEventHash: events[0].eventHash, previousLabels: row.labels, labels: [] });
    await expect(prisma.archiveActivityEvent.delete({ where: { id: events[0].id } })).rejects.toThrow();
  });

  it("blocks unauthorized, demo, disabled, unverified and cross-committee label changes", async () => {
    const f = await fixture(), other = await fixture();
    const action = { action: "labels", recordId: f.recordId, version: 0, labels: [COMMITTEE_LABELS[0].id] };
    await expect(f.mutate(action, 3)).rejects.toMatchObject({ code: "COMMITTEE_FORBIDDEN" });
    await expect(f.mutate({ ...action, recordId: other.recordId })).rejects.toMatchObject({ code: "COMMITTEE_PROPOSAL_UNAVAILABLE" });
    await expect(mutateCommittee(f.host.id, other.people[0].user.id, action)).rejects.toMatchObject({ code: "COMMITTEE_FORBIDDEN" });
    await prisma.user.update({ where: { id: f.people[2].user.id }, data: { emailVerifiedAt: null } });
    await expect(f.mutate(action, 2)).rejects.toMatchObject({ code: "COMMITTEE_VERIFIED_ACCOUNT_REQUIRED" });
    await prisma.communityMembership.update({ where: { id: f.members[1].id }, data: { status: "DISABLED" } });
    await expect(f.mutate(action, 1)).rejects.toMatchObject({ code: "COMMITTEE_FORBIDDEN" });
    const demoId = `preview_${randomUUID()}`;
    await prisma.user.create({ data: { id: demoId, nick: demoId, email: `${randomUUID()}@example.test`, emailVerifiedAt: new Date(), role: "USER", passwordHash: "" } });
    await prisma.communityMembership.create({ data: { communityId: f.committee.id, userId: demoId, role: "OWNER" } });
    await expect(mutateCommittee(f.host.id, demoId, action)).rejects.toMatchObject({ code: "COMMITTEE_VERIFIED_ACCOUNT_REQUIRED" });
    await expect(f.mutate({ ...action, labels: ["unknown"] })).rejects.toThrow();
    await expect(f.mutate({ ...action, labels: [action.labels[0], action.labels[0]] })).rejects.toThrow();
    expect((await f.read()).queue[0]).toMatchObject({ labels: [], labelsVersion: 0 });
    expect(await prisma.archiveActivityEvent.count({ where: { archive: { recordId: f.recordId } } })).toBe(0);
  });

  it("previews first-owner setup without writes, then retires demo access exactly once", async () => {
    const f = await fixture(), recipient = await person(), demoId = `preview_${randomUUID()}`;
    await prisma.communityMembership.update({ where: { id: f.members[0].id }, data: { role: "MANAGER" } });
    await prisma.user.create({ data: { id: demoId, nick: demoId, role: "USER", passwordHash: "" } });
    const demo = await prisma.communityMembership.create({ data: { communityId: f.committee.id, userId: demoId, role: "OWNER" } });
    const setup = (apply = false) => bootstrapCommitteeOwner(f.host.id, recipient.user.email!, "Personal owner", apply);
    expect(await setup()).toMatchObject({ mode: "DRY_RUN", alreadyOwner: false, demoSeatsToRetire: 1 });
    expect(await prisma.communityMembership.count({ where: { communityId: f.committee.id, userId: recipient.user.id } })).toBe(0);
    expect(await prisma.committeeEvent.count({ where: { communityId: f.committee.id } })).toBe(0);
    await setup(true);
    expect(await prisma.communityMembership.findUnique({ where: { id: demo.id } })).toMatchObject({ status: "DISABLED" });
    expect(await prisma.communityMembership.findUnique({ where: { communityId_userId: { communityId: f.committee.id, userId: recipient.user.id } } })).toMatchObject({ role: "OWNER", status: "ACTIVE", publicName: "Personal owner" });
    expect(await setup(true)).toMatchObject({ mode: "APPLIED", alreadyOwner: true });
    expect(await prisma.committeeEvent.count({ where: { communityId: f.committee.id, action: "OWNER_BOOTSTRAPPED" } })).toBe(1);
    expect(await readCommitteeEntry(f.host.id, demoId)).toBeNull();
  });

  it("cannot bootstrap an unverified or demo identity, or replace an existing personal owner", async () => {
    const f = await fixture(), recipient = await person(), demoId = `preview_${randomUUID()}`, demoEmail = `${randomUUID()}@example.test`;
    await expect(bootstrapCommitteeOwner(f.host.id, recipient.user.email!, "Replacement owner", true)).rejects.toThrow("real owner already exists");
    await prisma.user.update({ where: { id: recipient.user.id }, data: { emailVerifiedAt: null } });
    await expect(bootstrapCommitteeOwner(f.host.id, recipient.user.email!, "Unverified owner", true)).rejects.toThrow("verified personal account");
    await prisma.user.create({ data: { id: demoId, nick: demoId, email: demoEmail, emailVerifiedAt: new Date(), role: "USER", passwordHash: "" } });
    await expect(bootstrapCommitteeOwner(f.host.id, demoEmail, "Demo owner", true)).rejects.toThrow("verified personal account");
    expect(await prisma.communityMembership.findUnique({ where: { id: f.members[0].id } })).toMatchObject({ role: "OWNER", status: "ACTIVE" });
    expect(await prisma.committeeEvent.count({ where: { communityId: f.committee.id, action: "OWNER_BOOTSTRAPPED" } })).toBe(0);
  });

  it("scopes the private panel and hides emails from other reviewers", async () => {
    const f = await fixture(), stranger = await person();
    expect(await readCommitteeWorkspace(f.host.id, undefined, context)).toMatchObject({ access: "SIGNED_OUT", members: [], queue: [] });
    expect(await readCommitteeWorkspace(f.host.id, stranger.user.id, context)).toMatchObject({ access: "DENIED", name: "Committee", members: [], invitations: [] });
    const owner = await f.read(), reviewer = await f.read(2);
    expect(owner.members.map(m => m.email).sort()).toEqual(f.people.map(p => p.user.email).sort());
    expect(reviewer.permissions).toMatchObject({ canManageTeam: false, canOpen: false, canReview: true, canModerate: false });
    expect(reviewer.members.filter(m => !m.isMe).every(m => m.email === null)).toBe(true);
    expect(await readCommitteeEntry(f.host.id, f.people[2].user.id)).toMatchObject({ href: "/participate/committee" });
    expect(await readCommitteeEntry(f.host.id, stranger.user.id)).toBeNull();
  });

  it("creates an email-bound invitation, exposes it only to its recipient, and admits a reviewer once", async () => {
    const f = await fixture(), recipient = await person(), outsider = await person();
    const invited = await f.mutate({ action: "invite", email: recipient.user.email!.toUpperCase(), role: "REVIEWER" });
    expect(invited).toHaveProperty("invitationId"); const id = (invited as { invitationId: string }).invitationId;
    const same = await f.mutate({ action: "invite", email: recipient.user.email, role: "REVIEWER" }); expect(same).toEqual(invited);
    expect(await readCommitteeEntry(f.host.id, recipient.user.id)).toMatchObject({ label: "Committee invitation" });
    expect(await readCommitteeWorkspace(f.host.id, recipient.user.id, context)).toMatchObject({ access: "INVITED", members: [], queue: [], invitations: [{ id, mine: true }] });
    await expect(mutateCommittee(f.host.id, outsider.user.id, { action: "accept", invitationId: id, publicName: "Wrong person", consent: true })).rejects.toMatchObject({ code: "COMMITTEE_INVITATION_UNAVAILABLE" });
    const action = { action: "accept", invitationId: id, publicName: "New reviewer", consent: true };
    const results = await Promise.allSettled([mutateCommittee(f.host.id, recipient.user.id, action), mutateCommittee(f.host.id, recipient.user.id, action)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const member = await prisma.communityMembership.findUniqueOrThrow({ where: { communityId_userId: { communityId: f.committee.id, userId: recipient.user.id } } });
    expect(member).toMatchObject({ role: "REVIEWER", publicName: "New reviewer", status: "ACTIVE" });
    await expect(mutateCommittee(f.host.id, recipient.user.id, { action: "invite", email: outsider.user.email, role: "MANAGER" })).rejects.toMatchObject({ code: "COMMITTEE_FORBIDDEN" });
  });

  it.each(["expired", "revoked", "unverified", "inviter-disabled"])("cannot accept a %s invitation", async fault => {
    const f = await fixture(), recipient = await person();
    const { invitationId } = await f.mutate({ action: "invite", email: recipient.user.email, role: "MODERATOR" }) as { invitationId: string };
    if (fault === "expired") await prisma.committeeInvitation.update({ where: { id: invitationId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    if (fault === "revoked") await f.mutate({ action: "revoke-invite", invitationId });
    if (fault === "unverified") await prisma.user.update({ where: { id: recipient.user.id }, data: { emailVerifiedAt: null } });
    if (fault === "inviter-disabled") await prisma.communityMembership.update({ where: { id: f.members[0].id }, data: { status: "DISABLED" } });
    await expect(mutateCommittee(f.host.id, recipient.user.id, { action: "accept", invitationId, publicName: "Test reviewer", consent: true })).rejects.toThrow();
    expect(await prisma.communityMembership.count({ where: { communityId: f.committee.id, userId: recipient.user.id } })).toBe(0);
  });

  it("protects owner access, rejects scope injection, and uses current roles rather than global admin", async () => {
    const f = await fixture(), other = await fixture();
    await prisma.user.update({ where: { id: other.people[0].user.id }, data: { role: "ADMIN" } });
    const edit = { action: "member", memberId: f.members[2].id, version: 1, role: "MANAGER", status: "ACTIVE", reason: "Test promotion" };
    for (const index of [1, 2, 3]) await expect(f.mutate(edit, index)).rejects.toMatchObject({ code: "COMMITTEE_FORBIDDEN" });
    await expect(mutateCommittee(f.host.id, other.people[0].user.id, edit)).rejects.toMatchObject({ code: "COMMITTEE_FORBIDDEN" });
    await expect(f.mutate({ ...edit, memberId: f.members[0].id })).rejects.toMatchObject({ code: "COMMITTEE_OWNER_PROTECTED" });
    await expect(f.mutate({ ...edit, memberId: other.members[2].id })).rejects.toMatchObject({ code: "COMMITTEE_MEMBER_UNAVAILABLE" });
    await expect(f.mutate({ ...edit, communityId: other.committee.id })).rejects.toThrow();
    await expect(f.mutate({ action: "invite", email: "owner@example.test", role: "OWNER" })).rejects.toThrow();
    await expect(prisma.communityMembership.create({ data: { communityId: f.host.id, userId: f.people[2].user.id, role: "REVIEWER" } })).rejects.toThrow();
  });

  it("excludes moderators, signs feedback, preserves frozen eligibility after removal, and closes into history", async () => {
    const f = await fixture(), opened = await f.open(1);
    const before = await readDecisionReceipt(f.host.id, f.recordId, opened.id);
    expect(before.round.members).toHaveLength(5); expect(before.round.members.map(m => m.label)).toEqual(expect.arrayContaining(["Test person 1", "Test person 2", "Test person 3"]));
    const reason = "I reviewed the milestones and recommend approval of this exact revision.";
    await expect(beginDecisionSignature(f.host.id, f.recordId, opened.id, f.people[3].user.id, { choice: "APPROVE", rationale: reason }, context)).rejects.toMatchObject({ code: "DECISION_NOT_ELIGIBLE" });
    await expect(beginDecisionSignature(f.host.id, f.recordId, opened.id, f.people[2].user.id, { choice: "APPROVE" }, context)).rejects.toMatchObject({ code: "DECISION_RATIONALE_REQUIRED" });
    expect((await f.read(2)).queue[0]).toMatchObject({ state: "OPEN", myPending: true });
    await f.mutate({ action: "member", memberId: f.members[2].id, version: 1, role: "REVIEWER", status: "DISABLED", reason: "End of committee term" });
    expect((await f.read(2)).access).toBe("DENIED");
    for (const index of [0, 2, 4]) {
      const prepare = await beginDecisionSignature(f.host.id, f.recordId, opened.id, f.people[index].user.id, { choice: "APPROVE", rationale: reason }, context);
      await finishDecisionSignature(f.host.id, f.recordId, opened.id, f.people[index].user.id, prepare.ceremonyId, f.people[index].authenticator.authentication(prepare.options.challenge, f.people[index].userHandle), context);
    }
    const receipt = await readDecisionReceipt(f.host.id, f.recordId, opened.id);
    expect(receipt.roundHash).toBe(before.roundHash); expect(receipt.ballots[0].envelope).toMatchObject({ rationale: reason });
    expect(await verifyDecisionReceipt(receipt)).toMatchObject({ signed: 3, outcome: "OPEN" });
    const view = await readSignedDecisions(f.host.id, f.recordId, 1, f.people[0].user.id, context);
    expect(view.ballots).toEqual([]);
    expect(view.tally).toBeUndefined();
    expect(view.progress).toEqual({ signed: 3, eligible: 5 });
    expect(view.myChoice).toBe("APPROVE");
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(Date.now() + 90 * 86400000);
    expect((await f.read()).queue[0]).toMatchObject({ state: "OPEN", signed: 3, eligible: 5, myPending: false });
    expect((await f.read(1)).queue[0]).toMatchObject({ state: "OPEN", myPending: true });
    const history = (await f.read()).history;
    expect(history.filter(e => e.action === "DECISION_SIGNED")).toHaveLength(3);
    expect(history.filter(e => e.action === "DECISION_SIGNED").every(e => e.summary === "Signed response recorded. See the completed review for choices and reasons.")).toBe(true);
    expect(await prisma.creditOperation.count({ where: { userId: { in: f.people.map(p => p.user.id) } } })).toBe(0);
  });

  it("records access changes in an append-only hash chain and rejects timed settings or stale member versions", async () => {
    const f = await fixture();
    await expect(f.mutate({ action: "policy", version: 0, rules: { quorum: 3, approvalPercent: 60, durationHours: 48 } }, 1)).rejects.toMatchObject({ code: "COMMITTEE_FIXED_RULES" });
    expect((await readSignedDecisions(f.host.id, f.recordId, 1, f.people[0].user.id, context)).defaults).toEqual({ quorum: 5, approvalPercent: 60, durationHours: null });
    await expect(f.mutate({ action: "policy", version: 0, rules: { quorum: 1, approvalPercent: 60, durationHours: 48 } })).rejects.toMatchObject({ code: "COMMITTEE_FIXED_RULES" });
    await expect(f.mutate({ action: "policy", version: 1, rules: { quorum: 4, approvalPercent: 60, durationHours: 48 } })).rejects.toMatchObject({ code: "COMMITTEE_FIXED_RULES" });
    const edit = { action: "member", memberId: f.members[2].id, version: 1, role: "MODERATOR", status: "ACTIVE", reason: "Switching to discussion moderation" };
    await f.mutate(edit); await expect(f.mutate(edit)).rejects.toMatchObject({ code: "COMMITTEE_REFRESH_REQUIRED" });
    const events = await prisma.committeeEvent.findMany({ where: { communityId: f.committee.id }, orderBy: { sequence: "asc" } });
    for (const [i, event] of events.entries()) {
      const { hash, ...rest } = event;
      expect(rest.previousHash).toBe(i ? events[i - 1].hash : null);
      expect(await decisionHash({ ...rest, createdAt: rest.createdAt.toISOString() })).toBe(hash);
    }
    await expect(prisma.committeeEvent.update({ where: { id: events[0].id }, data: { action: "REWRITTEN" } })).rejects.toThrow();
    await expect(prisma.committeeEvent.deleteMany({ where: { communityId: f.committee.id } })).rejects.toThrow();
  });

  it("allows a moderator to hide a comment with a recorded reason, but not open a review", async () => {
    const f = await fixture();
    const session = (index: number) => ({ subjectType: "user" as const, userId: f.people[index].user.id, nick: f.people[index].user.nick, role: f.people[index].user.role });
    const comment = await mutateArchiveDiscussion(f.host.id, f.recordId, session(2), "post", { body: "A public discussion comment for the isolated test.", requestKey: randomUUID() });
    await expect(mutateArchiveDiscussion(f.host.id, f.recordId, session(2), "hide", { reason: "Not authorized" }, comment.id)).rejects.toMatchObject({ code: "forbidden" });
    const hidden = await mutateArchiveDiscussion(f.host.id, f.recordId, session(3), "hide", { reason: "Moderation test with a public reason" }, comment.id);
    expect(hidden).toMatchObject({ hidden: true, moderation: { reason: "Moderation test with a public reason" } });
    await expect(f.open(3)).rejects.toMatchObject({ code: "DECISION_MANAGER_REQUIRED" });
  });

  it("keeps shared demo profiles read-only even if their account fields are manipulated", async () => {
    const f = await fixture(), demoId = `preview_${randomUUID()}`;
    await prisma.user.create({ data: { id: demoId, nick: demoId, email: `${randomUUID()}@example.test`, emailVerifiedAt: new Date(), role: "USER", passwordHash: "" } });
    await prisma.communityMembership.create({ data: { communityId: f.committee.id, userId: demoId, role: "OWNER" } });
    const view = await readCommitteeWorkspace(f.host.id, demoId, context);
    expect(view).toMatchObject({ access: "MEMBER", demo: true, canMutate: false, invitations: [], history: [] });
    expect(view.members.every(m => m.email === null)).toBe(true);
    await expect(mutateCommittee(f.host.id, demoId, { action: "invite", email: "other@example.test", role: "REVIEWER" })).rejects.toMatchObject({ code: "COMMITTEE_VERIFIED_ACCOUNT_REQUIRED" });
    await expect(createDecisionRound(f.host.id, f.recordId, demoId, { revision: 1, policy: "ZCG_MAJORITY" }, context)).rejects.toMatchObject({ code: "DECISION_VERIFIED_ACCOUNT_REQUIRED" });
  });
});
