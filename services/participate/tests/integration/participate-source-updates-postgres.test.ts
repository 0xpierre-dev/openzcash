// @vitest-environment node
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { buildSourceProposal } from "@/lib/archive/source-proposals";
import { readPilotPackages } from "@/lib/archive/catalog";
import { buildNativeProposalPackage } from "@/lib/archive/native-proposals";
import { canonicalJson, verifyArchivePackage } from "@/lib/archive/format";
import { AutomationTransportError, type AutomationTransport } from "@/lib/archive/automation-transport";
import type { ArchiveChainConfig } from "@/lib/archive/chain";

const databaseUrl = process.env.TREASURY_TEST_DATABASE_URL;
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (target.hostname !== "127.0.0.1" || target.port !== (process.env.PARTICIPATE_TEST_PORT ?? "55438") || target.pathname !== "/community_treasury_tests") throw new Error("Disposable database required");
}
const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? "postgresql://unused@127.0.0.1:1/unused" });
vi.mock("@/lib/db", () => ({ db: prisma }));
const observe = vi.hoisted(() => vi.fn());
vi.mock("@/lib/archive/chain", async original => ({ ...await original<typeof import("@/lib/archive/chain")>(), createArchiveObserver: () => observe }));
const { runParticipateAutomation } = await import("@/lib/services/participate-automation");
const { captureOfficialSourceRevisions, reconcileOfficialSourceRevisions, captureSelectedOfficialProposals } = await import("@/lib/services/participate-source-revisions");
const { publishArchiveRevision } = await import("@/lib/services/proposal-archives");
const { readArchiveDiscussion, readProposalParticipationBoard } = await import("@/lib/services/archive-discussion");
const API = "https://api.github.com/repos/ZcashCommunityGrants/zcashcommunitygrants/issues";
const SOURCE = "https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues";
const chain: ArchiveChainConfig = {
  network: "mainnet", pool: "ironwood", receiver: "u1" + "q".repeat(100), publicViewingKey: "uview1" + "q".repeat(150),
  receiverIndex: 0, birthdayHeight: 1, walletVersion: "0.1.0-beta.3", requiredConfirmations: 10,
  reader: { url: "http://127.0.0.1:28248" }, chain: { url: "http://127.0.0.1:8232" }
};
const reviewLabels = [
  { name: "📋 Grant Application", color: "bbbb55", description: null },
  { name: "👀 Ready For ZCG Review", color: "005555", description: null }
];
const approvedLabel = { name: "✅ Grant Approved", color: "004400", description: null };
const untriagedApplication = "### Application Owners (@Octocat, @Octocat1)\n\n@test-author\n\n### Requested Grant Amount (USD)\n\n$18,000\n\n### Project Summary\n\nSynthetic integration fixture.\n\n### Project Description\n\nOnly used with the disposable database.";
const recordLog: Parameters<typeof reconcileOfficialSourceRevisions>[2] = async (hostId, event, details = {}, level = "info", jobId, code) => {
  await prisma.participateAutomationLog.create({ data: { hostId, event, details, level, jobId, code } });
};

