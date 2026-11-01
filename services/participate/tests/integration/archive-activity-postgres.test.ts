// @vitest-environment node
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { readPilotPackages } from "@/lib/archive/catalog";
import { canonicalJson } from "@/lib/archive/format";
import type { ArchiveChainConfig } from "@/lib/archive/chain";

const databaseUrl = process.env.TREASURY_TEST_DATABASE_URL;
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (target.hostname !== "127.0.0.1" || target.port !== (process.env.PARTICIPATE_TEST_PORT ?? "55438") || target.pathname !== "/community_treasury_tests") throw new Error("Activity tests require the disposable local database");
}
const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? "postgresql://unused@127.0.0.1:1/unused" });
let rejectEvent = false;
const client = prisma.$extends({ query: { archiveActivityEvent: { async create({ args, query }) {
  if (rejectEvent) throw new Error("Event persistence failed");
  return query(args);
} } } });
vi.mock("@/lib/db", () => ({ db: client }));
const { publishArchiveRevision } = await import("@/lib/services/proposal-archives");
const { mutateArchiveDiscussion, setArchiveProposalLike } = await import("@/lib/services/archive-discussion");
const { backfillArchiveActivity } = await import("@/lib/services/archive-activity");
const { prepareActivityBatch, checkActivityBatch, readActivityReceipt, readArchiveActivity, exportActivityBatch } = await import("@/lib/services/activity-anchors");
const { claimPreviewCredits } = await import("@/lib/services/participation-credits");
const sample = (await readPilotPackages())[0], recordId = sample.manifest.recordId;
const config: ArchiveChainConfig = { network: "testnet", receiver: "ztestsapling1" + "q".repeat(60), publicViewingKey: "zxviewtestsapling1" + "q".repeat(80), birthdayHeight: 80, walletVersion: "0.1.0-beta.3", requiredConfirmations: 10, reader: { url: "http://127.0.0.1:28233" }, chain: { url: "http://127.0.0.1:18232" } };
const like = (liked = true) => ({ liked, requestKey: randomUUID(), policyVersion: 2 });
async function fixture() {
  const user = await prisma.user.create({ data: { nick: `activity-${randomUUID()}`, passwordHash: "test-only", role: "USER", displayName: "Private display name" } });
  const community = await prisma.community.create({ data: { name: "Activity test", slug: randomUUID(), createdById: user.id, participationMode: "CREDITS", commentCost: 2, reactionCost: 1, participationPolicyVersion: 2, memberships: { create: { userId: user.id, role: "OWNER" } } } });
  const revision = await publishArchiveRevision(community.id, sample.bundle, sample.manifestHash);
  await claimPreviewCredits(user.id, community.id);
  const session = { subjectType: "user" as const, userId: user.id, nick: user.nick, role: user.role };
  return { user, community, revision, session,
    post: (body = "Public comment", requestKey = randomUUID()) => mutateArchiveDiscussion(community.id, recordId, session, "post", { body, requestKey, policyVersion: 2 }),
    events: () => prisma.archiveActivityEvent.findMany({ where: { archiveId: revision.archiveId }, orderBy: { sequence: "asc" } }),
    balance: async () => (await prisma.creditAccount.findUniqueOrThrow({ where: { communityId_userId: { communityId: community.id, userId: user.id } } })).balance };
}
function observer(memo: () => string, txid: string): typeof fetch {
  const block = "b".repeat(64), tip = "c".repeat(64);
  return vi.fn(async (_url, init) => {
    const { method, params } = JSON.parse(String(init?.body)), now = Math.floor(Date.now() / 1000);
    const result = method === "rpc.discover" ? { info: { title: "Zallet", version: config.walletVersion }, methods: ["z_importviewingkey", "getwalletstatus", "z_viewtransaction"].map(name => ({ name })) }
      : method === "getblockchaininfo" ? { chain: "test", blocks: 100, headers: 100, verificationprogress: 1, bestblockhash: tip }
      : method === "z_importviewingkey" ? { address_type: "sapling", address: config.receiver }
      : method === "getwalletstatus" ? { wallet_tip: { height: 100, blockhash: tip }, locked: false }
      : method === "getblock" ? { hash: params[0], height: params[0] === tip ? 100 : 90, confirmations: params[0] === tip ? 1 : 11, time: params[0] === tip ? now : now - 750, tx: [txid] }
      : method === "getblockhash" ? params[0] === 100 ? tip : block
      : method === "z_viewtransaction" ? { txid, status: "mined", blockhash: block, outputs: [{ pool: "sapling", output: 0, address: config.receiver, memo: Buffer.from(memo()).toString("hex").padEnd(1024, "0") }] } : null;
    return new Response(JSON.stringify({ id: "archive-v1", result }));
  });
}

