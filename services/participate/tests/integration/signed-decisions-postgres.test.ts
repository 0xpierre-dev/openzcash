// @vitest-environment node
import { randomUUID } from "node:crypto";
import { PrismaClient, type User, type Passkey } from "@prisma/client";
import { decisionPackage, signingContext as context, signingKey } from "@/tests/helpers/signed-decision";
import { verifyDecisionReceipt } from "@/lib/decisions/verify";

const databaseUrl = process.env.TREASURY_TEST_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (url.hostname !== "127.0.0.1" || url.port !== (process.env.PARTICIPATE_TEST_PORT ?? "55438") || url.pathname !== "/community_treasury_tests") throw new Error("Only the isolated local test database is permitted");
}
const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? "postgresql://unused@127.0.0.1:1/unused" });
vi.mock("@/lib/db", () => ({ db: prisma }));
const { publishArchiveRevision } = await import("@/lib/services/proposal-archives");
const { createDecisionRound, beginDecisionSignature, finishDecisionSignature, readDecisionReceipt, readPublishedDecisionReceipt, readSignedDecisions } = await import("@/lib/services/signed-decisions");

async function fixture(committeeScope = true) {
  const people: (Awaited<ReturnType<typeof signingKey>> & { user: User; key: Passkey })[] = [];
  for (let i = 0; i < (committeeScope ? 5 : 3); i++) {
    const signer = await signingKey();
    const user = await prisma.user.create({ data: { nick: `signed-${randomUUID()}`, email: `private-${randomUUID()}@example.test`, emailVerifiedAt: new Date(), role: "USER", passwordHash: "test-only-no-login" } });
    const key = await prisma.passkey.create({ data: { userId: user.id, credentialId: signer.credential.id, userHandle: signer.userHandle, rpId: context.rpId,
      publicKey: signer.credential.publicKey, transports: ["internal"], deviceType: "singleDevice", backedUp: false, label: "Isolated test key" } });
    people.push({ ...signer, user, key });
  }
  const host = await prisma.community.create({ data: { name: "Signature test host", slug: randomUUID(), createdById: people[0].user.id } });
  const committee = await prisma.community.create({ data: { name: "Independent test reviewers", slug: randomUUID(), kind: "COMMITTEE", createdById: people[0].user.id } });
  await prisma.communityMembership.createMany({ data: people.map((p, i) => ({ communityId: committee.id, userId: p.user.id, role: i === 0 ? "OWNER" as const : "MANAGER" as const })) });
  const proposal = await decisionPackage(), recordId = proposal.manifest.recordId;
  const revision = await publishArchiveRevision(host.id, proposal.bundle, proposal.manifestHash, committeeScope ? committee.id : undefined);
  const create = (input = {}) => createDecisionRound(host.id, recordId, people[0].user.id, { revision: 1, ...(committeeScope ? { policy: "ZCG_MAJORITY" } : { quorum: 2, approvalPercent: 67, durationHours: 24 }), ...input }, context);
  const begin = (roundId: string, index = 0, choice = "APPROVE") => beginDecisionSignature(host.id, recordId, roundId, people[index].user.id, { choice, rationale: "I reviewed the preserved proposal and its deliverables." }, context);
  const finish = (roundId: string, index: number, ceremony: Awaited<ReturnType<typeof begin>>, overrides = {}) => finishDecisionSignature(host.id, recordId, roundId, people[index].user.id, ceremony.ceremonyId,
    people[index].authenticator.authentication(ceremony.options.challenge, people[index].userHandle, overrides), context);
  return { people, host, committee, revision, recordId, create, begin, finish };
}

const { readProposalParticipationBoard } = await import("@/lib/services/archive-discussion");
const { readActivityReceipt, readArchiveActivity, prepareActivityBatch, exportActivityBatch } = await import("@/lib/services/activity-anchors");
const { verifyActivityBundle } = await import("@/lib/archive/activity");
const { decisionHash } = await import("@/lib/decisions/format");

