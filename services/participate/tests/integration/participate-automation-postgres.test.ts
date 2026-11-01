// @vitest-environment node
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { buildSourceProposal } from "@/lib/archive/source-proposals";
import { canonicalJson } from "@/lib/archive/format";
import { buildArchiveMerkleTree, verifyArchiveMerkleProof } from "@/lib/archive/merkle";
import { buildNativeProposalPackage } from "@/lib/archive/native-proposals";
import { AutomationTransportError, type AutomationTransport } from "@/lib/archive/automation-transport";
import type { ArchiveChainConfig } from "@/lib/archive/chain";

const url = process.env.TREASURY_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== (process.env.PARTICIPATE_TEST_PORT ?? "55438") || parsed.pathname !== "/community_treasury_tests") throw new Error("Disposable database required");
}
const prisma = new PrismaClient({ datasourceUrl: url ?? "postgresql://unused@127.0.0.1:1/unused" });
vi.mock("@/lib/db", () => ({ db: prisma }));
const observe = vi.hoisted(() => vi.fn());
vi.mock("@/lib/archive/chain", async original => ({ ...await original<typeof import("@/lib/archive/chain")>(), createArchiveObserver: () => observe }));
const { runParticipateAutomation, participateAutomationPolicyHash } = await import("@/lib/services/participate-automation");
const { migrateParticipateAutomationToIronwood } = await import("@/lib/services/participate-automation-policy");
const { publishArchiveRevision } = await import("@/lib/services/proposal-archives");
const { prepareArchiveBatch, checkExternalArchiveBatch } = await import("@/lib/services/archive-anchors");
const anchorService = await import("@/lib/services/archive-anchors");
const merkleService = await import("@/lib/archive/merkle");
const legacyChain: ArchiveChainConfig = { network: "mainnet", receiver: "zs1" + "a".repeat(70), publicViewingKey: "zxview" + "b".repeat(150), birthdayHeight: 1,
  walletVersion: "0.1.0-beta.3", requiredConfirmations: 10, reader: { url: "http://127.0.0.1:28244" }, chain: { url: "http://127.0.0.1:8232" } };
const chain: ArchiveChainConfig = { ...legacyChain, pool: "ironwood", receiver: "u1" + "q".repeat(100), publicViewingKey: "uview1" + "q".repeat(150), receiverIndex: 0 };

async function fixture() {
  const user = await prisma.user.create({ data: { nick: randomUUID(), passwordHash: "synthetic", role: "USER" } });
  const host = await prisma.community.create({ data: { name: "Automation test", slug: randomUUID(), createdById: user.id } });
  const committee = await prisma.community.create({ data: { name: "Committee", slug: randomUUID(), kind: "COMMITTEE", createdById: user.id } });
  vi.stubEnv("PARTICIPATE_COMMUNITY_ID", host.id); vi.stubEnv("PARTICIPATE_DEMO_COMMITTEE_ID", committee.id);
  const issue = { number: 999001, html_url: "https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/999001", title: "Synthetic integration test only",
    body: "# Public Markdown\n\nExact text.\n", state: "open", created_at: new Date(Date.now() - 300_000).toISOString(), updated_at: new Date(Date.now() - 60_000).toISOString(),
    user: { login: "test-author" }, labels: [{ name: "📋 Grant Application", color: "bbbb55", description: null }, { name: "👀 Ready For ZCG Review", color: "005555", description: null }] };
  const config = { startedAt: new Date(Date.now() - 600_000), chain };
  const sourceResponse = (input: RequestInfo | URL, candidates: unknown[] = [issue]) => {
    const pathname = new URL(String(input)).pathname;
    if (pathname.endsWith("/events") || pathname.endsWith("/comments")) return Response.json([]);
    if (pathname.endsWith(`/issues/${issue.number}`)) return Response.json(issue);
    return Response.json(candidates);
  };
  const fetcher = vi.fn().mockImplementation(async input => sourceResponse(input));
  const anchor = vi.fn().mockImplementation(async request => ({ state: "BROADCAST", root: request.root, txid: "c".repeat(64), feeZat: 30000, pool: "ironwood" }));
  const transport: AutomationTransport = { anchor, fetcher: vi.fn() };
  observe.mockResolvedValue({ version: "ZVOICE_CHAIN_CHECK_V1", network: "mainnet", txid: "c".repeat(64), memo: "checked by mock observer", confirmations: 3, requiredConfirmations: 10, blockHeight: 100 });
  const due = () => prisma.participateAutomationJob.updateMany({ where: { hostId: host.id }, data: { nextAttemptAt: new Date(0) } });
  return { host, committee, issue, config, fetcher, sourceResponse, anchor, transport, due };
}

async function queueSources(f: Awaited<ReturnType<typeof fixture>>, count: number, start = 999101) {
  f.fetcher.mockImplementation(async input => f.sourceResponse(input, []));
  const jobs = [];
  for (let index = 0; index < count; index++) {
    const number = start + index;
    const issue = { ...f.issue, number, html_url: `https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/${number}`,
      title: `Synthetic batch source ${number}`, body: `${f.issue.body}\nSource ${number}.\n` };
    const captured = await buildSourceProposal(issue, number, new Date().toISOString());
    jobs.push(await prisma.participateAutomationJob.create({ data: { hostId: f.host.id, committeeId: f.committee.id, issueNumber: number,
      sourceUrl: issue.html_url, manifestHash: captured.manifestHash, packageJson: canonicalJson(captured.bundle) } }));
  }
  return jobs;
}

