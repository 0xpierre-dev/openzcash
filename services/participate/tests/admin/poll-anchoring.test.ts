import { beforeEach, describe, expect, it, vi } from "vitest";

type PollRecord = {
  id: string;
  status: "DRAFT" | "ANCHORING" | "SCHEDULED";
  questionHash: string;
  voteModel: "SINGLE_CHOICE";
  quorumPercent: number;
  passingThresholdPercent: number;
  opensAt: Date;
  closesAt: Date;
  anchorTxid: string | null;
  communityId?: string;
  question?: string;
  proposalBody?: string;
  proposalTags?: string[];
  contentHashVersion?: string;
  treasuryId?: string | null;
  requestedAmountZat?: bigint | null;
  requestedAmountUsdCents?: bigint | null;
  optionALabel?: string;
  optionBLabel?: string;
  optionCLabel?: string;
};

const { findUniqueMock, publicAuditEventCreateMock, updateManyMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  publicAuditEventCreateMock: vi.fn(),
  updateManyMock: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  db: {
    poll: {
      findUnique: findUniqueMock,
      updateMany: updateManyMock
    },
    publicAuditEvent: {
      create: publicAuditEventCreateMock
    }
  }
}));

import {
  buildAndStoreAnchorMemo,
  markPollAnchoring,
  releasePollAnchoring
} from "@/lib/services/polls";
import { LEGACY_PROPOSAL_CONTENT_HASH_VERSION, TAGGED_PROPOSAL_CONTENT_HASH_VERSION, proposalContentHash, PROPOSAL_CONTENT_HASH_VERSION } from "@/lib/domain/proposal-content";

function installPollState() {
  const poll: PollRecord = {
    id: "poll_1",
    status: "DRAFT",
    questionHash: "hash_1",
    voteModel: "SINGLE_CHOICE",
    quorumPercent: 40,
    passingThresholdPercent: 67,
    opensAt: new Date("2026-05-01T10:00:00.000Z"),
    closesAt: new Date("2026-05-03T10:00:00.000Z"),
    anchorTxid: null
  };

  findUniqueMock.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === poll.id ? { ...poll } : null
  );

  updateManyMock.mockImplementation(
    async ({
      where,
      data
    }: {
      where: { id: string; status: PollRecord["status"]; questionHash?: string; opensAt?: Date; closesAt?: Date; proposalTags?: { equals: string[] }; contentHashVersion?: string };
      data: Partial<PollRecord>;
    }) => {
      if (where.id !== poll.id || where.status !== poll.status ||
        (where.questionHash !== undefined && where.questionHash !== poll.questionHash) ||
        (where.contentHashVersion !== undefined && where.contentHashVersion !== poll.contentHashVersion) ||
        (where.proposalTags !== undefined && JSON.stringify(where.proposalTags.equals) !== JSON.stringify(poll.proposalTags ?? [])) ||
        (where.opensAt !== undefined && where.opensAt.getTime() !== poll.opensAt.getTime()) ||
        (where.closesAt !== undefined && where.closesAt.getTime() !== poll.closesAt.getTime())) {
        return { count: 0 };
      }

      Object.assign(poll, data);

      return { count: 1 };
    }
  );

  return poll;
}

beforeEach(() => {
  findUniqueMock.mockReset();
  publicAuditEventCreateMock.mockReset();
  publicAuditEventCreateMock.mockResolvedValue({});
  updateManyMock.mockReset();
});