describe.skipIf(!databaseUrl)("Signed decisions in PostgreSQL", () => {
  beforeEach(() => vi.stubEnv("PARTICIPATE_COMMITTEE_ENABLED", "true"));
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
  afterAll(() => prisma.$disconnect());
  it("waits for five responses and accepts a vote months later without a deadline", async () => {
    const f = await fixture(), round = await f.create();
    await f.finish(round.id, 0, await f.begin(round.id));
    await f.finish(round.id, 1, await f.begin(round.id, 1));
    await f.finish(round.id, 2, await f.begin(round.id, 2, "ABSTAIN"));
    const waiting = await readDecisionReceipt(f.host.id, f.recordId, round.id);
    expect(waiting.round.closesAt).toBeNull();
    expect(await verifyDecisionReceipt(waiting)).toMatchObject({ outcome: "OPEN", signed: 3 });
    await f.finish(round.id, 3, await f.begin(round.id, 3));
    const decided = await readDecisionReceipt(f.host.id, f.recordId, round.id);
    expect(await verifyDecisionReceipt(decided)).toMatchObject({ outcome: "OPEN", signed: 4 });
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(Date.now() + 90 * 86400000);
    expect((await readSignedDecisions(f.host.id, f.recordId, 1, f.people[4].user.id, context)).canSign).toBe(true);
    await f.finish(round.id, 4, await f.begin(round.id, 4, "REJECT"));
    const receipt = await readDecisionReceipt(f.host.id, f.recordId, round.id);
    expect(await verifyDecisionReceipt(receipt)).toMatchObject({ signed: 5, approve: 3, reject: 1, abstain: 1, quorumMet: true, outcome: "APPROVED", chainStatus: "NOT_ANCHORED" });
    for (const p of f.people) { expect(JSON.stringify(receipt)).not.toContain(p.user.id); expect(JSON.stringify(receipt)).not.toContain(p.user.email); expect(JSON.stringify(receipt)).not.toContain(p.key.credentialId); }
    expect(receipt.roundHash).toBe(waiting.roundHash);
    expect(Date.parse(receipt.asOf)).toBe(Date.now());
    expect((await readSignedDecisions(f.host.id, f.recordId, 1, f.people[0].user.id, context)).myChoice).toBe("APPROVE");
    expect(await prisma.poll.count({ where: { communityId: f.host.id } })).toBe(0);
    expect(await prisma.archiveAnchor.count({ where: { revisionId: f.revision.id } })).toBe(0);
  });
  it("hides partial positions, publishes the fifth response once and binds a stable receipt to activity", async () => {
    const f = await fixture(), round = await f.create();
    for (let i = 0; i < 4; i++) await f.finish(round.id, i, await f.begin(round.id, i, i === 3 ? "ABSTAIN" : "APPROVE"));
    const pending = await readSignedDecisions(f.host.id, f.recordId, 1, undefined, null);
    expect(pending).toMatchObject({ publication: "COLLECTING", progress: { signed: 4, eligible: 5 }, ballots: [] });
    expect(pending.tally).toBeUndefined(); expect(pending.myChoice).toBeNull();
    expect((await readSignedDecisions(f.host.id, f.recordId, 1, f.people[0].user.id, context)).myChoice).toBe("APPROVE");
    await expect(readPublishedDecisionReceipt(f.host.id, f.recordId, round.id)).rejects.toMatchObject({ code: "DECISION_NOT_PUBLISHED" });
    const before = await readProposalParticipationBoard(f.host.id, null);
    expect(before.proposals[0].review).toEqual({ roundId: round.id, revision: 1, signed: 4, eligible: 5, state: "COLLECTING" });
    expect(await prisma.archiveActivityEvent.count({ where: { archiveId: f.revision.archiveId } })).toBe(0);
    await f.finish(round.id, 4, await f.begin(round.id, 4, "REJECT"));
    const published = await readPublishedDecisionReceipt(f.host.id, f.recordId, round.id);
    const fingerprint = await decisionHash(published);
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(Date.now() + 3600000);
    expect(await decisionHash(await readPublishedDecisionReceipt(f.host.id, f.recordId, round.id))).toBe(fingerprint);
    const after = await readProposalParticipationBoard(f.host.id, null);
    expect(after.proposals[0].review).toMatchObject({ state: "PUBLISHED", outcome: "APPROVED", signed: 5, approve: 3, reject: 1, abstain: 1 });
    expect(after.proposals[0].review?.state === "PUBLISHED" && after.proposals[0].review.positions).toHaveLength(5);
    const rows = await prisma.archiveActivityEvent.findMany({ where: { archiveId: f.revision.archiveId } });
    expect(rows).toHaveLength(1);
    const activity = await readActivityReceipt(f.host.id, f.recordId, rows[0].id);
    expect(activity?.event).toMatchObject({ kind: "REVIEW_DECIDED", authority: "INDEPENDENT_PILOT_REVIEW", receiptHash: fingerprint, outcome: "APPROVED" });
    const scoped = await readArchiveActivity(f.host.id, f.recordId, undefined, round.id);
    expect(scoped?.items).toHaveLength(1);
    expect(scoped?.items[0]).toMatchObject({ kind: "REVIEW_DECIDED", state: "RECORDED", review: { roundId: round.id, revision: 1, receiptHash: fingerprint } });
    expect((await readArchiveActivity(f.host.id, f.recordId, undefined, "00000000-0000-4000-8000-000000000000"))?.items).toEqual([]);
    expect(activity?.bundle.inclusion).toBeNull(); expect(activity?.bundle.chain).toBeNull();
    expect(JSON.parse(activity!.bundle.reviewReceipt!)).toEqual(published);
    await verifyActivityBundle(activity!.bundle, rows[0].eventHash);
    await expect(verifyActivityBundle({ ...activity!.bundle, reviewReceipt: activity!.bundle.reviewReceipt!.replace("I reviewed", "I ignored") }, rows[0].eventHash)).rejects.toThrow("fingerprint");
    const config = { network: "testnet" as const, receiver: "ztestsapling1" + "q".repeat(60), publicViewingKey: "zxviewtestsapling1" + "q".repeat(80), birthdayHeight: 80, walletVersion: "0.1.0-beta.3", requiredConfirmations: 10, reader: { url: "http://127.0.0.1:28233" }, chain: { url: "http://127.0.0.1:18232" } };
    // Freezes a local commitment only; no transport or blockchain call is made.
    const batch = await prepareActivityBatch(f.host.id, config);
    expect(batch?.leafCount).toBe(1);
    const anchoredBundle = await exportActivityBatch(batch!.id);
    expect(anchoredBundle.txid).toBeNull();
    expect(anchoredBundle.events[0].reviewReceipt).toBe(activity!.bundle.reviewReceipt);
    await verifyActivityBundle(anchoredBundle.events[0], rows[0].eventHash);
    await expect(f.begin(round.id, 4)).rejects.toMatchObject({ code: "DECISION_ALREADY_SIGNED" });
    expect(await prisma.archiveActivityEvent.count({ where: { archiveId: f.revision.archiveId } })).toBe(1);
    for (const person of f.people) expect(JSON.stringify(activity)).not.toContain(person.user.email);
  });
  it("rolls back the fifth vote if its public activity record cannot be saved", async () => {
    const f = await fixture(), round = await f.create();
    for (let i = 0; i < 4; i++) await f.finish(round.id, i, await f.begin(round.id, i));
    const ceremony = await f.begin(round.id, 4);
    const activity = await import("@/lib/services/archive-activity");
    const fail = vi.spyOn(activity, "appendArchiveActivity").mockRejectedValueOnce(new Error("Synthetic publication failure"));
    try { await expect(f.finish(round.id, 4, ceremony)).rejects.toThrow("Synthetic publication failure"); }
    finally { fail.mockRestore(); }
    expect((await readDecisionReceipt(f.host.id, f.recordId, round.id)).ballots).toHaveLength(4);
    expect(await prisma.archiveActivityEvent.count({ where: { archiveId: f.revision.archiveId } })).toBe(0);
    await expect(f.finish(round.id, 4, ceremony)).rejects.toMatchObject({ code: "PASSKEY_EXPIRED" });
    await f.finish(round.id, 4, await f.begin(round.id, 4));
    expect((await readPublishedDecisionReceipt(f.host.id, f.recordId, round.id)).ballots).toHaveLength(5);
    expect(await prisma.archiveActivityEvent.count({ where: { archiveId: f.revision.archiveId } })).toBe(1);
  });
  it("rejects an external manager, stale revision, impossible quorum and a second round", async () => {
    const f = await fixture();
    const outsider = await prisma.user.create({ data: { nick: randomUUID(), role: "ADMIN", passwordHash: "none" } });
    await prisma.communityMembership.create({ data: { userId: outsider.id, communityId: f.host.id, role: "OWNER" } });
    await expect(createDecisionRound(f.host.id, f.recordId, outsider.id, { revision: 1, quorum: 1, approvalPercent: 51, durationHours: 1 }, context)).rejects.toMatchObject({ code: "DECISION_MANAGER_REQUIRED" });
    await expect(f.create({ revision: 2 })).rejects.toMatchObject({ code: "DECISION_REVISION_CHANGED" });
    await expect(f.create({ durationHours: 24 })).rejects.toThrow();
    await expect(createDecisionRound(f.host.id, f.recordId, f.people[0].user.id, { revision: 1, quorum: 2, approvalPercent: 67, durationHours: 24 }, context)).rejects.toMatchObject({ code: "DECISION_INVALID_POLICY" });
    await f.create(); await expect(f.create()).rejects.toMatchObject({ code: "DECISION_ALREADY_EXISTS" });
  });
  it("does not silently drop unverified reviewers or people missing a passkey", async () => {
    const f = await fixture();
    await prisma.user.update({ where: { id: f.people[1].user.id }, data: { emailVerifiedAt: null } });
    await expect(f.create()).rejects.toMatchObject({ code: "DECISION_ROSTER_NOT_READY" });
    const view = await readSignedDecisions(f.host.id, f.recordId, 1, f.people[0].user.id, context);
    expect(view.roster).toHaveLength(5); expect(view.canCreate).toBe(false);
    await prisma.user.update({ where: { id: f.people[1].user.id }, data: { emailVerifiedAt: new Date() } });
    await prisma.passkey.update({ where: { id: f.people[2].key.id }, data: { revokedAt: new Date() } });
    await expect(f.create()).rejects.toMatchObject({ code: "DECISION_ROSTER_NOT_READY" });
  });
  it("accepts a ceremony once under concurrency and rejects a second ballot", async () => {
    const f = await fixture(), round = await f.create(), ceremony = await f.begin(round.id);
    const results = await Promise.allSettled([f.finish(round.id, 0, ceremony), f.finish(round.id, 0, ceremony)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    await expect(f.begin(round.id)).rejects.toMatchObject({ code: "DECISION_ALREADY_SIGNED" });
    expect(await prisma.signedDecisionBallot.count({ where: { roundId: round.id } })).toBe(1);
  });
  it.each(["wrong-origin", "no-uv", "cross-origin", "wrong-account", "wrong-record"])("rejects %s and never creates a ballot", async fault => {
    const f = await fixture(), round = await f.create(), ceremony = await f.begin(round.id);
    const response = f.people[0].authenticator.authentication(ceremony.options.challenge, f.people[0].userHandle, {
      ...(fault === "wrong-origin" ? { origin: "https://wrong.example" } : {}), ...(fault === "no-uv" ? { verified: false } : {}), ...(fault === "cross-origin" ? { crossOrigin: true } : {})
    });
    await expect(finishDecisionSignature(f.host.id, fault === "wrong-record" ? "different-proposal" : f.recordId, round.id,
      f.people[fault === "wrong-account" ? 1 : 0].user.id, ceremony.ceremonyId, response, context)).rejects.toThrow();
    expect(await prisma.signedDecisionBallot.count({ where: { roundId: round.id } })).toBe(0);
  });
  it("consumes invalid signatures and superseded challenges", async () => {
    const f = await fixture(), round = await f.create(), first = await f.begin(round.id), second = await f.begin(round.id, 0, "REJECT");
    await expect(f.finish(round.id, 0, first)).rejects.toMatchObject({ code: "PASSKEY_EXPIRED" });
    await expect(f.finish(round.id, 0, second, { verified: false })).rejects.toMatchObject({ code: "PASSKEY_INVALID" });
    await expect(f.finish(round.id, 0, second)).rejects.toMatchObject({ code: "PASSKEY_EXPIRED" });
  });
  it.each(["revoked", "disabled", "expired", "long-expired"])("blocks a %s signer before storing a ballot", async fault => {
    const f = await fixture(), round = await f.create(), ceremony = await f.begin(round.id);
    if (fault === "revoked") await prisma.passkey.update({ where: { id: f.people[0].key.id }, data: { revokedAt: new Date() } });
    if (fault === "disabled") await prisma.user.update({ where: { id: f.people[0].user.id }, data: { status: "DISABLED" } });
    if (fault === "expired" || fault === "long-expired") { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(Date.now() + (fault === "long-expired" ? 25 * 3600000 : 301000))); }
    await expect(f.finish(round.id, 0, ceremony)).rejects.toThrow();
    expect(await prisma.signedDecisionBallot.count({ where: { roundId: round.id } })).toBe(0);
  });
  it("keeps frozen membership after a roster change, but excludes new keys and people", async () => {
    const f = await fixture(), round = await f.create();
    await prisma.communityMembership.update({ where: { communityId_userId: { communityId: f.committee.id, userId: f.people[0].user.id } }, data: { status: "DISABLED" } });
    await f.finish(round.id, 0, await f.begin(round.id));
    const stranger = await prisma.user.create({ data: { nick: randomUUID(), email: `${randomUUID()}@example.test`, emailVerifiedAt: new Date(), passwordHash: "none", role: "USER" } });
    await prisma.communityMembership.create({ data: { userId: stranger.id, communityId: f.committee.id, role: "MANAGER" } });
    await expect(beginDecisionSignature(f.host.id, f.recordId, round.id, stranger.id, { choice: "APPROVE" }, context)).rejects.toMatchObject({ code: "DECISION_NOT_ELIGIBLE" });
    const ceremony = await f.begin(round.id, 1), replacement = await signingKey();
    await prisma.passkey.create({ data: { userId: f.people[1].user.id, credentialId: replacement.credential.id, publicKey: replacement.credential.publicKey, rpId: context.rpId, userHandle: replacement.userHandle, deviceType: "singleDevice", backedUp: false, label: "New key" } });
    await expect(finishDecisionSignature(f.host.id, f.recordId, round.id, f.people[1].user.id, ceremony.ceremonyId, replacement.authenticator.authentication(ceremony.options.challenge, replacement.userHandle), context)).rejects.toMatchObject({ code: "PASSKEY_INVALID" });
  });
  it("enforces append-only round, voter and ballot records in the database", async () => {
    const f = await fixture(), round = await f.create();
    await f.finish(round.id, 0, await f.begin(round.id));
    await expect(prisma.signedDecisionRound.update({ where: { id: round.id }, data: { manifestJson: "{}" } })).rejects.toThrow();
    const voter = await prisma.signedDecisionVoter.findFirstOrThrow({ where: { roundId: round.id } });
    await expect(prisma.signedDecisionVoter.delete({ where: { id: voter.id } })).rejects.toThrow();
    await expect(prisma.signedDecisionBallot.deleteMany({ where: { roundId: round.id } })).rejects.toThrow();
  });
  it("uses the DAO member roster instead of manager permissions and blocks unlinked legacy members", async () => {
    const f = await fixture(false);
    await prisma.communityMembership.create({ data: { communityId: f.host.id, userId: f.people[0].user.id, role: "OWNER" } });
    await prisma.daoMember.createMany({ data: f.people.map((p, i) => ({ communityId: f.host.id, userId: p.user.id, nick: `Member ${i + 1}` })) });
    const legacy = await prisma.daoMember.create({ data: { communityId: f.host.id, nick: "Unlinked legacy member" } });
    await expect(f.create()).rejects.toMatchObject({ code: "DECISION_ROSTER_NOT_READY" });
    await prisma.daoMember.update({ where: { id: legacy.id }, data: { status: "REMOVED" } });
    const round = await f.create();
    await f.finish(round.id, 2, await f.begin(round.id, 2));
    const receipt = await readDecisionReceipt(f.host.id, f.recordId, round.id);
    expect(receipt.round.members).toHaveLength(3);
    expect(receipt.ballots).toHaveLength(1);
    expect(receipt.round.schema).toBe("PARTICIPATE_DECISION_ROUND_V2");
    expect(receipt.round.closesAt).not.toBeNull();
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(Date.parse(receipt.round.closesAt!) + 1000));
    await expect(f.begin(round.id, 1)).rejects.toMatchObject({ code: "DECISION_CLOSED" });
    const closed = await readDecisionReceipt(f.host.id, f.recordId, round.id);
    expect(closed.asOf).toBe(receipt.round.closesAt);
    expect(await verifyDecisionReceipt(closed)).toMatchObject({ outcome: "QUORUM_NOT_MET" });
  });
  it("limits repeated signing preparations without charging credits", async () => {
    const f = await fixture(), round = await f.create();
    await prisma.passkeyThrottle.create({ data: { id: `decision:${f.people[0].user.id}`, attempts: 10, resetsAt: new Date(Date.now() + 60000) } });
    await expect(f.begin(round.id)).rejects.toMatchObject({ code: "PASSKEY_RATE_LIMITED" });
    expect(await prisma.signedDecisionChallenge.count({ where: { roundId: round.id } })).toBe(0);
    expect(await prisma.creditOperation.count({ where: { userId: f.people[0].user.id } })).toBe(0);
  });
});
