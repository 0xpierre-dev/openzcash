// @vitest-environment node
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/lib/auth/guards";
import { LEGACY_PROPOSAL_CONTENT_HASH_VERSION, proposalContentHash, PROPOSAL_CONTENT_HASH_VERSION } from "@/lib/domain/proposal-content";

const databaseUrl = process.env.TREASURY_TEST_DATABASE_URL;
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (target.hostname !== "127.0.0.1" || target.port !== (process.env.PARTICIPATE_TEST_PORT ?? "55438") || target.pathname !== "/community_treasury_tests") {
    throw new Error("Proposal tag tests require the dedicated local treasury test database");
  }
}
const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? "postgresql://unused@127.0.0.1:1/unused" });
vi.mock("@/lib/db", () => ({ db: prisma }));
const { createCommunityProposal, saveCommunityProposalDraft, readProposalDetail } = await import("@/lib/services/proposal-discussion");
const { buildAndStoreAnchorMemo } = await import("@/lib/services/polls");

let ownerId: string;
let communityId: string;
let session: SessionPayload;
const input = {
  title: "A community workshop proposal", body: "Publish a workshop recording and an illustrated guide.",
  opensAt: "2027-01-01T12:00:00.000Z", closesAt: "2027-01-03T12:00:00.000Z"
};