describe.skipIf(!databaseUrl)("transactional public activity and anchor batches", () => {
  beforeEach(() => { rejectEvent = false; vi.stubEnv("DATABASE_URL", databaseUrl!); vi.stubEnv("WORKSPACE_PREVIEW", "true"); vi.stubEnv("NODE_ENV", "test"); });
  afterEach(() => { rejectEvent = false; vi.unstubAllEnvs(); });
  afterAll(() => prisma.$disconnect());
  it("records concurrent retries once, preserves unlike/history and keeps identifiers private", async () => {
    const f = await fixture(), request = randomUUID();
    const posts = await Promise.all([f.post("Exact text", request), f.post("Exact text", request)]);
    expect(posts[0].id).toBe(posts[1].id);
    const action = like();
    await Promise.all([setArchiveProposalLike(f.community.id, recordId, f.session, action), setArchiveProposalLike(f.community.id, recordId, f.session, action)]);
    await setArchiveProposalLike(f.community.id, recordId, f.session, like(false));
    await setArchiveProposalLike(f.community.id, recordId, f.session, action);
    await mutateArchiveDiscussion(f.community.id, recordId, f.session, "reaction", like(), posts[0].id);
    await mutateArchiveDiscussion(f.community.id, recordId, f.session, "reaction", like(false), posts[0].id);
    const rows = await f.events();
    expect(rows).toHaveLength(5); expect(await f.balance()).toBe(21);
    rows.forEach((row, i) => expect(JSON.parse(row.eventJson)).toMatchObject({ sequence: i + 1, previousEventHash: rows[i - 1]?.eventHash ?? null, origin: "LIVE" }));
    const serialized = canonicalJson(await readActivityReceipt(f.community.id, recordId, rows[0].id));
    for (const privateValue of [f.user.id, f.user.nick, f.user.displayName!, request, "passwordHash", "sourceKey"]) expect(serialized).not.toContain(privateValue);
    expect((await readActivityReceipt(f.community.id, recordId, rows[0].id))?.bundle.body).toBe("Exact text");
    expect(await readActivityReceipt("another-community", recordId, rows[0].id)).toBeNull();
    await expect(prisma.archiveActivityEvent.update({ where: { id: rows[0].id }, data: { sourceKey: "altered" } })).rejects.toThrow();
    await expect(prisma.archiveActivityEvent.delete({ where: { id: rows[0].id } })).rejects.toThrow();
  });
  it("rolls back comments, likes and credits when the event cannot be recorded", async () => {
    const f = await fixture(); rejectEvent = true;
    await expect(f.post()).rejects.toThrow("Event persistence failed");
    await expect(setArchiveProposalLike(f.community.id, recordId, f.session, like())).rejects.toThrow("Event persistence failed");
    expect(await f.events()).toHaveLength(0); expect(await f.balance()).toBe(25);
    expect(await prisma.archiveComment.count({ where: { archiveId: f.revision.archiveId } })).toBe(0);
    expect(await prisma.archiveProposalLikeRequest.count({ where: { archiveId: f.revision.archiveId } })).toBe(0);
  });
  it("records moderation once and never restores hidden text through receipts or exports", async () => {
    const f = await fixture(), comment = await f.post("Withdraw this from public serving");
    const batch = (await prepareActivityBatch(f.community.id, config))!;
    await mutateArchiveDiscussion(f.community.id, recordId, f.session, "hide", { reason: "Off topic" }, comment.id);
    await mutateArchiveDiscussion(f.community.id, recordId, f.session, "hide", { reason: "Off topic" }, comment.id);
    const rows = await f.events(); expect(rows).toHaveLength(2);
    expect(JSON.parse(rows[1].eventJson).kind).toBe("COMMENT_HIDDEN");
    expect((await readActivityReceipt(f.community.id, recordId, rows[0].id))?.bundle).toMatchObject({ eventHash: rows[0].eventHash, body: null });
    expect(JSON.stringify(await exportActivityBatch(batch.id))).not.toContain("Withdraw this");
  });
  it("freezes and reuses batches, verifies actual RPC-shaped observations, rejects replacement and supersedes failed checks", async () => {
    const f = await fixture(); await f.post(); await setArchiveProposalLike(f.community.id, recordId, f.session, like());
    const batch = (await prepareActivityBatch(f.community.id, config))!;
    expect(batch.leafCount).toBe(2);
    await f.post("Arrived after freezing");
    expect((await prepareActivityBatch(f.community.id, config))?.id).toBe(batch.id);
    await expect(prepareActivityBatch(f.community.id, { ...config, receiver: "ztestsapling1" + "x".repeat(60) })).rejects.toThrow("ANCHOR_CONFIGURATION_CHANGED");
    const txid = "a".repeat(64); let memo = "wrong";
    const rpc = observer(() => memo, txid);
    await expect(checkActivityBatch(batch.id, txid, config, rpc)).rejects.toThrow("MEMO_MISMATCH");
    expect((await prisma.archiveActivityBatch.findUniqueOrThrow({ where: { id: batch.id } })).txid).toBeNull();
    memo = batch.memo; await checkActivityBatch(batch.id, txid, config, rpc); await checkActivityBatch(batch.id, txid, config, rpc);
    const rows = await f.events();
    expect((await readActivityReceipt(f.community.id, recordId, rows[0].id))?.proof.state).toBe("VERIFIED");
    await expect(checkActivityBatch(batch.id, "f".repeat(64), config, rpc)).rejects.toThrow("ALREADY_DISPATCHED");
    const next = (await prepareActivityBatch(f.community.id, config))!; expect(next.id).not.toBe(batch.id); expect(next.leafCount).toBe(1);
    await expect(prisma.archiveActivityBatch.update({ where: { id: batch.id }, data: { root: "0".repeat(64) } })).rejects.toThrow();
    await expect(prisma.archiveActivityInclusion.delete({ where: { eventId: rows[0].id } })).rejects.toThrow();
    memo = "orphaned or mismatched"; await expect(checkActivityBatch(batch.id, txid, config, rpc)).rejects.toThrow();
    expect((await readActivityReceipt(f.community.id, recordId, rows[0].id))?.proof).toMatchObject({ state: "CHECK_REQUIRED", chain: null });
    const methods = vi.mocked(rpc).mock.calls.map(([, init]) => JSON.parse(String(init?.body)).method);
    expect(methods).not.toContain("z_sendmany"); expect(methods).not.toContain("pczt_sign");
  });
  it("imports existing actions with their original dates and a separate capture time without inventing chain evidence", async () => {
    const f = await fixture(), original = new Date("2026-10-09T00:00:00Z");
    await prisma.archiveComment.create({ data: { archiveId: f.revision.archiveId, authorId: f.user.id, authorLabel: "Legacy name", body: "Existing public text", requestKey: randomUUID(), createdAt: original } });
    await backfillArchiveActivity(f.community.id); await backfillArchiveActivity(f.community.id);
    const rows = await f.events(); expect(rows).toHaveLength(1);
    const event = JSON.parse(rows[0].eventJson);
    expect(event).toMatchObject({ origin: "IMPORTED", occurredAt: original.toISOString() });
    expect(Date.parse(event.recordedAt)).toBeGreaterThan(original.getTime());
    expect((await readArchiveActivity(f.community.id, recordId))?.items[0].state).toBe("RECORDED");
    await f.post("New action"); expect(JSON.parse((await f.events())[1].eventJson).origin).toBe("LIVE");
  });
});

