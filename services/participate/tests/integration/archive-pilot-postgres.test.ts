// @vitest-environment node
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { readPilotPackages } from "@/lib/archive/catalog";
import { canonicalJson, sha256, utf8 } from "@/lib/archive/format";
import type { ArchiveChainConfig } from "@/lib/archive/chain";

const databaseUrl = process.env.TREASURY_TEST_DATABASE_URL;
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (target.hostname !== "127.0.0.1" || target.port !== (process.env.PARTICIPATE_TEST_PORT ?? "55438") || target.pathname !== "/community_treasury_tests") throw new Error("Archive tests require the dedicated local test database");
}
const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? "postgresql://unused@127.0.0.1:1/unused" });
vi.mock("@/lib/db", () => ({ db: prisma }));
const { publishArchiveRevision, readArchiveRevision } = await import("@/lib/services/proposal-archives");
const { readArchiveDiscussion, mutateArchiveDiscussion } = await import("@/lib/services/archive-discussion");
const { prepareArchiveAnchor, submitArchiveAnchor, refreshArchiveOperation, checkArchiveAnchor, prepareArchiveBatch, checkExternalArchiveBatch } = await import("@/lib/services/archive-anchors");
const users: string[] = [], communities: string[] = [];
const item = (await readPilotPackages())[0];
const config: ArchiveChainConfig = { network: "testnet", receiver: "ztestsapling1" + "q".repeat(60), publicViewingKey: "zxviewtestsapling1" + "q".repeat(80), birthdayHeight: 80, walletVersion: "0.1.0-beta.3", requiredConfirmations: 10, reader: { url: "http://127.0.0.1:28233" }, chain: { url: "http://127.0.0.1:18232" }, writer: { url: "http://127.0.0.1:28232" } };
async function fixture() {
  const owner = await prisma.user.create({ data: { nick: `archive-owner-${randomUUID()}`, passwordHash: "test-only", role: "USER" } });
  const member = await prisma.user.create({ data: { nick: `archive-member-${randomUUID()}`, passwordHash: "test-only", role: "USER" } });
  const outsider = await prisma.user.create({ data: { nick: `archive-outsider-${randomUUID()}`, passwordHash: "test-only", role: "ADMIN" } });
  users.push(owner.id, member.id, outsider.id);
  const community = await prisma.community.create({ data: { name: "Archive integration", slug: `archive-${randomUUID()}`, createdById: owner.id, memberships: { create: { userId: owner.id, role: "OWNER" } }, daoMembers: { create: { userId: member.id, nick: member.nick } } } });
  communities.push(community.id);
  const revision = await publishArchiveRevision(community.id, item.bundle, item.manifestHash);
  const session = (user: typeof owner) => ({ subjectType: "user" as const, userId: user.id, nick: user.nick, role: user.role });
  return { owner, member, outsider, community, revision, ownerSession: session(owner), memberSession: session(member), outsiderSession: session(outsider) };
}
const post = (body = "A pilot community perspective.") => ({ body, requestKey: randomUUID() });
function writerRpc(send: () => unknown, result?: unknown) {
  return vi.fn(async (_url: unknown, init?: RequestInit) => {
    const { method } = JSON.parse(String(init?.body));
    const value = method === "getblockchaininfo" ? { chain: "test" } : method === "z_exportviewingkey" ? config.publicViewingKey : method === "rpc.discover" ? { info: { title: "Zallet", version: config.walletVersion } } : method === "z_sendmany" ? send() : method === "z_getoperationstatus" ? result : null;
    return new Response(JSON.stringify({ id: "archive-v1", result: value }));
  }) as unknown as typeof fetch;
}