describe.skipIf(!url)("durable automatic source-to-anchor queue", () => {
  beforeEach(() => {
    vi.stubEnv("PARTICIPATE_PUBLIC_DEMO", "true"); vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("APP_BASE_URL", "https://participate.example.org");
    observe.mockReset(); vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  afterAll(() => prisma.$disconnect());

  it("captures full Markdown, imports Under review, sends once, then verifies without resending", async () => {
    const f = await fixture();
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "CONFIRMING" });
    const job = await prisma.participateAutomationJob.findFirstOrThrow({ where: { hostId: f.host.id } });
    expect(job).toMatchObject({ state: "CONFIRMING", txid: "c".repeat(64), feeZat: 30000 });
    const revision = await prisma.archiveRevision.findUniqueOrThrow({ where: { id: job.revisionId! } });
    expect(JSON.parse(revision.packageJson)).toMatchObject({ files: expect.arrayContaining([{ path: "proposal.md", encoding: "base64", data: Buffer.from(f.issue.body).toString("base64") }]) });
    expect((await prisma.archiveAnchorCheck.findFirstOrThrow({ where: { anchorId: job.anchorId! } })).status).toBe("CONFIRMING");
    observe.mockResolvedValue({ confirmations: 10, requiredConfirmations: 10, blockHeight: 100 });
    await f.due();
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "VERIFIED" });
    expect(f.anchor).toHaveBeenCalledTimes(1);
    expect(await prisma.participateAutomationJob.count({ where: { hostId: f.host.id } })).toBe(1);
    expect(await prisma.archiveRevision.count({ where: { archive: { communityId: f.host.id } } })).toBe(1);
  });

  it("persists the same root across an ambiguous transport failure and restart", async () => {
    const f = await fixture();
    f.anchor.mockRejectedValueOnce(new AutomationTransportError("SIGNER_UNAVAILABLE"));
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "RETRY" });
    const before = await prisma.participateAutomationJob.findFirstOrThrow({ where: { hostId: f.host.id } });
    expect(before).toMatchObject({ state: "DISPATCHED", txid: null, attempts: 1 });
    await f.due();
    await runParticipateAutomation(f.config, f.transport, f.fetcher);
    expect(f.anchor.mock.calls[1][0]).toEqual(f.anchor.mock.calls[0][0]);
    const after = await prisma.participateAutomationJob.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.manifestHash).toBe(before.manifestHash);
    expect(after.anchorId).toBe(before.anchorId);
    expect(await prisma.archiveAnchor.count({ where: { revisionId: before.revisionId! } })).toBe(1);
  });

  it("anchors three proposals in one transaction with separate valid Merkle proofs and one fee", async () => {
    const f = await fixture(), queued = await queueSources(f, 3);
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "CONFIRMING" });
    const jobs = await prisma.participateAutomationJob.findMany({ where: { hostId: f.host.id } });
    expect(jobs).toHaveLength(3);
    expect(jobs.every(job => job.state === "CONFIRMING" && job.txid === "c".repeat(64) && job.revisionId && job.anchorId)).toBe(true);
    expect(jobs.reduce((sum, job) => sum + (job.feeZat ?? 0), 0)).toBe(30000);
    const hashes = queued.map(job => job.manifestHash).sort(), tree = buildArchiveMerkleTree(hashes);
    expect(f.anchor).toHaveBeenCalledTimes(1);
    expect(f.anchor).toHaveBeenCalledWith(expect.objectContaining({ manifestHashes: hashes, root: tree.root, memo: expect.stringContaining("count:3|"), pool: "ironwood" }));
    const anchors = await prisma.archiveAnchor.findMany({ where: { id: { in: jobs.map(job => job.anchorId!) } } });
    for (const job of jobs) {
      const anchor = anchors.find(row => row.id === job.anchorId)!;
      expect(verifyArchiveMerkleProof(job.manifestHash, anchor.commitment)).toMatchObject({ root: tree.root, leafCount: 3 });
      expect(anchor.txids).toEqual([job.txid]);
    }
    expect(observe).toHaveBeenCalledTimes(1);
    expect(await prisma.archiveAnchorCheck.count({ where: { anchorId: { in: anchors.map(row => row.id) }, status: "CONFIRMING" } })).toBe(3);
    observe.mockResolvedValue({ confirmations: 10, requiredConfirmations: 10, blockHeight: 100 });
    await f.due();
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "VERIFIED" });
    expect(await prisma.participateAutomationJob.count({ where: { hostId: f.host.id, state: "VERIFIED" } })).toBe(3);
    expect(f.anchor).toHaveBeenCalledTimes(1);
  });

  it("keeps a dispatched batch fixed across a lost reply and imports later proposals separately", async () => {
    const f = await fixture(); await queueSources(f, 3);
    f.anchor.mockRejectedValueOnce(new AutomationTransportError("SIGNER_UNAVAILABLE"));
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "RETRY" });
    const before = await prisma.participateAutomationJob.findMany({ where: { hostId: f.host.id }, orderBy: { id: "asc" } });
    expect(before.every(job => job.state === "DISPATCHED" && job.anchorId && !job.txid)).toBe(true);
    const [late] = await queueSources(f, 1, 999201);
    await f.due();
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "CONFIRMING" });
    expect(f.anchor.mock.calls[1][0]).toEqual(f.anchor.mock.calls[0][0]);
    expect(f.anchor.mock.calls[1][0].manifestHashes).toHaveLength(3);
    const imported = await prisma.participateAutomationJob.findUniqueOrThrow({ where: { id: late.id } });
    expect(imported.revisionId).not.toBeNull();
    expect(imported.anchorId).toBeNull();
    for (const prior of before) {
      expect(await prisma.participateAutomationJob.findUniqueOrThrow({ where: { id: prior.id } })).toMatchObject({ anchorId: prior.anchorId, manifestHash: prior.manifestHash, txid: "c".repeat(64) });
    }
    await runParticipateAutomation(f.config, f.transport, f.fetcher);
    expect(f.anchor.mock.calls[2][0].manifestHashes).toEqual([late.manifestHash]);
    expect(f.anchor.mock.calls[2][0].root).not.toBe(f.anchor.mock.calls[0][0].root);
  });

  it("preserves two successive revisions of one proposal in the same batch", async () => {
    const f = await fixture(), [initial] = await queueSources(f, 1);
    const update = await buildSourceProposal({ ...f.issue, number: initial.issueNumber, html_url: initial.sourceUrl,
      body: "# Updated source\n\nA separately preserved revision.\n" }, initial.issueNumber, new Date().toISOString(), 2, initial.manifestHash);
    await prisma.participateAutomationJob.create({ data: { hostId: f.host.id, committeeId: f.committee.id,
      issueNumber: initial.issueNumber, sourceUrl: initial.sourceUrl, revision: 2,
      manifestHash: update.manifestHash, packageJson: canonicalJson(update.bundle) } });
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "CONFIRMING" });
    const revisions = await prisma.archiveRevision.findMany({ where: { archive: { communityId: f.host.id } }, orderBy: { revision: "asc" } });
    expect(revisions.map(row => row.manifestHash)).toEqual([initial.manifestHash, update.manifestHash]);
    expect(revisions[0].packageJson).toBe(initial.packageJson);
    expect(JSON.parse(JSON.parse(revisions[1].packageJson).manifest).previousManifestHash).toBe(initial.manifestHash);
    expect(f.anchor).toHaveBeenCalledTimes(1);
    expect(f.anchor.mock.calls[0][0].manifestHashes).toEqual([initial.manifestHash, update.manifestHash].sort());
    expect(await prisma.participateAutomationJob.count({ where: { hostId: f.host.id, txid: "c".repeat(64) } })).toBe(2);
  });

  it("blocks a frozen batch whose inventory does not match its declared count", async () => {
    const f = await fixture(); await queueSources(f, 3);
    const prepare = anchorService.prepareArchiveBatchInTransaction;
    vi.spyOn(anchorService, "prepareArchiveBatchInTransaction").mockImplementationOnce(async (...args) => {
      const batch = await prepare(...args);
      const verify = merkleService.verifyArchiveMerkleProof;
      vi.spyOn(merkleService, "verifyArchiveMerkleProof").mockImplementationOnce((...params) => ({ ...verify(...params), leafCount: 4 }));
      return batch;
    });
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "NEEDS_REVIEW" });
    expect(f.anchor).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
    const jobs = await prisma.participateAutomationJob.findMany({ where: { hostId: f.host.id } });
    expect(jobs.every(job => job.anchorId && !job.txid)).toBe(true);
    expect(jobs.some(job => job.lastErrorCode === "AUTOMATION_SOURCE_INTEGRITY_FAILED")).toBe(true);
    // A subsequent cycle must not regroup a batch with a quarantined member.
    vi.mocked(merkleService.verifyArchiveMerkleProof).mockRestore();
    await f.due(); await runParticipateAutomation(f.config, f.transport, f.fetcher);
    expect(f.anchor).not.toHaveBeenCalled();
  });

  it("rolls back batch proofs if the process fails before linking its jobs", async () => {
    const f = await fixture(); await queueSources(f, 3);
    const prepare = anchorService.prepareArchiveBatchInTransaction;
    vi.spyOn(anchorService, "prepareArchiveBatchInTransaction").mockImplementationOnce(async (...args) => {
      await prepare(...args);
      throw new Error("Synthetic crash before inventory commit");
    });
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "RETRY" });
    let jobs = await prisma.participateAutomationJob.findMany({ where: { hostId: f.host.id } });
    expect(jobs.every(job => job.revisionId && !job.anchorId && !job.txid)).toBe(true);
    expect(await prisma.archiveAnchor.count({ where: { revisionId: { in: jobs.map(job => job.revisionId!) } } })).toBe(0);
    expect(f.anchor).not.toHaveBeenCalled();
    await f.due();
    await runParticipateAutomation(f.config, f.transport, f.fetcher);
    jobs = await prisma.participateAutomationJob.findMany({ where: { hostId: f.host.id } });
    expect(jobs.every(job => job.txid === "c".repeat(64))).toBe(true);
    expect(f.anchor).toHaveBeenCalledTimes(1);
    expect(f.anchor.mock.calls[0][0].manifestHashes).toHaveLength(3);
  });

  it("quarantines every member when a frozen batch requires signer reconciliation", async () => {
    const f = await fixture(); await queueSources(f, 3);
    f.anchor.mockImplementation(async request => ({ state: "NEEDS_REVIEW", root: request.root, code: "SIGNER_RECONCILIATION_REQUIRED" }));
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "NEEDS_REVIEW" });
    expect(await prisma.participateAutomationJob.count({ where: { hostId: f.host.id, state: "NEEDS_REVIEW" } })).toBe(3);
    await f.due(); await runParticipateAutomation(f.config, f.transport, f.fetcher);
    expect(f.anchor).toHaveBeenCalledTimes(1);
    expect(await prisma.participateAutomationLog.count({ where: { hostId: f.host.id, event: "anchor_needs_review" } })).toBe(3);
  });

  it("keeps all member receipts after a reorg and never recreates their transaction", async () => {
    const f = await fixture(); await queueSources(f, 3);
    observe.mockResolvedValueOnce({ confirmations: 10, requiredConfirmations: 10, blockHeight: 100 });
    await runParticipateAutomation(f.config, f.transport, f.fetcher);
    const { ArchiveChainError } = await import("@/lib/archive/chain");
    observe.mockRejectedValueOnce(new ArchiveChainError("ORPHANED"));
    await f.due();
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "RETRY" });
    const jobs = await prisma.participateAutomationJob.findMany({ where: { hostId: f.host.id } });
    expect(jobs.every(job => job.state === "CONFIRMING" && job.lastErrorCode === "ORPHANED")).toBe(true);
    for (const job of jobs) {
      const checks = await prisma.archiveAnchorCheck.findMany({ where: { anchorId: job.anchorId! }, orderBy: { createdAt: "asc" } });
      expect(checks.map(check => check.status)).toEqual(["VERIFIED", "UNVERIFIED"]);
    }
    expect(f.anchor).toHaveBeenCalledTimes(1);
  });

  it("bounds a batch to ten records while retaining the next proposal for another cycle", async () => {
    const f = await fixture(); await queueSources(f, 11);
    await runParticipateAutomation(f.config, f.transport, f.fetcher);
    expect(f.anchor.mock.calls[0][0].manifestHashes).toHaveLength(10);
    expect(await prisma.participateAutomationJob.count({ where: { hostId: f.host.id, txid: "c".repeat(64) } })).toBe(10);
    expect(await prisma.participateAutomationJob.count({ where: { hostId: f.host.id, state: "CAPTURED", anchorId: null, txid: null } })).toBe(1);
    expect(f.anchor).toHaveBeenCalledTimes(1);
  });

  it("retains an older one-record prepared commitment instead of regrouping it", async () => {
    const f = await fixture(), [seed] = await queueSources(f, 3);
    const revision = await publishArchiveRevision(f.host.id, JSON.parse(seed.packageJson), seed.manifestHash, f.committee.id);
    const original = await prepareArchiveBatch([revision.id], chain);
    await prisma.participateAutomationJob.update({ where: { id: seed.id }, data: { revisionId: revision.id } });
    await runParticipateAutomation(f.config, f.transport, f.fetcher);
    expect(f.anchor).toHaveBeenCalledWith(expect.objectContaining({ root: original.root, manifestHashes: [seed.manifestHash] }));
    expect(await prisma.participateAutomationJob.findUniqueOrThrow({ where: { id: seed.id } })).toMatchObject({ anchorId: original.anchors[0].id });
    expect(await prisma.participateAutomationJob.count({ where: { hostId: f.host.id, anchorId: null, txid: null } })).toBe(2);
  });

  it("stops uncertain signer jobs with a durable error and never retries their spend", async () => {
    const f = await fixture();
    f.anchor.mockImplementation(async request => ({ state: "NEEDS_REVIEW", root: request.root, code: "SIGNER_RECONCILIATION_REQUIRED" }));
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "NEEDS_REVIEW" });
    await f.due(); await runParticipateAutomation(f.config, f.transport, f.fetcher);
    expect(f.anchor).toHaveBeenCalledTimes(1);
    expect(await prisma.participateAutomationLog.findFirst({ where: { hostId: f.host.id, event: "anchor_needs_review" } })).toMatchObject({ code: "SIGNER_RECONCILIATION_REQUIRED", level: "error" });
  });

  it("rechecks confirmed-change availability without exponential funding backoff or replacing the intent", async () => {
    const f = await fixture();
    f.anchor.mockImplementationOnce(async request => ({ state: "RETRY", root: request.root, code: "WALLET_AWAITING_CONFIRMATIONS" }));
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "RETRY" });
    const first = await prisma.participateAutomationJob.findFirstOrThrow({ where: { hostId: f.host.id } });
    await prisma.participateAutomationJob.update({ where: { id: first.id }, data: { attempts: 7, nextAttemptAt: new Date(0) } });
    f.anchor.mockImplementationOnce(async request => ({ state: "RETRY", root: request.root, code: "WALLET_AWAITING_CONFIRMATIONS" }));
    const before = Date.now();
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "RETRY" });
    const waiting = await prisma.participateAutomationJob.findUniqueOrThrow({ where: { id: first.id } });
    expect(waiting).toMatchObject({ manifestHash: first.manifestHash, anchorId: first.anchorId, txid: null, attempts: 0, lastErrorCode: "WALLET_AWAITING_CONFIRMATIONS" });
    expect(waiting.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 60_000);
    expect(waiting.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now() + 60_000);
    expect(await prisma.participateAutomationLog.findFirst({ where: { jobId: first.id, event: "anchor_waiting_for_confirmations" } })).toMatchObject({ level: "info", code: "WALLET_AWAITING_CONFIRMATIONS", details: { retryInSeconds: 60, txid: null } });
    // Expected confirmation waits must not inflate a later transient error's backoff.
    await f.due();
    f.anchor.mockRejectedValueOnce(new AutomationTransportError("SIGNER_UNAVAILABLE"));
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "RETRY" });
    const transient = await prisma.participateAutomationJob.findUniqueOrThrow({ where: { id: first.id } });
    expect(transient.attempts).toBe(1);
    expect(transient.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now() + 60_000);
    await f.due();
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "CONFIRMING" });
    expect(f.anchor.mock.calls[3][0]).toEqual(f.anchor.mock.calls[0][0]);
    expect(await prisma.archiveAnchor.count({ where: { revisionId: first.revisionId! } })).toBe(1);
  });

  it("does not advance discovery on upstream failure or log the raw exception", async () => {
    const f = await fixture();
    f.fetcher.mockRejectedValue(new Error("Bearer never-log-me"));
    await runParticipateAutomation(f.config, f.transport, f.fetcher);
    const state = await prisma.participateAutomationState.findUniqueOrThrow({ where: { hostId: f.host.id } });
    expect(state.cursorAt).toEqual(f.config.startedAt);
    expect(state.lastErrorCode).toBe("SOURCE_UNAVAILABLE");
    const logs = await prisma.participateAutomationLog.findMany({ where: { hostId: f.host.id } });
    expect(JSON.stringify(logs)).not.toContain("never-log-me");
    expect(f.anchor).not.toHaveBeenCalled();
  });

  it("skips already archived proposals and refuses silent receiver changes", async () => {
    const f = await fixture();
    const captured = await buildSourceProposal(f.issue, f.issue.number, new Date().toISOString());
    await publishArchiveRevision(f.host.id, captured.bundle, captured.manifestHash, f.committee.id);
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "IDLE" });
    expect(f.anchor).not.toHaveBeenCalled();
    expect(await prisma.participateAutomationJob.count({ where: { hostId: f.host.id } })).toBe(0);
    expect(await runParticipateAutomation({ ...f.config, chain: { ...chain, receiver: "u1" + "c".repeat(100) } }, f.transport, f.fetcher)).toEqual({ state: "NEEDS_REVIEW" });
  });

  it("does not let a public demo link suppress official discovery or operator import", async () => {
    const f = await fixture();
    const demo = await buildNativeProposalPackage(`native-${randomUUID()}`, {
      title: "A separate public pilot proposal", applicant: "Demo author", body: "A full public pilot description. ".repeat(5),
      requestedAmountUsd: "100", tags: [], githubUrl: f.issue.html_url,
      forumUrl: "https://forum.zcashcommunity.com/t/test-discussion/999001"
    }, new Date().toISOString());
    await publishArchiveRevision(f.host.id, demo.bundle, demo.manifestHash, f.committee.id);
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "CONFIRMING" });
    expect(await prisma.participateAutomationJob.count({ where: { hostId: f.host.id } })).toBe(1);
    expect(f.anchor).toHaveBeenCalledTimes(1);
    const job = await prisma.participateAutomationJob.findFirstOrThrow({ where: { hostId: f.host.id } });
    expect((await prisma.archiveRevision.findUniqueOrThrow({ where: { id: job.revisionId! } })).manifestHash).toBe(job.manifestHash);
  });

  it("blocks a queued official capture if its revision points at a native demo", async () => {
    const f = await fixture();
    const source = await buildSourceProposal(f.issue, f.issue.number, new Date().toISOString());
    const demo = await buildNativeProposalPackage(`native-${randomUUID()}`, {
      title: "A separate public pilot proposal", applicant: "Demo author", body: "A full public pilot description. ".repeat(5),
      requestedAmountUsd: "100", tags: [], githubUrl: f.issue.html_url,
      forumUrl: "https://forum.zcashcommunity.com/t/test-discussion/999001"
    }, new Date().toISOString());
    const nativeRevision = await publishArchiveRevision(f.host.id, demo.bundle, demo.manifestHash, f.committee.id);
    const job = await prisma.participateAutomationJob.create({ data: {
      hostId: f.host.id, committeeId: f.committee.id, issueNumber: f.issue.number, sourceUrl: f.issue.html_url,
      manifestHash: source.manifestHash, packageJson: canonicalJson(source.bundle), revisionId: nativeRevision.id
    } });
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "NEEDS_REVIEW" });
    expect(await prisma.participateAutomationJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ state: "NEEDS_REVIEW", lastErrorCode: "AUTOMATION_SOURCE_INTEGRITY_FAILED" });
    expect(f.anchor).not.toHaveBeenCalled();
    expect(await prisma.archiveAnchor.count({ where: { revisionId: nativeRevision.id } })).toBe(0);
  });

  it("does not sign an official archive that already has a broadcast transaction", async () => {
    const f = await fixture();
    const source = await buildSourceProposal(f.issue, f.issue.number, new Date().toISOString());
    const revision = await publishArchiveRevision(f.host.id, source.bundle, source.manifestHash, f.committee.id);
    const batch = await prepareArchiveBatch([revision.id], chain);
    await checkExternalArchiveBatch([batch.anchors[0].id], "d".repeat(64), chain, f.transport.fetcher);
    const job = await prisma.participateAutomationJob.create({ data: {
      hostId: f.host.id, committeeId: f.committee.id, issueNumber: f.issue.number, sourceUrl: f.issue.html_url,
      manifestHash: source.manifestHash, packageJson: canonicalJson(source.bundle), revisionId: revision.id,
      anchorId: batch.anchors[0].id
    } });
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "NEEDS_REVIEW" });
    expect(await prisma.participateAutomationJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ state: "NEEDS_REVIEW", lastErrorCode: "AUTOMATION_SOURCE_INTEGRITY_FAILED" });
    expect(f.anchor).not.toHaveBeenCalled();
  });

  it("quarantines one malformed eligible issue and still captures the next valid one", async () => {
    const f = await fixture();
    f.fetcher.mockImplementation(async input => f.sourceResponse(input, [{ ...f.issue, number: 999000, html_url: f.issue.html_url.replace("999001", "999000"), body: null }, f.issue]));
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "CONFIRMING" });
    expect(await prisma.participateAutomationLog.findFirst({ where: { hostId: f.host.id, event: "source_candidate_quarantined" } })).toMatchObject({ code: "SOURCE_CANDIDATE_INVALID" });
    expect(await prisma.participateAutomationJob.count({ where: { hostId: f.host.id } })).toBe(1);
    expect(f.anchor).toHaveBeenCalledTimes(1);
  });

  it("allows only one concurrent discovery/dispatch cycle", async () => {
    const f = await fixture();
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    f.fetcher.mockImplementation(async input => { entered(); await gate; return f.sourceResponse(input); });
    const first = runParticipateAutomation(f.config, f.transport, f.fetcher);
    await started;
    try { expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "BUSY" }); }
    finally { release(); }
    await first;
    expect(f.anchor).toHaveBeenCalledTimes(1);
  });

  it("retains confirmed receipts but downgrades verification after a later orphan check", async () => {
    const f = await fixture();
    observe.mockResolvedValueOnce({ confirmations: 10, requiredConfirmations: 10, blockHeight: 100 });
    await runParticipateAutomation(f.config, f.transport, f.fetcher);
    const { ArchiveChainError } = await import("@/lib/archive/chain");
    observe.mockRejectedValueOnce(new ArchiveChainError("ORPHANED"));
    await f.due(); await runParticipateAutomation(f.config, f.transport, f.fetcher);
    const job = await prisma.participateAutomationJob.findFirstOrThrow({ where: { hostId: f.host.id } });
    expect(job).toMatchObject({ state: "CONFIRMING", lastErrorCode: "ORPHANED" });
    const checks = await prisma.archiveAnchorCheck.findMany({ where: { anchorId: job.anchorId! }, orderBy: { createdAt: "asc" } });
    expect(checks.map(check => check.status)).toEqual(["VERIFIED", "UNVERIFIED"]);
    expect(f.anchor).toHaveBeenCalledTimes(1);
    await expect(prisma.participateAutomationJob.update({ where: { id: job.id }, data: { manifestHash: "a".repeat(64) } })).rejects.toThrow();
    await expect(prisma.participateAutomationLog.deleteMany({ where: { hostId: f.host.id } })).rejects.toThrow();
  });

  it("refuses legacy or missing pool before discovery or signing", async () => {
    const f = await fixture();
    for (const config of [{ ...f.config, chain: legacyChain }, { ...f.config, chain: { ...legacyChain, pool: "sapling" as const } }]) {
      expect(await runParticipateAutomation(config, f.transport, f.fetcher)).toEqual({ state: "NEEDS_REVIEW" });
    }
    expect(f.fetcher).not.toHaveBeenCalled(); expect(f.anchor).not.toHaveBeenCalled();
    expect(await prisma.participateAutomationState.findUnique({ where: { hostId: f.host.id } })).toBeNull();
    expect(await prisma.participateAutomationLog.count({ where: { hostId: f.host.id, code: "AUTOMATION_IRONWOOD_REQUIRED" } })).toBe(2);
  });

  it("requires Ironwood in signer request and broadcast acknowledgment", async () => {
    const f = await fixture();
    f.anchor.mockImplementation(async request => ({ state: "BROADCAST", root: request.root, txid: "c".repeat(64), feeZat: 30000 }));
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "NEEDS_REVIEW" });
    expect(f.anchor).toHaveBeenCalledWith(expect.objectContaining({ pool: "ironwood" }));
    expect(await prisma.participateAutomationJob.findFirstOrThrow({ where: { hostId: f.host.id } })).toMatchObject({ state: "NEEDS_REVIEW", lastErrorCode: "SIGNER_RESPONSE_MISMATCH" });
    await f.due(); await runParticipateAutomation(f.config, f.transport, f.fetcher);
    expect(f.anchor).toHaveBeenCalledTimes(1);
  });

  async function legacyCheckpoint(f: Awaited<ReturnType<typeof fixture>>) {
    const oldConfig = { ...f.config, chain: legacyChain };
    const oldHash = participateAutomationPolicyHash({ hostId: f.host.id, committeeId: f.committee.id }, oldConfig);
    const checkpoint = await prisma.participateAutomationState.create({ data: { hostId: f.host.id, committeeId: f.committee.id, policyHash: oldHash,
      startedAt: f.config.startedAt, cursorAt: new Date(Date.now() - 30_000), nextPollAt: new Date(Date.now() + 300_000) } });
    return { oldHash, checkpoint, next: { ...f.config, legacyChain } };
  }

  async function legacyJob(f: Awaited<ReturnType<typeof fixture>>, state = "CONFIRMING") {
    const source = await buildSourceProposal(f.issue, f.issue.number, new Date().toISOString());
    const revision = await publishArchiveRevision(f.host.id, source.bundle, source.manifestHash, f.committee.id);
    const batch = await prepareArchiveBatch([revision.id], legacyChain);
    return prisma.participateAutomationJob.create({ data: { hostId: f.host.id, committeeId: f.committee.id, issueNumber: f.issue.number,
      sourceUrl: f.issue.html_url, manifestHash: source.manifestHash, packageJson: canonicalJson(source.bundle), revisionId: revision.id,
      anchorId: batch.anchors[0].id, state, txid: "d".repeat(64), feeZat: 30000 } });
  }

  it("plans read-only and migrates the pinned policy atomically without resetting the checkpoint", async () => {
    const f = await fixture(), { oldHash, checkpoint, next } = await legacyCheckpoint(f);
    expect(await migrateParticipateAutomationToIronwood(next, oldHash)).toMatchObject({ state: "READY", legacyJobs: 0 });
    expect(await prisma.participateAutomationLog.count({ where: { hostId: f.host.id } })).toBe(0);
    expect((await prisma.participateAutomationState.findUniqueOrThrow({ where: { hostId: f.host.id } })).policyHash).toBe(oldHash);
    const result = await migrateParticipateAutomationToIronwood(next, oldHash, true);
    expect(result).toMatchObject({ state: "MIGRATED", previousPolicyHash: oldHash });
    expect(await prisma.participateAutomationState.findUniqueOrThrow({ where: { hostId: f.host.id } })).toEqual({ ...checkpoint, policyHash: result.policyHash });
    expect(await migrateParticipateAutomationToIronwood(next, oldHash, true)).toMatchObject({ state: "ALREADY_MIGRATED" });
    expect(await prisma.participateAutomationLog.count({ where: { hostId: f.host.id, event: "automation_policy_migrated" } })).toBe(1);
    expect(f.anchor).not.toHaveBeenCalled();
  });

  it("refuses mismatched policy and unresolved signing intents without altering them", async () => {
    const f = await fixture(), { oldHash, next } = await legacyCheckpoint(f);
    expect(await migrateParticipateAutomationToIronwood(next, "0".repeat(64), true)).toMatchObject({ state: "BLOCKED", code: "AUTOMATION_POLICY_HASH_MISMATCH" });
    const job = await legacyJob(f, "DISPATCHED");
    expect(await migrateParticipateAutomationToIronwood(next, oldHash, true)).toMatchObject({ state: "BLOCKED", code: "AUTOMATION_UNRESOLVED_SIGNING_INTENTS" });
    expect(await prisma.participateAutomationJob.findUniqueOrThrow({ where: { id: job.id } })).toEqual(job);
    expect((await prisma.participateAutomationState.findUniqueOrThrow({ where: { hostId: f.host.id } })).policyHash).toBe(oldHash);
    expect(f.anchor).not.toHaveBeenCalled();
  });

  it("shares the worker lock and refuses to change the discovery start", async () => {
    const f = await fixture(), { oldHash, next } = await legacyCheckpoint(f);
    expect(await migrateParticipateAutomationToIronwood({ ...next, startedAt: new Date(next.startedAt.getTime() - 1) }, oldHash)).toMatchObject({ state: "BLOCKED", code: "AUTOMATION_CHECKPOINT_MISMATCH" });
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`participate-automation:${f.host.id}`}, 0))`;
      expect(await migrateParticipateAutomationToIronwood(next, oldHash)).toMatchObject({ state: "BLOCKED", code: "AUTOMATION_WORKER_BUSY" });
    });
    expect((await prisma.participateAutomationState.findUniqueOrThrow({ where: { hostId: f.host.id } })).policyHash).toBe(oldHash);
  });

  it("refuses a legacy reader that does not match the recorded destination", async () => {
    const f = await fixture(), { oldHash, next } = await legacyCheckpoint(f);
    await legacyJob(f);
    const result = await migrateParticipateAutomationToIronwood({ ...next, legacyChain: { ...legacyChain, receiver: "zs1" + "c".repeat(70) } }, oldHash, true);
    expect(result).toMatchObject({ state: "BLOCKED", code: "AUTOMATION_LEGACY_ANCHOR_MISMATCH" });
    expect((await prisma.participateAutomationState.findUniqueOrThrow({ where: { hostId: f.host.id } })).policyHash).toBe(oldHash);
    expect(f.anchor).not.toHaveBeenCalled();
  });

  it("retains a broadcast legacy job for read-only checking with no replacement transaction", async () => {
    const f = await fixture(), { oldHash, next } = await legacyCheckpoint(f), job = await legacyJob(f);
    expect(await migrateParticipateAutomationToIronwood(f.config, oldHash)).toMatchObject({ state: "BLOCKED", code: "AUTOMATION_LEGACY_READER_REQUIRED" });
    expect(await migrateParticipateAutomationToIronwood(next, oldHash, true)).toMatchObject({ state: "MIGRATED", legacyJobs: 1 });
    expect(await runParticipateAutomation(next, f.transport, f.fetcher)).toEqual({ state: "CONFIRMING" });
    expect(observe).toHaveBeenCalledWith(legacyChain, job.txid, expect.any(String));
    expect(f.anchor).not.toHaveBeenCalled();
    expect(await prisma.archiveAnchor.count({ where: { revisionId: job.revisionId! } })).toBe(1);
    expect(await prisma.participateAutomationJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ txid: job.txid, anchorId: job.anchorId });
  });

  it.each(["viewing-key", "receiver-index", "confirmations"])("binds legacy %s to the original checkpoint even when its destination is unchanged", async field => {
    const f = await fixture(), { oldHash, next } = await legacyCheckpoint(f), job = await legacyJob(f);
    const changedReader = { ...legacyChain };
    if (field === "viewing-key") changedReader.publicViewingKey = "zxview" + "c".repeat(150);
    if (field === "receiver-index") changedReader.receiverIndex = 42;
    if (field === "confirmations") changedReader.requiredConfirmations = 11;
    expect(await migrateParticipateAutomationToIronwood({ ...next, legacyChain: changedReader }, oldHash, true))
      .toMatchObject({ state: "BLOCKED", code: "AUTOMATION_LEGACY_POLICY_MISMATCH" });
    expect((await prisma.participateAutomationState.findUniqueOrThrow({ where: { hostId: f.host.id } })).policyHash).toBe(oldHash);
    expect(await prisma.participateAutomationJob.findUniqueOrThrow({ where: { id: job.id } })).toEqual(job);
    expect(await prisma.participateAutomationLog.count({ where: { hostId: f.host.id, event: "automation_policy_migrated" } })).toBe(0);
    expect(f.anchor).not.toHaveBeenCalled();
  });

  it("quarantines an expired legacy transaction without sending it again", async () => {
    const f = await fixture(), { oldHash, next } = await legacyCheckpoint(f), job = await legacyJob(f);
    await migrateParticipateAutomationToIronwood(next, oldHash, true);
    const { ArchiveChainError } = await import("@/lib/archive/chain");
    observe.mockRejectedValueOnce(new ArchiveChainError("TRANSACTION_EXPIRED"));
    expect(await runParticipateAutomation(next, f.transport, f.fetcher)).toEqual({ state: "NEEDS_REVIEW" });
    await f.due(); await runParticipateAutomation(next, f.transport, f.fetcher);
    expect(f.anchor).not.toHaveBeenCalled();
    expect(await prisma.participateAutomationJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ state: "NEEDS_REVIEW", lastErrorCode: "TRANSACTION_EXPIRED", txid: job.txid, anchorId: job.anchorId });
  });
});

describe.skipIf(!url)("automatic Ironwood activity batches", () => {
  beforeEach(() => {
    vi.stubEnv("PARTICIPATE_PUBLIC_DEMO", "true"); vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("APP_BASE_URL", "https://participate.example.org");
    observe.mockReset(); vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  async function activityFixture() {
    const f = await fixture();
    await runParticipateAutomation(f.config, f.transport, f.fetcher);
    f.anchor.mockClear();
    const user = await prisma.user.update({ where: { id: f.host.createdById }, data: { email: `${randomUUID()}@example.test`, emailVerifiedAt: new Date() } });
    const session = { subjectType: "user" as const, userId: user.id, nick: user.nick, role: user.role };
    const discussion = await import("@/lib/services/archive-discussion");
    const anchors = await import("@/lib/services/activity-anchors");
    const { runActivityAutomation } = await import("@/lib/services/activity-automation");
    const recordId = `zcg-github-${f.issue.number}`;
    const post = (body: string) => discussion.mutateArchiveDiscussion(f.host.id, recordId, session, "post", { body, requestKey: randomUUID() });
    const comment = await post("Production-path synthetic test 🛡️");
    await discussion.mutateArchiveDiscussion(f.host.id, recordId, session, "reaction", { liked: true, version: 1, requestKey: randomUUID() }, comment.id);
    const prepare = () => anchors.prepareActivityBatch(f.host.id, chain, 1000, { committeeId: f.committee.id });
    const batch = await prepare();
    const run = () => runActivityAutomation({ ...f.config, activityEnabled: true }, f.transport);
    const due = () => prisma.activityAutomationJob.update({ where: { batchId: batch!.id }, data: { nextAttemptAt: new Date(0) } });
    return { ...f, run, batch: batch!, comment, post, prepare, due, anchors };
  }
  it("sends one batch for multiple events, validates every proof and confirms without signing again", async () => {
    const f = await activityFixture();
    expect(await f.run()).toMatchObject({ state: "CONFIRMING", batchId: f.batch.id });
    expect(f.anchor).toHaveBeenCalledTimes(1);
    const request = f.anchor.mock.calls[0][0];
    expect(request).toMatchObject({ pool: "ironwood", memo: expect.stringContaining("|ACTIVITY|v1|mainnet|count:2|") });
    expect(request.manifestHashes).toBeUndefined(); expect(request.eventHashes).toHaveLength(2);
    const entries = await prisma.archiveActivityInclusion.findMany({ where: { batchId: f.batch.id }, include: { event: true } });
    for (const entry of entries) expect(verifyArchiveMerkleProof(entry.event.eventHash, entry.proof)).toMatchObject({ root: request.root, leafCount: 2 });
    observe.mockResolvedValue({ confirmations: 10, requiredConfirmations: 10, blockHeight: 100 }); await f.due();
    expect(await f.run()).toMatchObject({ state: "VERIFIED" }); expect(f.anchor).toHaveBeenCalledTimes(1);
    expect(await prisma.activityAutomationJob.findUniqueOrThrow({ where: { batchId: f.batch.id } })).toMatchObject({ state: "VERIFIED", feeZat: 30000 });
  });
  it("retries the exact frozen inventory after a lost signer reply and keeps late events for another batch", async () => {
    const f = await activityFixture(); f.anchor.mockRejectedValueOnce(new AutomationTransportError("SIGNER_UNAVAILABLE"));
    expect(await f.run()).toMatchObject({ state: "RETRY" });
    await f.post("A later event"); await f.due();
    expect(await f.run()).toMatchObject({ state: "CONFIRMING" });
    expect(f.anchor.mock.calls[1][0]).toEqual(f.anchor.mock.calls[0][0]);
    expect(await prisma.archiveActivityEvent.count({ where: { archive: { communityId: f.host.id }, inclusion: null } })).toBe(1);
  });
  it("binds the broadcast before a reader failure and refuses a different-pool reply", async () => {
    const f = await activityFixture(); observe.mockRejectedValueOnce(new Error("Reader offline"));
    expect(await f.run()).toMatchObject({ state: "RETRY" });
    expect(await prisma.archiveActivityBatch.findUniqueOrThrow({ where: { id: f.batch.id } })).toMatchObject({ txid: "c".repeat(64) });
    observe.mockResolvedValue({ confirmations: 10, requiredConfirmations: 10, blockHeight: 100 }); await f.due();
    expect(await f.run()).toMatchObject({ state: "VERIFIED" }); expect(f.anchor).toHaveBeenCalledTimes(1);
    const other = await activityFixture(); other.anchor.mockImplementation(async request => ({ state: "BROADCAST", root: request.root, txid: "d".repeat(64), feeZat: 30000, pool: "sapling" }));
    expect(await other.run()).toMatchObject({ state: "NEEDS_REVIEW" });
    expect(await other.run()).toMatchObject({ state: "NEEDS_REVIEW" }); expect(other.anchor).toHaveBeenCalledTimes(1);
  });
  it("never sends when disabled or creates an empty batch", async () => {
    const f = await fixture(); const { runActivityAutomation } = await import("@/lib/services/activity-automation");
    expect(await runActivityAutomation(f.config, f.transport)).toEqual({ state: "DISABLED" });
    expect(await runActivityAutomation({ ...f.config, activityEnabled: true }, f.transport)).toEqual({ state: "IDLE" });
    expect(f.anchor).not.toHaveBeenCalled();
  });
});