describe.skipIf(!databaseUrl)("versioned discussion", () => {
  beforeEach(() => { rejectEvent = false; vi.stubEnv("DATABASE_URL", databaseUrl!); vi.stubEnv("WORKSPACE_PREVIEW", "true"); vi.stubEnv("NODE_ENV", "test"); });
  afterEach(() => { rejectEvent = false; vi.unstubAllEnvs(); });
  it("preserves text/proofs and old endorsements across edits, retries and new-version likes", async () => {
    const f = await fixture(), originalRequest = randomUUID(), first = await f.post("First version 🛡️", originalRequest);
    await mutateArchiveDiscussion(f.community.id, recordId, f.session, "reaction", { ...like(), version: 1 }, first.id);
    const post = (await f.events())[0], before = (await readActivityReceipt(f.community.id, recordId, post.id))!.bundle;
    const request = { body: "Updated perspective", version: 1, requestKey: randomUUID() };
    const [a, b] = await Promise.all([mutateArchiveDiscussion(f.community.id, recordId, f.session, "edit", request, first.id), mutateArchiveDiscussion(f.community.id, recordId, f.session, "edit", request, first.id)]);
    expect(a).toEqual(b); expect(a).toMatchObject({ version: 2, body: request.body, reaction: { count: 0, likedByMe: false } });
    expect(await f.post("First version 🛡️", originalRequest)).toMatchObject({ version: 2 });
    expect((await readActivityReceipt(f.community.id, recordId, post.id))!.bundle).toEqual(before);
    expect(await prisma.archiveComment.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ body: "First version 🛡️", currentVersion: 2 });
    await expect(mutateArchiveDiscussion(f.community.id, recordId, f.session, "reaction", like(), first.id)).rejects.toMatchObject({ code: "COMMENT_VERSION_CHANGED" });
    const balance = await f.balance(), reaction = { ...like(), version: 2 };
    await Promise.all([mutateArchiveDiscussion(f.community.id, recordId, f.session, "reaction", reaction, first.id), mutateArchiveDiscussion(f.community.id, recordId, f.session, "reaction", reaction, first.id)]);
    expect(await f.balance()).toBe(balance - 1);
    const { readArchiveCommentHistory } = await import("@/lib/services/archive-discussion");
    expect((await readArchiveCommentHistory(f.community.id, recordId, first.id)).versions).toEqual(expect.arrayContaining([expect.objectContaining({ version: 1, likes: 1 }), expect.objectContaining({ version: 2, likes: 1 })]));
    const events = (await f.events()).map(row => JSON.parse(row.eventJson));
    expect(events.filter(event => event.kind === "COMMENT_EDITED")).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ kind: "COMMENT_LIKE_SET", version: 2 });
  });
  it("author withdrawal keeps text in history and proofs while moderation still suppresses every version", async () => {
    const f = await fixture(), comment = await f.post("Withdraw these bytes");
    await mutateArchiveDiscussion(f.community.id, recordId, f.session, "edit", { body: "Updated version 🛡️", version: 1, requestKey: randomUUID() }, comment.id);
    const reply = await mutateArchiveDiscussion(f.community.id, recordId, f.session, "post", { body: "A reply", parentId: comment.id, requestKey: randomUUID(), policyVersion: 2 });
    const request = { version: 2, requestKey: randomUUID() };
    expect(await mutateArchiveDiscussion(f.community.id, recordId, f.session, "withdraw", request, comment.id)).toMatchObject({ withdrawn: true, body: null, canEdit: false, canWithdraw: false });
    await mutateArchiveDiscussion(f.community.id, recordId, f.session, "withdraw", request, comment.id);
    const { readArchiveDiscussion, readArchiveCommentHistory } = await import("@/lib/services/archive-discussion");
    expect((await readArchiveDiscussion(f.community.id, recordId, f.session)).comments).toEqual(expect.arrayContaining([expect.objectContaining({ id: reply.id, parentId: comment.id, body: "A reply" })]));
    expect((await readArchiveCommentHistory(f.community.id, recordId, comment.id)).versions.map(version => version.body)).toEqual(["Updated version 🛡️", "Withdraw these bytes"]);
    const events = await f.events();
    expect(events.filter(row => JSON.parse(row.eventJson).kind === "COMMENT_WITHDRAWN")).toHaveLength(1);
    expect((await readActivityReceipt(f.community.id, recordId, events[0].id))!.bundle.body).toBe("Withdraw these bytes");
    expect((await readActivityReceipt(f.community.id, recordId, events[1].id))!.bundle.body).toBe("Updated version 🛡️");
    await mutateArchiveDiscussion(f.community.id, recordId, f.session, "hide", { reason: "Off topic" }, comment.id);
    expect((await readArchiveCommentHistory(f.community.id, recordId, comment.id)).versions.every(version => version.body === null)).toBe(true);
    expect((await readActivityReceipt(f.community.id, recordId, events[0].id))!.bundle.body).toBeNull();
    expect((await readActivityReceipt(f.community.id, recordId, events[1].id))!.bundle.body).toBeNull();
    await expect(mutateArchiveDiscussion(f.community.id, recordId, f.session, "edit", { version: 1, body: "Replacement", requestKey: randomUUID() }, comment.id)).rejects.toMatchObject({ code: "COMMENT_UNAVAILABLE" });
    await expect(prisma.archiveCommentVersion.updateMany({ where: { commentId: comment.id }, data: { body: "Erased" } })).rejects.toThrow();
    await expect(prisma.archiveComment.delete({ where: { id: comment.id } })).rejects.toThrow();
  });
  it("rejects cross-author changes, stale edits and reused keys with different contents", async () => {
    const f = await fixture(), other = await fixture(), comment = await f.post();
    const edit = { version: 1, body: "New text", requestKey: randomUUID() };
    for (const action of ["edit", "withdraw"] as const) await expect(mutateArchiveDiscussion(f.community.id, recordId, other.session, action, edit, comment.id)).rejects.toMatchObject({ code: "forbidden" });
    await mutateArchiveDiscussion(f.community.id, recordId, f.session, "edit", edit, comment.id);
    await expect(mutateArchiveDiscussion(f.community.id, recordId, f.session, "edit", { ...edit, body: "Different" }, comment.id)).rejects.toMatchObject({ code: "COMMENT_IDEMPOTENCY_CONFLICT" });
    await expect(mutateArchiveDiscussion(f.community.id, recordId, f.session, "edit", { ...edit, requestKey: randomUUID() }, comment.id)).rejects.toMatchObject({ code: "COMMENT_VERSION_CHANGED" });
  });
  it("rolls back a new version and a withdrawal if their audit event cannot be persisted", async () => {
    const f = await fixture(), comment = await f.post(); rejectEvent = true;
    await expect(mutateArchiveDiscussion(f.community.id, recordId, f.session, "edit", { version: 1, body: "Never committed", requestKey: randomUUID() }, comment.id)).rejects.toThrow();
    await expect(mutateArchiveDiscussion(f.community.id, recordId, f.session, "withdraw", { version: 1, requestKey: randomUUID() }, comment.id)).rejects.toThrow();
    expect(await prisma.archiveComment.findUniqueOrThrow({ where: { id: comment.id } })).toMatchObject({ currentVersion: 1, withdrawnAt: null });
    expect(await prisma.archiveCommentVersion.count({ where: { commentId: comment.id } })).toBe(1);
  });
});