describe.skipIf(!databaseUrl)("archive pilot with PostgreSQL integrity guards", () => {
  it("imports a real-observation-shaped batch idempotently, guards its Merkle identity and supersedes failed checks", async () => {
    const f = await fixture(), second = (await readPilotPackages())[1];
    const revision2 = await publishArchiveRevision(f.community.id, second.bundle, second.manifestHash);
    const batch = await prepareArchiveBatch([f.revision.id, revision2.id], config);
    expect(batch.anchors).toHaveLength(2);
    expect((await prepareArchiveBatch([revision2.id, f.revision.id], config)).root).toBe(batch.root);
    const first = batch.anchors[0];
    await expect(prisma.archiveAnchor.update({ where: { id: first.id }, data: { state: "SUBMITTING", commitment: { altered: true } } })).rejects.toThrow();
    const txid = "a".repeat(64), block = "b".repeat(64), tip = "c".repeat(64), now = Math.floor(Date.now() / 1000);
    let memo = "not this batch";
    const methods: string[] = [];
    const observer: typeof fetch = async (_input, init) => {
      const { method, params } = JSON.parse(String(init?.body)); methods.push(method);
      const result = method === "rpc.discover" ? { info: { title: "Zallet", version: config.walletVersion }, methods: ["z_importviewingkey", "getwalletstatus", "z_viewtransaction"].map(name => ({ name })) }
        : method === "getblockchaininfo" ? { chain: "test", blocks: 100, headers: 100, verificationprogress: 1, bestblockhash: tip }
        : method === "z_importviewingkey" ? { address_type: "sapling", address: config.receiver }
        : method === "getwalletstatus" ? { wallet_tip: { height: 100, blockhash: tip }, fully_synced_height: 100, locked: false }
        : method === "getblock" ? { hash: params[0], height: params[0] === tip ? 100 : 90, confirmations: params[0] === tip ? 1 : 11, time: params[0] === tip ? now : now - 750, tx: [txid] }
        : method === "getblockhash" ? params[0] === 100 ? tip : block
        : method === "z_viewtransaction" ? { txid, status: "mined", blockhash: block, outputs: [{ pool: "sapling", output: 0, address: config.receiver, memo: Buffer.from(memo).toString("hex").padEnd(1024, "0") }] } : null;
      return new Response(JSON.stringify({ id: "archive-v1", result }));
    };
    const ids = batch.anchors.map(row => row.id);
    await expect(checkExternalArchiveBatch(ids, txid, config, observer)).rejects.toThrow("MEMO_MISMATCH");
    expect(await prisma.archiveAnchor.count({ where: { id: { in: ids }, state: "PREPARED" } })).toBe(2);
    memo = first.memo;
    expect((await checkExternalArchiveBatch(ids, txid, config, observer)).count).toBe(2);
    await checkExternalArchiveBatch(ids, txid, config, observer);
    expect(await prisma.archiveAnchorCheck.count({ where: { anchorId: { in: ids }, status: "VERIFIED" } })).toBe(4);
    expect(methods).not.toContain("z_sendmany"); expect(methods).not.toContain("pczt_sign");
    await expect(checkExternalArchiveBatch(ids, "d".repeat(64), config, observer)).rejects.toThrow("ALREADY_DISPATCHED");
    memo = "modified memo";
    await expect(checkExternalArchiveBatch(ids, txid, config, observer)).rejects.toThrow("MEMO_MISMATCH");
    expect(await prisma.archiveAnchorCheck.count({ where: { anchorId: { in: ids }, status: "UNVERIFIED" } })).toBe(2);
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    // Only the disposable named database guarded above. Include newer dependent
    // records (abandonments and signed decisions) when resetting archive fixtures.
    await prisma.$executeRawUnsafe('TRUNCATE "ArchiveActivityCheck", "ArchiveActivityInclusion", "ArchiveActivityBatch", "ArchiveActivityEvent", "ArchiveActivityActor", "ArchiveProposalLikeRequest", "ArchiveProposalLike", "ArchiveReactionRequest", "ArchiveReaction", "ArchiveComment", "ArchiveAnchorCheck", "ArchiveAnchor", "ArchiveRevision", "ProposalArchive" CASCADE');
    await prisma.daoMember.deleteMany({ where: { communityId: { in: communities } } });
    await prisma.communityMembership.deleteMany({ where: { communityId: { in: communities } } });
    await prisma.community.deleteMany({ where: { id: { in: communities } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });
  it("publishes recoverable revisions once without creating polls or replacing files", async () => {
    const f = await fixture();
    expect((await publishArchiveRevision(f.community.id, item.bundle, item.manifestHash)).id).toBe(f.revision.id);
    const altered = { ...item.bundle, manifest: canonicalJson({ ...item.manifest, title: "A changed title" }) };
    await expect(publishArchiveRevision(f.community.id, altered, await sha256(utf8(altered.manifest)))).rejects.toThrow("immutable revision");
    expect(await prisma.poll.count({ where: { communityId: f.community.id } })).toBe(0);
    await expect(prisma.archiveRevision.update({ where: { id: f.revision.id }, data: { packageJson: "{}" } })).rejects.toThrow();
    await expect(prisma.archiveRevision.delete({ where: { id: f.revision.id } })).rejects.toThrow();
    const next = { ...item.bundle, manifest: canonicalJson({ ...item.manifest, revision: 2, previousManifestHash: item.manifestHash }) };
    expect((await publishArchiveRevision(f.community.id, next, await sha256(utf8(next.manifest)))).revision).toBe(2);
    expect((await prisma.archiveRevision.findUniqueOrThrow({ where: { id: f.revision.id } })).packageJson).toBe(canonicalJson(item.bundle));
    const latest = await readArchiveRevision(f.community.id, item.manifest.recordId);
    expect(latest?.revision).toBe(2);
    expect(latest?.archive.revisions.map(row => row.revision)).toEqual([2, 1]);
    expect((await readArchiveRevision(f.community.id, item.manifest.recordId, 1))?.manifestHash).toBe(item.manifestHash);
    expect(await readArchiveRevision("another-community", item.manifest.recordId, 1)).toBeNull();
  });
  it("opens public participation to accounts without granting DAO authority and enforces moderation", async () => {
    const f = await fixture(), input = post();
    const publicContribution = await mutateArchiveDiscussion(f.community.id, item.manifest.recordId, f.outsiderSession, "post", post("A public account perspective"));
    expect(await prisma.daoMember.count({ where: { communityId: f.community.id, userId: f.outsider.id } })).toBe(0);
    await expect(mutateArchiveDiscussion(f.community.id, item.manifest.recordId, f.outsiderSession, "hide", { reason: "Not a community moderator" }, publicContribution.id)).rejects.toMatchObject({ code: "forbidden" });
    const results = await Promise.all(Array.from({ length: 3 }, () => mutateArchiveDiscussion(f.community.id, item.manifest.recordId, f.memberSession, "post", input)));
    expect(new Set(results.map(row => row.id)).size).toBe(1);
    expect(results[0].authorLabel).toMatch(/^Participant /);
    await expect(mutateArchiveDiscussion(f.community.id, item.manifest.recordId, f.memberSession, "post", { ...input, body: "Different payload" })).rejects.toMatchObject({ code: "COMMENT_IDEMPOTENCY_CONFLICT" });
    await expect(mutateArchiveDiscussion(f.community.id, item.manifest.recordId, f.memberSession, "hide", { reason: "Moderation" }, results[0].id)).rejects.toMatchObject({ code: "forbidden" });
    await mutateArchiveDiscussion(f.community.id, item.manifest.recordId, f.ownerSession, "hide", { reason: "Outside this discussion's scope" }, results[0].id);
    const publicView = await readArchiveDiscussion(f.community.id, item.manifest.recordId, null);
    expect(publicView.comments.find(comment => comment.id === results[0].id)).toMatchObject({ body: null, hidden: true, moderation: { reason: "Outside this discussion's scope" } });
    expect(publicView.comments.find(comment => comment.id === results[0].id)).not.toHaveProperty("authorId");
    expect(publicView.capabilities.canPost).toBe(false);
    expect((await prisma.archiveComment.findUniqueOrThrow({ where: { id: results[0].id } })).body).toBe(input.body);
    await expect(prisma.archiveComment.update({ where: { id: results[0].id }, data: { body: "Silently rewritten" } })).rejects.toThrow();
  });
  it("allows deeper replies while blocking foreign replies, disabled accounts and old reaction replay", async () => {
    const f = await fixture(), other = await fixture();
    const row = await mutateArchiveDiscussion(f.community.id, item.manifest.recordId, f.memberSession, "post", post());
    await expect(mutateArchiveDiscussion(other.community.id, item.manifest.recordId, other.memberSession, "post", { ...post(), parentId: row.id })).rejects.toMatchObject({ code: "PARENT_COMMENT_NOT_FOUND" });
    const reply = await mutateArchiveDiscussion(f.community.id, item.manifest.recordId, f.memberSession, "post", { ...post(), parentId: row.id });
    expect((await mutateArchiveDiscussion(f.community.id, item.manifest.recordId, f.memberSession, "post", { ...post(), parentId: reply.id })).parentId).toBe(reply.id);
    const like = { liked: true, requestKey: randomUUID() };
    await mutateArchiveDiscussion(f.community.id, item.manifest.recordId, f.memberSession, "reaction", like, row.id);
    await mutateArchiveDiscussion(f.community.id, item.manifest.recordId, f.memberSession, "reaction", { liked: false, requestKey: randomUUID() }, row.id);
    expect((await mutateArchiveDiscussion(f.community.id, item.manifest.recordId, f.memberSession, "reaction", like, row.id)).reaction?.likedByMe).toBe(false);
    await prisma.user.update({ where: { id: f.member.id }, data: { status: "DISABLED" } });
    await expect(mutateArchiveDiscussion(f.community.id, item.manifest.recordId, f.memberSession, "post", post())).rejects.toMatchObject({ code: "forbidden" });
    expect(await prisma.creditOperation.count({ where: { communityId: f.community.id } })).toBe(0);
  });
  it("keeps uncertain sends durable and never dispatches twice", async () => {
    const f = await fixture(); const anchor = await prepareArchiveAnchor(f.revision.id, config);
    expect((await prepareArchiveAnchor(f.revision.id, config)).id).toBe(anchor.id);
    vi.stubEnv("ARCHIVE_TESTNET_SIGNING_ENABLED", "true");
    const send = vi.fn(() => { throw new Error("connection lost after dispatch"); }); const rpc = writerRpc(send);
    await expect(submitArchiveAnchor(anchor.id, item.manifestHash, config, rpc)).rejects.toMatchObject({ code: "SUBMISSION_OUTCOME_UNKNOWN" });
    expect((await prisma.archiveAnchor.findUniqueOrThrow({ where: { id: anchor.id } })).state).toBe("UNKNOWN");
    await expect(submitArchiveAnchor(anchor.id, item.manifestHash, config, rpc)).rejects.toMatchObject({ code: "ALREADY_DISPATCHED" });
    expect(send).toHaveBeenCalledTimes(1);
    await expect(prisma.archiveAnchor.update({ where: { id: anchor.id }, data: { state: "PREPARED" } })).rejects.toThrow();
  });
  it("distinguishes a successful unbroadcast operation from inclusion", async () => {
    const f = await fixture(); const anchor = await prepareArchiveAnchor(f.revision.id, config);
    vi.stubEnv("ARCHIVE_TESTNET_SIGNING_ENABLED", "true");
    const rpc = writerRpc(() => "op-fixture", [{ id: "op-fixture", status: "success", result: { txids: ["a".repeat(64), "b".repeat(64)], broadcast: false } }]);
    await submitArchiveAnchor(anchor.id, item.manifestHash, config, rpc);
    expect(await refreshArchiveOperation(anchor.id, config, rpc)).toMatchObject({ state: "UNBROADCAST", txids: ["a".repeat(64), "b".repeat(64)] });
    const failure = vi.fn(async () => { throw new Error("unavailable credential-safe endpoint"); }) as unknown as typeof fetch;
    const check = await checkArchiveAnchor(anchor.id, config, failure);
    expect(check.status).toBe("UNVERIFIED");
    await expect(prisma.archiveAnchorCheck.update({ where: { id: check.id }, data: { status: "VERIFIED" } })).rejects.toThrow();
  });
});