describe("poll anchoring", () => {
  it("moves a draft poll to anchoring before building the memo", async () => {
    const poll = installPollState();

    const memo = await buildAndStoreAnchorMemo("poll_1");

    expect(memo).toBe(
      "POLL|v2|poll_1|hash_1|2026-05-01T10:00:00.000Z|2026-05-03T10:00:00.000Z|SINGLE_CHOICE|Q40|T67"
    );
    expect(poll.status).toBe("ANCHORING");
    expect(updateManyMock).toHaveBeenCalledWith({
      where: {
        id: "poll_1",
        status: "DRAFT",
        questionHash: poll.questionHash,
        opensAt: poll.opensAt,
        closesAt: poll.closesAt
      },
      data: {
        status: "ANCHORING"
      }
    });
  });

  it("anchors a verified full-content digest with its explicit version", async () => {
    const poll = installPollState();
    Object.assign(poll, { communityId: "alpha", question: "Community project", proposalBody: "Complete proposal and budget", treasuryId: "fund-a", requestedAmountZat: 100000001n, optionALabel: "Approve", optionBLabel: "Reject", optionCLabel: "Abstain", contentHashVersion: PROPOSAL_CONTENT_HASH_VERSION });
    poll.questionHash = proposalContentHash({ communityId: poll.communityId!, title: poll.question!, body: poll.proposalBody!, optionLabels: ["Approve", "Reject", "Abstain"], treasuryId: poll.treasuryId!, requestedAmountZat: poll.requestedAmountZat! });
    expect(await buildAndStoreAnchorMemo("poll_1")).toBe(`POLL|v2|poll_1|${poll.questionHash}|2026-05-01T10:00:00.000Z|2026-05-03T10:00:00.000Z|SINGLE_CHOICE|Q40|T67|CONTENT=${PROPOSAL_CONTENT_HASH_VERSION}`);
  });

  it.each([LEGACY_PROPOSAL_CONTENT_HASH_VERSION, TAGGED_PROPOSAL_CONTENT_HASH_VERSION, PROPOSAL_CONTENT_HASH_VERSION] as const)("anchors existing %s commitments using the recorded version", async (version) => {
    const poll = installPollState();
    Object.assign(poll, { communityId: "alpha", question: "Community project", proposalBody: "Complete proposal and budget", proposalTags: [], treasuryId: null, requestedAmountZat: null, optionALabel: "Approve", optionBLabel: "Reject", optionCLabel: "Abstain", contentHashVersion: version });
    poll.questionHash = proposalContentHash({ communityId: "alpha", title: poll.question!, body: poll.proposalBody!, optionLabels: ["Approve", "Reject", "Abstain"], treasuryId: null, requestedAmountZat: null }, version);
    expect(await buildAndStoreAnchorMemo("poll_1")).toContain(`|CONTENT=${version}`);
  });

  it("includes USD cents in the anchoring comparison and rejects a modified budget", async () => {
    const poll = installPollState();
    Object.assign(poll, { communityId: "alpha", question: "Community project", proposalBody: "Complete proposal and USD budget", treasuryId: "fund-a", requestedAmountZat: null, requestedAmountUsdCents: 240001n, optionALabel: "Approve", optionBLabel: "Reject", optionCLabel: "Abstain", contentHashVersion: PROPOSAL_CONTENT_HASH_VERSION });
    const content = { communityId: "alpha", title: poll.question!, body: poll.proposalBody!, optionLabels: ["Approve", "Reject", "Abstain"], treasuryId: "fund-a", requestedAmountZat: null, requestedAmountUsdCents: 240000n };
    poll.questionHash = proposalContentHash(content);
    await expect(buildAndStoreAnchorMemo("poll_1")).rejects.toMatchObject({ code: "PROPOSAL_CONTENT_COMMITMENT_INVALID" });
    expect(updateManyMock).not.toHaveBeenCalled();
    poll.requestedAmountUsdCents = 240000n;
    expect(await buildAndStoreAnchorMemo("poll_1")).toContain(`|CONTENT=${PROPOSAL_CONTENT_HASH_VERSION}`);
    expect(updateManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ requestedAmountUsdCents: 240000n, requestedAmountZat: null }) }));
  });

  it("rejects tags attached to a V1 commitment or question-only poll", async () => {
    const poll = installPollState();
    poll.proposalTags = ["education"];
    await expect(buildAndStoreAnchorMemo("poll_1")).rejects.toMatchObject({ code: "PROPOSAL_CONTENT_COMMITMENT_INVALID" });
    Object.assign(poll, { communityId: "alpha", question: "Community project", proposalBody: "Complete proposal and budget", treasuryId: null, requestedAmountZat: null, optionALabel: "Approve", optionBLabel: "Reject", optionCLabel: "Abstain", contentHashVersion: LEGACY_PROPOSAL_CONTENT_HASH_VERSION });
    poll.questionHash = proposalContentHash({ communityId: "alpha", title: poll.question!, body: poll.proposalBody!, optionLabels: ["Approve", "Reject", "Abstain"], treasuryId: null, requestedAmountZat: null }, LEGACY_PROPOSAL_CONTENT_HASH_VERSION);
    await expect(buildAndStoreAnchorMemo("poll_1")).rejects.toMatchObject({ code: "PROPOSAL_CONTENT_COMMITMENT_INVALID" });
    expect(poll.status).toBe("DRAFT");
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it("rejects changed tags after reading a valid V2 proposal", async () => {
    const poll = installPollState();
    Object.assign(poll, { communityId: "alpha", question: "Community project", proposalBody: "Complete proposal and budget", proposalTags: ["education"], treasuryId: null, requestedAmountZat: null, optionALabel: "Approve", optionBLabel: "Reject", optionCLabel: "Abstain", contentHashVersion: PROPOSAL_CONTENT_HASH_VERSION });
    poll.questionHash = proposalContentHash({ communityId: "alpha", title: poll.question!, body: poll.proposalBody!, tags: ["education"], optionLabels: ["Approve", "Reject", "Abstain"], treasuryId: null, requestedAmountZat: null });
    findUniqueMock.mockImplementation(async () => {
      const snapshot = { ...poll };
      poll.proposalTags = ["community"];
      return snapshot;
    });
    await expect(buildAndStoreAnchorMemo("poll_1")).rejects.toMatchObject({ code: "POLL_NOT_DRAFT" });
    expect(poll.status).toBe("DRAFT");
  });

  it("rejects proposal text with an unverified or question-only commitment before changing status", async () => {
    const poll = installPollState();
    poll.proposalBody = "Complete proposal and budget";
    await expect(buildAndStoreAnchorMemo("poll_1")).rejects.toMatchObject({ code: "PROPOSAL_CONTENT_COMMITMENT_INVALID" });
    poll.contentHashVersion = PROPOSAL_CONTENT_HASH_VERSION;
    poll.communityId = "alpha";
    poll.question = "Community project";
    await expect(buildAndStoreAnchorMemo("poll_1")).rejects.toMatchObject({ code: "PROPOSAL_CONTENT_COMMITMENT_INVALID" });
    expect(poll.status).toBe("DRAFT");
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it("rejects anchoring when a draft save changes the hash after the content read", async () => {
    const poll = installPollState();
    findUniqueMock.mockImplementation(async () => {
      const snapshot = { ...poll };
      poll.questionHash = "concurrently-saved-hash";
      return snapshot;
    });
    await expect(buildAndStoreAnchorMemo("poll_1")).rejects.toMatchObject({ code: "POLL_NOT_DRAFT" });
    expect(poll.status).toBe("DRAFT");
  });

  it("only marks anchored polls from anchoring state", async () => {
    const poll = installPollState();

    await buildAndStoreAnchorMemo("poll_1");
    await markPollAnchoring("poll_1", "txid_1");

    expect(poll.status).toBe("SCHEDULED");
    expect(poll.anchorTxid).toBe("txid_1");

    await expect(markPollAnchoring("poll_1", "txid_2")).rejects.toMatchObject({
      code: "POLL_NOT_ANCHORING",
      status: 409
    });
    expect(poll.anchorTxid).toBe("txid_1");
  });

  it("rejects repeated anchoring for non-draft polls", async () => {
    const poll = installPollState();

    await buildAndStoreAnchorMemo("poll_1");

    await expect(buildAndStoreAnchorMemo("poll_1")).rejects.toMatchObject({
      code: "POLL_NOT_DRAFT",
      status: 409
    });
    expect(poll.status).toBe("ANCHORING");
  });

  it("releases an anchoring poll back to draft before a txid is stored", async () => {
    const poll = installPollState();

    await buildAndStoreAnchorMemo("poll_1");
    await releasePollAnchoring("poll_1");

    expect(poll.status).toBe("DRAFT");
    expect(poll.anchorTxid).toBeNull();
  });
});