async function fixture() {
  const owner = await prisma.user.create({ data: { nick: randomUUID(), passwordHash: "synthetic-only", role: "USER" } });
  const host = await prisma.community.create({ data: { name: "Official update integration", slug: randomUUID(), createdById: owner.id } });
  const committee = await prisma.community.create({ data: { name: "Official committee integration", slug: randomUUID(), kind: "COMMITTEE", createdById: owner.id } });
  vi.stubEnv("PARTICIPATE_COMMUNITY_ID", host.id); vi.stubEnv("PARTICIPATE_DEMO_COMMITTEE_ID", committee.id);
  const now = Date.now();
  const issue = {
    number: 999101, html_url: `${SOURCE}/999101`, title: "Synthetic official revision integration",
    body: "# Exact original proposal\n\nThis content is confined to the disposable database.\n",
    state: "open", state_reason: null as string | null, created_at: new Date(now - 300_000).toISOString(),
    updated_at: new Date(now - 60_000).toISOString(), user: { id: 123, login: "test-author" }, labels: [...reviewLabels]
  };
  const upstream: { events: unknown[]; comments: unknown[]; commentsFail: boolean; candidates: unknown[] | null } = {
    events: [], comments: [], commentsFail: false, candidates: null
  };
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async input => {
    const request = new URL(String(input));
    if (request.origin !== "https://api.github.com") throw new Error("Unexpected mock origin");
    if (request.pathname === new URL(API).pathname) return Response.json(upstream.candidates ?? [issue]);
    if (request.pathname === `${new URL(API).pathname}/${issue.number}`) return Response.json(issue);
    if (request.pathname === `${new URL(API).pathname}/${issue.number}/events`) return Response.json(upstream.events);
    if (request.pathname === `${new URL(API).pathname}/${issue.number}/comments`) {
      if (upstream.commentsFail) return new Response("private token never-log-this", { status: 503 });
      return Response.json(upstream.comments);
    }
    throw new Error(`Unexpected mock path: ${request.pathname}`);
  });
  const anchor = vi.fn().mockImplementation(async request => ({ state: "BROADCAST", root: request.root, txid: request.root, feeZat: 10_000, pool: "ironwood" }));
  const transport: AutomationTransport = { anchor, fetcher: vi.fn() };
  const config = { startedAt: new Date(now - 600_000), chain };
  const poll = () => prisma.participateAutomationState.update({ where: { hostId: host.id }, data: { nextPollAt: new Date(0) } });
  const jobs = () => prisma.participateAutomationJob.findMany({ where: { hostId: host.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const revisions = () => prisma.archiveRevision.findMany({ where: { archive: { communityId: host.id, recordId: `zcg-github-${issue.number}` } }, orderBy: { revision: "asc" } });
  const event = (id: number, kind: string, label?: string) => ({
    id, event: kind, created_at: new Date(now - 10_000 + id).toISOString(),
    actor: { id: 456, login: "committee-test" }, url: `${API}/events/${id}`,
    ...(label ? { label: { name: label, color: "004400" } } : {})
  });
  const approve = () => {
    issue.state = "closed"; issue.state_reason = "completed"; issue.labels = [...reviewLabels, approvedLabel];
    issue.updated_at = new Date(now - 5_000).toISOString();
    upstream.events = [event(1, "labeled", approvedLabel.name), event(2, "closed")];
    upstream.comments = [{
      id: 777, url: `${API}/comments/777`, html_url: `${issue.html_url}#issuecomment-777`, body: "The committee approved this application.",
      user: { id: 456, login: "committee-test" }, author_association: "MEMBER",
      created_at: new Date(now - 9_000).toISOString(), updated_at: new Date(now - 9_000).toISOString()
    }];
  };
  return { owner, host, committee, issue, upstream, config, transport, fetcher, anchor, poll, jobs, revisions, event, approve };
}

describe.skipIf(!databaseUrl)("official GitHub status revisions with automatic Ironwood anchors", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("PARTICIPATE_PUBLIC_DEMO", "true");
    vi.stubEnv("WORKSPACE_PREVIEW", "false"); vi.stubEnv("APP_BASE_URL", "https://participate.example.org");
    observe.mockReset(); observe.mockResolvedValue({ version: "ZVOICE_CHAIN_CHECK_V1", network: "mainnet", confirmations: 10, requiredConfirmations: 10, blockHeight: 100 });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  afterAll(() => prisma.$disconnect());

  it("automatically imports an unlabeled application and anchors it only once in Ironwood", async () => {
    const f = await fixture();
    f.issue.title = "Grant Application - Untriaged synthetic application";
    f.issue.body = untriagedApplication; f.issue.labels = [];
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "VERIFIED" });
    expect(await f.revisions()).toHaveLength(1);
    expect(f.anchor).toHaveBeenCalledTimes(1);
    expect(f.anchor.mock.calls[0][0].pool).toBe("ironwood");
    const initial = (await f.revisions())[0];
    const checked = await verifyArchivePackage(JSON.parse(initial.packageJson), initial.manifestHash);
    expect(checked.bundle.files.find(file => file.path === "proposal.md")!.data).toBe(Buffer.from(untriagedApplication).toString("base64"));
    await f.poll(); await runParticipateAutomation(f.config, f.transport, f.fetcher);
    expect(await f.jobs()).toHaveLength(1); expect(f.anchor).toHaveBeenCalledTimes(1);
    f.approve(); await f.poll();
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "VERIFIED" });
    expect((await f.revisions()).map(row => row.revision)).toEqual([1, 2]);
  });

  it("imports a custom-title unlabelled grant and opens participation despite the signer daily limit", async () => {
    const f = await fixture();
    f.issue.title = "Zecboat: Wake v1, a custom Halo 2 circuit for note lineage"; f.issue.body = untriagedApplication; f.issue.labels = [];
    f.anchor.mockImplementation(async request => ({ state: "RETRY", root: request.root, code: "DAILY_RECORD_LIMIT_REACHED" }));
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "RETRY" });
    const revisions = await f.revisions(); expect(revisions).toHaveLength(1);
    expect((await f.jobs())[0]).toMatchObject({ revisionId: revisions[0].id, txid: null, lastErrorCode: "DAILY_RECORD_LIMIT_REACHED" });
    expect(await prisma.participateAutomationLog.count({ where: { hostId: f.host.id, event: "proposal_imported" } })).toBe(1);
    await prisma.user.update({ where: { id: f.owner.id }, data: { email: `${randomUUID()}@example.test`, emailVerifiedAt: new Date() } });
    const session = { subjectType: "user" as const, userId: f.owner.id, nick: f.owner.nick, role: f.owner.role };
    const board = await readProposalParticipationBoard(f.host.id, session);
    expect(board.canParticipate).toBe(true);
    expect(board.proposals).toEqual([expect.objectContaining({ recordId: `zcg-github-${f.issue.number}`, likes: 0, commentCount: 0 })]);
    expect((await readArchiveDiscussion(f.host.id, `zcg-github-${f.issue.number}`, session)).capabilities).toMatchObject({ canPost: true, canReact: true });
  });

  it("recovers a missed application without resetting polling, signing, or duplicating it", async () => {
    const f = await fixture(); f.upstream.candidates = [];
    await runParticipateAutomation(f.config, f.transport, f.fetcher);
    const before = await prisma.participateAutomationState.findUniqueOrThrow({ where: { hostId: f.host.id } });
    f.issue.title = "Missed custom-title grant"; f.issue.body = untriagedApplication; f.issue.labels = [];
    const scope = { hostId: f.host.id, committeeId: f.committee.id };
    expect(await captureSelectedOfficialProposals(scope, [f.issue.number], recordLog, f.fetcher)).toEqual({ candidates: 1, queued: 1, reconciled: 1 });
    expect(await f.revisions()).toHaveLength(0); expect(f.anchor).not.toHaveBeenCalled();
    expect(await captureSelectedOfficialProposals(scope, [f.issue.number], recordLog, f.fetcher)).toEqual({ candidates: 1, queued: 0, reconciled: 1 });
    expect(await f.jobs()).toHaveLength(1);
    expect(await prisma.participateAutomationState.findUniqueOrThrow({ where: { hostId: f.host.id } })).toEqual(before);
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "VERIFIED" });
    expect(await f.revisions()).toHaveLength(1); expect(f.anchor).toHaveBeenCalledTimes(1);
  });

  it("keeps production member proposals readable without treating them as official sources or blocking new intake", async () => {
    const f = await fixture();
    const native = await buildNativeProposalPackage(`native-${randomUUID()}`, {
      title: "A member's production proposal", applicant: "Member", body: "A complete public proposal with sufficiently detailed information. ".repeat(5),
      requestedAmountUsd: "100", tags: [], githubUrl: f.issue.html_url, forumUrl: "https://forum.zcashcommunity.com/t/example/999101"
    }, new Date().toISOString(), "production");
    const original = await publishArchiveRevision(f.host.id, native.bundle, native.manifestHash, f.committee.id);
    f.issue.title = "Grant Application - Official application"; f.issue.body = untriagedApplication; f.issue.labels = [];
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "VERIFIED" });
    expect(await f.jobs()).toHaveLength(1); expect(await f.revisions()).toHaveLength(1);
    expect(await prisma.archiveAnchor.count({ where: { revisionId: original.id } })).toBe(0);
    expect(await prisma.archiveRevision.findUniqueOrThrow({ where: { id: original.id } })).toMatchObject({ manifestHash: native.manifestHash });
  });

  it("logs why a non-application was skipped without checkpoints, imports or wallet calls", async () => {
    const f = await fixture(); f.issue.labels = []; f.issue.title = "V12 Credits Application - Example";
    const scope = { hostId: f.host.id, committeeId: f.committee.id };
    expect(await captureSelectedOfficialProposals(scope, [f.issue.number], recordLog, f.fetcher)).toEqual({ candidates: 1, queued: 0, reconciled: 0 });
    expect(await f.jobs()).toHaveLength(0); expect(await f.revisions()).toHaveLength(0); expect(f.anchor).not.toHaveBeenCalled();
    expect(await prisma.participateSourceCheckpoint.count({ where: { hostId: f.host.id } })).toBe(0);
    expect(await prisma.participateAutomationLog.findFirst({ where: { hostId: f.host.id, event: "source_candidate_skipped" } })).toMatchObject({ code: "SOURCE_NOT_GRANT_APPLICATION" });
  });

  it("preserves revision one, anchors approval and reopening, and never duplicates an unchanged observation", async () => {
    const f = await fixture();
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "VERIFIED" });
    const initial = (await f.revisions())[0];
    f.approve(); await f.poll();
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "VERIFIED" });
    const approved = (await f.revisions())[1];
    expect(approved.revision).toBe(2);
    const approvedPackage = await verifyArchivePackage(JSON.parse(approved.packageJson), approved.manifestHash);
    expect(approvedPackage.manifest.previousManifestHash).toBe(initial.manifestHash);
    expect(approvedPackage.bundle.files.some(file => Buffer.from(file.data, "base64").toString().includes("The committee approved this application."))).toBe(true);
    expect(await prisma.archiveRevision.findUniqueOrThrow({ where: { id: initial.id } })).toEqual(initial);
    await f.poll();
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "IDLE" });
    expect(await f.jobs()).toHaveLength(2); expect(f.anchor).toHaveBeenCalledTimes(2);
    f.issue.state = "open"; f.issue.state_reason = null; f.issue.labels = [...reviewLabels];
    f.issue.updated_at = new Date(Date.now() - 1_000).toISOString();
    f.upstream.events.push(f.event(3, "unlabeled", approvedLabel.name), f.event(4, "reopened"));
    await f.poll();
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "VERIFIED" });
    const revisions = await f.revisions();
    expect(revisions.map(row => row.revision)).toEqual([1, 2, 3]);
    const reopened = await verifyArchivePackage(JSON.parse(revisions[2].packageJson), revisions[2].manifestHash);
    expect(reopened.manifest.previousManifestHash).toBe(approved.manifestHash);
    expect(f.anchor.mock.calls.map(call => call[0].pool)).toEqual(["ironwood", "ironwood", "ironwood"]);
    expect(new Set(f.anchor.mock.calls.map(call => call[0].root)).size).toBe(3);
    expect((await f.jobs()).every(job => job.state === "VERIFIED")).toBe(true);
  });

  it("creates revision two for an imported official record without replacing its original archive", async () => {
    const f = await fixture();
    const original = await buildSourceProposal(f.issue, f.issue.number, new Date().toISOString());
    const before = await publishArchiveRevision(f.host.id, original.bundle, original.manifestHash, f.committee.id);
    f.approve();
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "VERIFIED" });
    const revisions = await f.revisions();
    expect(revisions.map(row => row.revision)).toEqual([1, 2]);
    expect(revisions[0]).toMatchObject({ id: before.id, manifestHash: original.manifestHash, packageJson: canonicalJson(original.bundle) });
    expect(JSON.parse(JSON.parse(revisions[1].packageJson).manifest).previousManifestHash).toBe(original.manifestHash);
    expect(await f.jobs()).toHaveLength(1); expect(f.anchor).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["zcg-graphsense-2026-09-28", 424], ["zcg-ironwood-2026-09-28", 438], ["zcg-seedsigner-2026-09-14", 411],
    ["zcg-mumbai-2026-09-14", 405], ["zcg-arabia-2026-08-31", 400]
  ] as const)("links historical %s to official issue %i without replacing its record ID", async (recordId, issueNumber) => {
    const f = await fixture();
    const historical = (await readPilotPackages()).find(row => row.manifest.recordId === recordId)!;
    expect(historical.manifest.sources.every(source => !source.startsWith(SOURCE))).toBe(true);
    const original = await publishArchiveRevision(f.host.id, historical.bundle, historical.manifestHash, f.committee.id);
    f.issue.number = issueNumber; f.issue.html_url = `${SOURCE}/${issueNumber}`; f.issue.title = historical.manifest.title;
    f.approve();
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "VERIFIED" });
    const revisions = await prisma.archiveRevision.findMany({ where: { archiveId: original.archiveId }, orderBy: { revision: "asc" } });
    expect(revisions.map(row => row.revision)).toEqual([1, 2]); expect(revisions[0]).toEqual(original);
    const next = await verifyArchivePackage(JSON.parse(revisions[1].packageJson), revisions[1].manifestHash);
    expect(next.manifest).toMatchObject({ recordId: historical.manifest.recordId, previousManifestHash: historical.manifestHash, revision: 2 });
    expect(next.manifest.sources).toEqual([`${SOURCE}/${issueNumber}`]);
    expect(await prisma.proposalArchive.count({ where: { communityId: f.host.id } })).toBe(1);
    expect((await f.jobs())[0]).toMatchObject({ issueNumber, revision: 2, revisionId: revisions[1].id, state: "VERIFIED" });
    expect(f.anchor).toHaveBeenCalledTimes(1);
  });

  it("reconciles a known proposal update outside discovery overlap without backfilling unknown issues", async () => {
    const f = await fixture();
    await runParticipateAutomation(f.config, f.transport, f.fetcher);
    const initial = (await f.revisions())[0];
    f.approve(); f.upstream.candidates = [];
    await prisma.participateSourceCheckpoint.updateMany({ where: { hostId: f.host.id }, data: { checkedAt: new Date(0) } });
    await f.poll();
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "VERIFIED" });
    const revisions = await f.revisions();
    expect(revisions).toHaveLength(2);
    expect(revisions[0]).toEqual(initial);
    expect(f.fetcher.mock.calls.some(call => new URL(String(call[0])).pathname.endsWith(`/issues/${f.issue.number}`))).toBe(true);
    expect(await f.jobs()).toHaveLength(2); expect(f.anchor).toHaveBeenCalledTimes(2);
  });

  it("limits unauthenticated reconciliation to one issue per fifteen minutes", async () => {
    const f = await fixture();
    const second = { ...f.issue, number: 999102, html_url: `${SOURCE}/999102` };
    for (const issue of [f.issue, second]) {
      const initial = await buildSourceProposal(issue, issue.number, new Date().toISOString());
      await publishArchiveRevision(f.host.id, initial.bundle, initial.manifestHash, f.committee.id);
    }
    f.upstream.candidates = [];
    const respond = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async (input, init) => {
      const pathname = new URL(String(input)).pathname;
      if (pathname.endsWith(`/issues/${second.number}`)) return Response.json(second);
      if (pathname.endsWith(`/issues/${second.number}/events`) || pathname.endsWith(`/issues/${second.number}/comments`)) return Response.json([]);
      return respond(input, init);
    });
    const scope = { hostId: f.host.id, committeeId: f.committee.id };
    const log: Parameters<typeof captureOfficialSourceRevisions>[3] = async (hostId, event, details = {}, level = "info", jobId, code) => {
      await prisma.participateAutomationLog.create({ data: { hostId, event, details, level, jobId, code } });
    };
    expect(await captureOfficialSourceRevisions(scope, f.config.startedAt, new Date(), log, f.fetcher)).toMatchObject({ reconciled: 1, queued: 0 });
    const checkpoint = await prisma.participateAutomationLog.findFirstOrThrow({ where: { hostId: f.host.id, event: "source_reconciliation_completed" } });
    expect(await prisma.participateSourceCheckpoint.count({ where: { hostId: f.host.id } })).toBe(1);
    f.fetcher.mockClear();
    expect(await captureOfficialSourceRevisions(scope, f.config.startedAt, new Date(checkpoint.createdAt.getTime() + 899_999), log, f.fetcher)).toMatchObject({ reconciled: 0, queued: 0 });
    expect(f.fetcher).toHaveBeenCalledTimes(1); // Discovery only; the other stale issue must wait.
    expect(await prisma.participateSourceCheckpoint.count({ where: { hostId: f.host.id } })).toBe(1);
    expect(await captureOfficialSourceRevisions(scope, f.config.startedAt, new Date(checkpoint.createdAt.getTime() + 900_000), log, f.fetcher)).toMatchObject({ reconciled: 1, queued: 0 });
    expect(await prisma.participateSourceCheckpoint.count({ where: { hostId: f.host.id } })).toBe(2);
    expect(await prisma.participateAutomationLog.count({ where: { hostId: f.host.id, event: "source_reconciliation_completed" } })).toBe(2);
    expect(await f.jobs()).toHaveLength(0); expect(f.anchor).not.toHaveBeenCalled();
  });

  it("reconciles a selected approval as revision two without discovery, duplication, signing, or resetting poll state", async () => {
    const f = await fixture();
    await runParticipateAutomation(f.config, f.transport, f.fetcher);
    const initial = (await f.revisions())[0];
    const state = await prisma.participateAutomationState.findUniqueOrThrow({ where: { hostId: f.host.id } });
    const periodicLog = await prisma.participateAutomationLog.create({ data: { hostId: f.host.id, event: "source_reconciliation_completed", level: "info", details: {} } });
    f.approve(); f.fetcher.mockClear();
    const scope = { hostId: f.host.id, committeeId: f.committee.id };
    expect(await reconcileOfficialSourceRevisions(scope, [f.issue.number], recordLog, f.fetcher)).toEqual({ candidates: 1, queued: 1, reconciled: 1 });
    const jobs = await f.jobs();
    const next = jobs.find(job => job.revision === 2)!;
    expect(next).toMatchObject({ issueNumber: f.issue.number, revision: 2, state: "CAPTURED" });
    const checked = await verifyArchivePackage(JSON.parse(next.packageJson), next.manifestHash);
    expect(checked.manifest).toMatchObject({ recordId: `zcg-github-${f.issue.number}`, previousManifestHash: initial.manifestHash, revision: 2 });
    expect(f.fetcher.mock.calls.every(call => new URL(String(call[0])).pathname.startsWith(`${new URL(API).pathname}/${f.issue.number}`))).toBe(true);
    expect(await reconcileOfficialSourceRevisions(scope, [f.issue.number], recordLog, f.fetcher)).toEqual({ candidates: 1, queued: 0, reconciled: 1 });
    expect(await f.jobs()).toEqual(jobs);
    expect(await f.revisions()).toEqual([initial]);
    expect(f.anchor).toHaveBeenCalledTimes(1); // Only the original fixture run signed; reconciliation merely queues.
    expect(await prisma.participateAutomationState.findUniqueOrThrow({ where: { hostId: f.host.id } })).toEqual(state);
    expect(await prisma.participateAutomationLog.findMany({ where: { hostId: f.host.id, event: "source_reconciliation_completed" } })).toEqual([periodicLog]);
    expect(await prisma.participateAutomationLog.count({ where: { hostId: f.host.id, event: "source_target_reconciliation_completed" } })).toBe(2);
  });

  it("rejects the whole selected reconciliation before any mutation when one target is unknown", async () => {
    const f = await fixture();
    const initial = await buildSourceProposal(f.issue, f.issue.number, new Date().toISOString());
    await publishArchiveRevision(f.host.id, initial.bundle, initial.manifestHash, f.committee.id);
    f.approve();
    await expect(reconcileOfficialSourceRevisions({ hostId: f.host.id, committeeId: f.committee.id }, [f.issue.number, 999199], recordLog, f.fetcher))
      .rejects.toThrow("SOURCE_RECONCILIATION_TARGET_UNKNOWN");
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(await f.jobs()).toHaveLength(0);
    expect(await prisma.participateSourceCheckpoint.count({ where: { hostId: f.host.id } })).toBe(0);
    expect(await prisma.participateAutomationLog.count({ where: { hostId: f.host.id } })).toBe(0);
  });

  it("cannot promote a native demo link into a selected official reconciliation", async () => {
    const f = await fixture();
    const demo = await buildNativeProposalPackage(`native-${randomUUID()}`, {
      title: "A native link never establishes official identity", applicant: "Demo author",
      body: "A sufficiently detailed public demo proposal, kept out of mainnet automation. ".repeat(5),
      requestedAmountUsd: "100", tags: [], githubUrl: f.issue.html_url, forumUrl: "https://forum.zcashcommunity.com/t/demo/999101"
    }, new Date().toISOString());
    const initial = await publishArchiveRevision(f.host.id, demo.bundle, demo.manifestHash, f.committee.id);
    await expect(reconcileOfficialSourceRevisions({ hostId: f.host.id, committeeId: f.committee.id }, [f.issue.number], recordLog, f.fetcher))
      .rejects.toThrow("SOURCE_RECONCILIATION_TARGET_UNKNOWN");
    expect(f.fetcher).not.toHaveBeenCalled(); expect(await f.jobs()).toHaveLength(0);
    expect(await prisma.archiveRevision.findUniqueOrThrow({ where: { id: initial.id } })).toEqual(initial);
    expect(await prisma.participateSourceCheckpoint.count({ where: { hostId: f.host.id } })).toBe(0);
    expect(await prisma.participateAutomationLog.count({ where: { hostId: f.host.id } })).toBe(0);
  });

  it.each([
    [], [999101, 999101], [0], [-1], [1.5], [Number.NaN], [Number.MAX_SAFE_INTEGER + 1],
    Array.from({ length: 11 }, (_, index) => 999100 + index)
  ])("rejects invalid or oversized selected reconciliation targets %j", async (...values: number[]) => {
    const f = await fixture();
    await expect(reconcileOfficialSourceRevisions({ hostId: f.host.id, committeeId: f.committee.id }, values, recordLog, f.fetcher))
      .rejects.toThrow("SOURCE_RECONCILIATION_TARGETS_INVALID");
    expect(f.fetcher).not.toHaveBeenCalled(); expect(await f.jobs()).toHaveLength(0);
    expect(await prisma.participateSourceCheckpoint.count({ where: { hostId: f.host.id } })).toBe(0);
    expect(await prisma.participateAutomationLog.count({ where: { hostId: f.host.id } })).toBe(0);
  });

  it("captures exactly three selected known changes while leaving another stale archive alone", async () => {
    const f = await fixture();
    const rows = Array.from({ length: 4 }, (_, index) => ({ ...f.issue, number: 999101 + index, html_url: `${SOURCE}/${999101 + index}` }));
    for (const issue of rows) {
      const initial = await buildSourceProposal(issue, issue.number, new Date().toISOString());
      await publishArchiveRevision(f.host.id, initial.bundle, initial.manifestHash, f.committee.id);
      issue.labels = [...reviewLabels, approvedLabel];
    }
    const selected = rows.slice(0, 3).map(issue => issue.number);
    f.fetcher.mockImplementation(async input => {
      const path = new URL(String(input)).pathname;
      for (const issue of rows.slice(0, 3)) {
        if (path === `${new URL(API).pathname}/${issue.number}`) return Response.json(issue);
        if (path === `${new URL(API).pathname}/${issue.number}/comments` || path === `${new URL(API).pathname}/${issue.number}/events`) return Response.json([]);
      }
      throw new Error("Reconciliation fetched an unselected source or discovery endpoint");
    });
    expect(await reconcileOfficialSourceRevisions({ hostId: f.host.id, committeeId: f.committee.id }, selected, recordLog, f.fetcher))
      .toEqual({ candidates: 3, queued: 3, reconciled: 3 });
    expect((await f.jobs()).map(job => job.issueNumber).sort()).toEqual(selected);
    expect((await f.jobs()).every(job => job.revision === 2)).toBe(true);
    expect(await prisma.participateSourceCheckpoint.count({ where: { hostId: f.host.id } })).toBe(3);
    expect(f.anchor).not.toHaveBeenCalled();
    expect(await prisma.archiveRevision.count({ where: { archive: { communityId: f.host.id } } })).toBe(4);
  });

  it("records safe selected-source failures without changing the regular reconciliation budget", async () => {
    const f = await fixture();
    const initial = await buildSourceProposal(f.issue, f.issue.number, new Date().toISOString());
    await publishArchiveRevision(f.host.id, initial.bundle, initial.manifestHash, f.committee.id);
    f.approve(); f.upstream.commentsFail = true;
    await expect(reconcileOfficialSourceRevisions({ hostId: f.host.id, committeeId: f.committee.id }, [f.issue.number], recordLog, f.fetcher))
      .rejects.toThrow("SOURCE_HTTP_ERROR");
    expect(await f.jobs()).toHaveLength(0);
    const logs = await prisma.participateAutomationLog.findMany({ where: { hostId: f.host.id } });
    expect(logs.some(log => log.event === "source_target_reconciliation_failed" && log.code === "SOURCE_HTTP_ERROR")).toBe(true);
    expect(logs.every(log => log.event !== "source_reconciliation_completed")).toBe(true);
    expect(JSON.stringify(logs)).not.toContain("never-log-this");
  });

  it("holds the source cursor and captures nothing partial when associated comments fail", async () => {
    const f = await fixture();
    await runParticipateAutomation(f.config, f.transport, f.fetcher);
    const before = await prisma.participateAutomationState.findUniqueOrThrow({ where: { hostId: f.host.id } });
    const initial = await f.revisions();
    f.approve(); f.upstream.commentsFail = true; await f.poll();
    await runParticipateAutomation(f.config, f.transport, f.fetcher);
    const failed = await prisma.participateAutomationState.findUniqueOrThrow({ where: { hostId: f.host.id } });
    expect(failed.cursorAt).toEqual(before.cursorAt); expect(failed.failures).toBe(1);
    expect(failed.lastErrorCode).toMatch(/^SOURCE_/);
    expect(await f.revisions()).toEqual(initial); expect(await f.jobs()).toHaveLength(1);
    const logs = await prisma.participateAutomationLog.findMany({ where: { hostId: f.host.id } });
    expect(logs.some(row => row.event === "discovery_failed" && row.level === "error")).toBe(true);
    expect(JSON.stringify(logs)).not.toContain("never-log-this");
    f.upstream.commentsFail = false; await f.poll();
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "VERIFIED" });
    expect(await f.jobs()).toHaveLength(2); expect(f.anchor).toHaveBeenCalledTimes(2);
  });

  it("captures an associated decision comment edit without inventing an individual committee ballot", async () => {
    const f = await fixture();
    await runParticipateAutomation(f.config, f.transport, f.fetcher);
    f.approve(); await f.poll(); await runParticipateAutomation(f.config, f.transport, f.fetcher);
    const before = (await f.revisions())[1];
    f.upstream.comments = [{
      id: 777, url: `${API}/comments/777`, html_url: `${f.issue.html_url}#issuecomment-777`,
      body: "Correction: approval is conditional on the revised budget.", user: { id: 456, login: "committee-test" },
      author_association: "MEMBER", created_at: new Date(Date.now() - 30_000).toISOString(), updated_at: new Date(Date.now() - 1_000).toISOString()
    }];
    f.issue.updated_at = new Date(Date.now() - 500).toISOString();
    await f.poll();
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "VERIFIED" });
    const revisions = await f.revisions();
    expect(revisions.map(row => row.revision)).toEqual([1, 2, 3]);
    expect(revisions[1]).toEqual(before);
    const checked = await verifyArchivePackage(JSON.parse(revisions[2].packageJson), revisions[2].manifestHash);
    expect(checked.manifest.previousManifestHash).toBe(before.manifestHash);
    expect(checked.bundle.files.some(file => Buffer.from(file.data, "base64").toString().includes("Correction: approval is conditional"))).toBe(true);
    expect(await prisma.signedDecisionRound.count({ where: { revisionId: { in: revisions.map(row => row.id) } } })).toBe(0);
    expect(f.anchor).toHaveBeenCalledTimes(3);
  });

  it("does not spend again for public comments or an updated-at timestamp alone", async () => {
    const f = await fixture();
    await runParticipateAutomation(f.config, f.transport, f.fetcher);
    const initial = await f.revisions();
    f.issue.updated_at = new Date(Date.now() - 500).toISOString();
    f.upstream.comments = [{ id: 888, author_association: "NONE", body: "A public reply is not an official decision." }];
    await f.poll();
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "IDLE" });
    expect(await f.jobs()).toHaveLength(1); expect(await f.revisions()).toEqual(initial);
    expect(f.anchor).toHaveBeenCalledTimes(1);
  });

  it("rejects mixed snapshots if an issue changes while its events and comments are fetched", async () => {
    const f = await fixture();
    const respond = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async (input, init) => {
      const response = await respond(input, init);
      if (new URL(String(input)).pathname.endsWith("/comments")) f.approve();
      return response;
    });
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "IDLE" });
    const state = await prisma.participateAutomationState.findUniqueOrThrow({ where: { hostId: f.host.id } });
    expect(state).toMatchObject({ cursorAt: f.config.startedAt, failures: 1, lastErrorCode: "SOURCE_CHANGED_DURING_CAPTURE" });
    expect(await f.jobs()).toHaveLength(0); expect(await f.revisions()).toHaveLength(0);
    expect(f.anchor).not.toHaveBeenCalled();
  });

  it("holds a failed known-source cursor while still capturing an unrelated valid new proposal", async () => {
    const f = await fixture();
    await runParticipateAutomation(f.config, f.transport, f.fetcher);
    const checkpoint = await prisma.participateAutomationState.findUniqueOrThrow({ where: { hostId: f.host.id } });
    const original = await f.revisions();
    const second = { ...f.issue, number: 999102, html_url: `${SOURCE}/999102`, updated_at: new Date(Date.now() - 500).toISOString() };
    f.issue.body = ""; f.issue.updated_at = second.updated_at;
    f.upstream.candidates = [f.issue, second];
    const respond = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async (input, init) => {
      const pathname = new URL(String(input)).pathname;
      if (pathname.endsWith(`/issues/${second.number}`)) return Response.json(second);
      if (pathname.endsWith(`/issues/${second.number}/events`) || pathname.endsWith(`/issues/${second.number}/comments`)) return Response.json([]);
      return respond(input, init);
    });
    await f.poll();
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "VERIFIED" });
    const state = await prisma.participateAutomationState.findUniqueOrThrow({ where: { hostId: f.host.id } });
    expect(state.cursorAt).toEqual(checkpoint.cursorAt); expect(state.failures).toBe(1);
    expect((await f.jobs()).map(job => job.issueNumber).sort()).toEqual([f.issue.number, second.number]);
    expect(await f.revisions()).toEqual(original); expect(f.anchor).toHaveBeenCalledTimes(2);
    expect(await prisma.participateAutomationLog.count({ where: { hostId: f.host.id, event: "source_capture_failed", level: "error" } })).toBeGreaterThan(0);
  });

  it("retains successive pending changes while a signer retry keeps its original root", async () => {
    const f = await fixture();
    f.anchor.mockRejectedValue(new AutomationTransportError("SIGNER_UNAVAILABLE"));
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "RETRY" });
    const originalRoot = f.anchor.mock.calls[0][0].root;
    f.approve(); await f.poll(); await runParticipateAutomation(f.config, f.transport, f.fetcher);
    f.issue.state = "open"; f.issue.state_reason = null; f.issue.labels = [...reviewLabels];
    f.issue.updated_at = new Date(Date.now() - 500).toISOString();
    f.upstream.events.push(f.event(3, "unlabeled", approvedLabel.name), f.event(4, "reopened"));
    await f.poll(); await runParticipateAutomation(f.config, f.transport, f.fetcher);
    const jobs = await f.jobs();
    expect(jobs).toHaveLength(3);
    const packages = jobs.map(job => JSON.parse(JSON.parse(job.packageJson).manifest)).sort((a, b) => a.revision - b.revision);
    expect(packages.map(value => value.revision)).toEqual([1, 2, 3]);
    const ordered = [...jobs].sort((a, b) => JSON.parse(JSON.parse(a.packageJson).manifest).revision - JSON.parse(JSON.parse(b.packageJson).manifest).revision);
    expect(packages[1].previousManifestHash).toBe(ordered[0].manifestHash);
    expect(packages[2].previousManifestHash).toBe(ordered[1].manifestHash);
    await f.poll(); await runParticipateAutomation(f.config, f.transport, f.fetcher);
    expect(await f.jobs()).toHaveLength(3);
    await prisma.participateAutomationJob.update({ where: { id: ordered[0].id }, data: { nextAttemptAt: new Date(0) } });
    f.anchor.mockImplementation(async request => ({ state: "BROADCAST", root: request.root, txid: request.root, feeZat: 10_000, pool: "ironwood" }));
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "VERIFIED" });
    expect(f.anchor.mock.lastCall?.[0].root).toBe(originalRoot);
    expect(await f.jobs()).toHaveLength(3);
  });

  it("excludes native demo links from status tracking and ignores untracked terminal issues", async () => {
    const f = await fixture();
    const demo = await buildNativeProposalPackage(`native-${randomUUID()}`, {
      title: "Native demo links are not official source identity", applicant: "Demo author", body: "A complete public demo proposal with sufficiently detailed test information. ".repeat(5),
      requestedAmountUsd: "100", tags: [], githubUrl: f.issue.html_url, forumUrl: "https://forum.zcashcommunity.com/t/demo/999101"
    }, new Date().toISOString());
    const revision = await publishArchiveRevision(f.host.id, demo.bundle, demo.manifestHash, f.committee.id);
    f.approve();
    expect(await runParticipateAutomation(f.config, f.transport, f.fetcher)).toEqual({ state: "IDLE" });
    expect(await f.jobs()).toHaveLength(0); expect(f.anchor).not.toHaveBeenCalled();
    expect(await prisma.archiveRevision.findUniqueOrThrow({ where: { id: revision.id } })).toMatchObject({ manifestHash: demo.manifestHash });
    expect(await prisma.archiveAnchor.count({ where: { revisionId: revision.id } })).toBe(0);
  });

  it("protects revision identity and immutable logs in PostgreSQL", async () => {
    const f = await fixture();
    await runParticipateAutomation(f.config, f.transport, f.fetcher);
    f.approve(); await f.poll(); await runParticipateAutomation(f.config, f.transport, f.fetcher);
    const jobs = await f.jobs(), revisions = await f.revisions();
    expect(jobs).toHaveLength(2); expect(revisions).toHaveLength(2);
    await expect(prisma.$executeRaw`UPDATE "ParticipateAutomationJob" SET "revision" = "revision" + 10 WHERE "id" = ${jobs[1].id}`).rejects.toThrow();
    await expect(prisma.$executeRaw`UPDATE "ParticipateAutomationJob" SET "sourceFingerprint" = ${"f".repeat(64)} WHERE "id" = ${jobs[1].id}`).rejects.toThrow();
    await expect(prisma.archiveRevision.update({ where: { id: revisions[0].id }, data: { packageJson: "{}" } })).rejects.toThrow();
    await expect(prisma.archiveRevision.delete({ where: { id: revisions[0].id } })).rejects.toThrow();
    await expect(prisma.participateAutomationLog.deleteMany({ where: { hostId: f.host.id } })).rejects.toThrow();
    expect(await f.jobs()).toEqual(jobs); expect(await f.revisions()).toEqual(revisions);
  });
});