describe.skipIf(!databaseUrl)("PostgreSQL proposal topics and commitments", () => {
  beforeEach(async () => {
    const marker = randomUUID();
    const owner = await prisma.user.create({ data: { nick: `tag-owner-${marker}`, passwordHash: "test-record-with-no-login-password", role: "USER" } });
    ownerId = owner.id;
    const community = await prisma.community.create({ data: {
      name: "Proposal topic integration", slug: `proposal-topics-${marker}`, createdById: ownerId,
      memberships: { create: { userId: ownerId, role: "OWNER" } },
      daoMembers: { create: { nick: "Test member", signalUsername: "test.member" } }
    } });
    communityId = community.id;
    session = { subjectType: "user", userId: ownerId, nick: owner.nick, role: "USER" };
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it("persists a USD request, edits exact cents and anchors its settlement rule without touching treasury funds", async () => {
    const fund = await prisma.communityTreasury.create({ data: { communityId, kind: "COMMUNITY" } });
    const created = await createCommunityProposal(communityId, ownerId, { ...input, treasuryId: fund.id, requestedAmountUsd: "2400.01" });
    expect(created.requestedAmountUsd).toBe("2400.01");
    expect(created.requestedAmountZec).toBeNull();
    const saved = await saveCommunityProposalDraft(communityId, created.id, ownerId, { ...input, treasuryId: fund.id, requestedAmountUsd: "2400.02" });
    expect((await readProposalDetail(saved.id, session, communityId)).requestedAmountUsd).toBe("2400.02");
    const row = await prisma.poll.findUniqueOrThrow({ where: { id: saved.id } });
    expect(row.requestedAmountUsdCents).toBe(240002n);
    expect(row.requestedAmountZat).toBeNull();
    expect(row.questionHash).toBe(proposalContentHash({ communityId, title: saved.title, body: saved.body, tags: saved.tags, optionLabels: ["Approve", "Reject", "Abstain"], treasuryId: fund.id, requestedAmountZat: null, requestedAmountUsdCents: 240002n }));
    expect(await buildAndStoreAnchorMemo(saved.id)).toContain(`|CONTENT=${PROPOSAL_CONTENT_HASH_VERSION}`);
    await expect(prisma.poll.update({ where: { id: saved.id }, data: { requestedAmountUsdCents: 1n } })).rejects.toThrow("Published proposal funding cannot be changed");
    await expect(prisma.poll.update({ where: { id: saved.id }, data: { status: "DRAFT", requestedAmountUsdCents: 1n } })).rejects.toThrow("Published proposal funding cannot be changed");
    expect(await prisma.communityTreasury.findUniqueOrThrow({ where: { id: fund.id } })).toMatchObject({ availableZat: 0n, reservedZat: 0n, committedZat: 0n, paidZat: 0n });
  });

  it("rejects malformed USD funding outside the API and catches an uncommitted budget before anchoring", async () => {
    const fund = await prisma.communityTreasury.create({ data: { communityId, kind: "COMMUNITY" } });
    const created = await createCommunityProposal(communityId, ownerId, { ...input, treasuryId: fund.id, requestedAmountUsd: "0.01" });
    for (const data of [{ requestedAmountUsdCents: 0n }, { requestedAmountUsdCents: -1n }, { requestedAmountZat: 1n }, { treasuryId: null }, { contentHashVersion: "PROPOSAL_CONTENT_V2" }]) {
      await expect(prisma.poll.update({ where: { id: created.id }, data })).rejects.toThrow();
    }
    await prisma.poll.update({ where: { id: created.id }, data: { requestedAmountUsdCents: 2n } });
    await expect(buildAndStoreAnchorMemo(created.id)).rejects.toMatchObject({ code: "PROPOSAL_CONTENT_COMMITMENT_INVALID" });
    expect((await prisma.poll.findUniqueOrThrow({ where: { id: created.id } })).status).toBe("DRAFT");
    await saveCommunityProposalDraft(communityId, created.id, ownerId, input);
    expect(await prisma.poll.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ treasuryId: null, requestedAmountUsdCents: null, requestedAmountZat: null });
  });

  it("persists topics through creation, omitted-field editing, readback and anchoring", async () => {
    const created = await createCommunityProposal(communityId, ownerId, { ...input, tags: ["education", "community"] });
    expect(created.tags).toEqual(["community", "education"]);
    const saved = await saveCommunityProposalDraft(communityId, created.id, ownerId, { ...input, body: "Updated workshop deliverables and a public progress report." });
    expect(saved.tags).toEqual(created.tags);
    expect((await readProposalDetail(created.id, session, communityId)).tags).toEqual(created.tags);
    const row = await prisma.poll.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.proposalTags).toEqual(created.tags);
    expect(row.contentHashVersion).toBe(PROPOSAL_CONTENT_HASH_VERSION);
    expect(row.questionHash).toBe(proposalContentHash({ communityId, title: saved.title, body: saved.body, tags: saved.tags, optionLabels: ["Approve", "Reject", "Abstain"], treasuryId: null, requestedAmountZat: null }));
    expect(await buildAndStoreAnchorMemo(created.id)).toContain(`|CONTENT=${PROPOSAL_CONTENT_HASH_VERSION}`);
    await expect(saveCommunityProposalDraft(communityId, created.id, ownerId, { ...input, tags: [] })).rejects.toMatchObject({ code: "PROPOSAL_NOT_DRAFT" });
    await expect(prisma.poll.update({ where: { id: created.id }, data: { proposalTags: [] } })).rejects.toThrow("Published proposal topics cannot be changed");
    await expect(prisma.poll.update({ where: { id: created.id }, data: { status: "DRAFT", proposalTags: [] } })).rejects.toThrow("Published proposal topics cannot be changed");
    expect((await prisma.poll.findUniqueOrThrow({ where: { id: created.id } })).proposalTags).toEqual(created.tags);
  });

  it("rejects unknown, duplicate, excessive and null topics even outside the service", async () => {
    const created = await createCommunityProposal(communityId, ownerId, input);
    for (const tags of [["approved"], ["education", "education"], ["education", "community", "wallets", "research"]]) {
      await expect(prisma.poll.update({ where: { id: created.id }, data: { proposalTags: tags } })).rejects.toThrow();
    }
    await expect(prisma.$executeRaw`UPDATE "Poll" SET "proposalTags" = ARRAY[NULL]::TEXT[] WHERE "id" = ${created.id}`).rejects.toThrow();
    await expect(prisma.$executeRaw`UPDATE "Poll" SET "proposalTags" = NULL WHERE "id" = ${created.id}`).rejects.toThrow();
    expect((await readProposalDetail(created.id, session, communityId)).tags).toEqual([]);
  });

  it("preserves existing V1 commitments and rejects attaching uncommitted topics to them", async () => {
    const legacyContent = { communityId, title: input.title, body: input.body, optionLabels: ["Approve", "Reject", "Abstain"], treasuryId: null, requestedAmountZat: null };
    const hash = proposalContentHash(legacyContent, LEGACY_PROPOSAL_CONTENT_HASH_VERSION);
    const legacy = await prisma.poll.create({ data: {
      communityId, createdById: ownerId, question: input.title, proposalBody: input.body,
      optionALabel: "Approve", optionBLabel: "Reject", optionCLabel: "Abstain",
      questionHash: hash, contentHashVersion: LEGACY_PROPOSAL_CONTENT_HASH_VERSION,
      opensAt: new Date(input.opensAt), closesAt: new Date(input.closesAt), feeZat: 1n
    } });
    await expect(prisma.poll.update({ where: { id: legacy.id }, data: { proposalTags: ["education"] } })).rejects.toThrow();
    expect(await buildAndStoreAnchorMemo(legacy.id)).toContain(`|${hash}|`);
    expect((await prisma.poll.findUniqueOrThrow({ where: { id: legacy.id } })).contentHashVersion).toBe(LEGACY_PROPOSAL_CONTENT_HASH_VERSION);
  });

  it("only permits a community manager to edit its draft topics, including explicit removal", async () => {
    const created = await createCommunityProposal(communityId, ownerId, { ...input, tags: ["education"] });
    const stranger = await prisma.user.create({ data: { nick: `tag-stranger-${randomUUID()}`, passwordHash: "test-record-with-no-login-password", role: "ADMIN" } });
    await expect(saveCommunityProposalDraft(communityId, created.id, stranger.id, { ...input, tags: ["security"] })).rejects.toMatchObject({ code: "PROPOSAL_NOT_FOUND" });
    expect((await readProposalDetail(created.id, session, communityId)).tags).toEqual(["education"]);
    expect((await saveCommunityProposalDraft(communityId, created.id, ownerId, { ...input, tags: [] })).tags).toEqual([]);
  });
});