describe.skipIf(!databaseUrl)("verdict closing record", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("PARTICIPATE_PUBLIC_DEMO", "true"); vi.stubEnv("WORKSPACE_PREVIEW", "false"); vi.stubEnv("APP_BASE_URL", "https://participate.example.org");
    observe.mockReset(); observe.mockResolvedValue({ confirmations: 10, requiredConfirmations: 10, blockHeight: 100 });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  it("freezes the latest versions and historical likes on a genuine official status transition", async () => {
    const f = await fixture(); await runParticipateAutomation(f.config, f.transport, f.fetcher);
    const user = await prisma.user.update({ where: { id: f.owner.id }, data: { email: `${randomUUID()}@example.test`, emailVerifiedAt: new Date() } });
    const session = { subjectType: "user" as const, userId: user.id, nick: user.nick, role: user.role }, recordId = `zcg-github-${f.issue.number}`;
    const { mutateArchiveDiscussion } = await import("@/lib/services/archive-discussion");
    const { readActivityReceipt } = await import("@/lib/services/activity-anchors");
    const { verifyActivityBundle } = await import("@/lib/archive/activity");
    const { captureDiscussionClosure } = await import("@/lib/services/discussion-closure");
    const comment = await mutateArchiveDiscussion(f.host.id, recordId, session, "post", { body: "Version one", requestKey: randomUUID() });
    await mutateArchiveDiscussion(f.host.id, recordId, session, "reaction", { liked: true, version: 1, requestKey: randomUUID() }, comment.id);
    await mutateArchiveDiscussion(f.host.id, recordId, session, "edit", { body: "Version at verdict", version: 1, requestKey: randomUUID() }, comment.id);
    f.approve(); await f.poll(); await runParticipateAutomation(f.config, f.transport, f.fetcher);
    const revision = (await f.revisions()).at(-1)!;
    const closing = await prisma.archiveDiscussionClosure.findUniqueOrThrow({ where: { revisionId: revision.id } });
    const snapshot = JSON.parse(closing.snapshotJson);
    expect(snapshot).toMatchObject({ status: "APPROVED", proposalRevision: 2, throughSequence: 3, comments: [expect.objectContaining({ id: comment.id, currentVersion: 2, versions: [expect.objectContaining({ version: 1, likes: 1 }), expect.objectContaining({ version: 2, likes: 0 })] })] });
    const event = await prisma.archiveActivityEvent.findUniqueOrThrow({ where: { archiveId_sourceKey: { archiveId: revision.archiveId, sourceKey: `closure:${revision.id}` } } });
    const receipt = (await readActivityReceipt(f.host.id, recordId, event.id))!.bundle;
    expect((await verifyActivityBundle(receipt, event.eventHash)).event).toMatchObject({ kind: "DISCUSSION_CLOSED", actor: "SOURCE_OBSERVER", authority: "OFFICIAL_SOURCE" });
    expect(JSON.stringify(receipt)).not.toContain(user.email!); expect(JSON.stringify(receipt)).not.toContain(user.id);
    await mutateArchiveDiscussion(f.host.id, recordId, session, "edit", { body: "After the verdict", version: 2, requestKey: randomUUID() }, comment.id);
    await captureDiscussionClosure(revision.id);
    expect(await prisma.archiveDiscussionClosure.findUniqueOrThrow({ where: { revisionId: revision.id } })).toEqual(closing);
    expect((await readActivityReceipt(f.host.id, recordId, event.id))!.bundle).toEqual(receipt);
    await expect(prisma.archiveDiscussionClosure.delete({ where: { id: closing.id } })).rejects.toThrow();
  });
});
