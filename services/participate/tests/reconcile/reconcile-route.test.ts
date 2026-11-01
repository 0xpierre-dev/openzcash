import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IncomingVoteNote } from "@/lib/zcash/zkool-client";

const TEST_INTERNAL_SECRET = "test-internal-secret";

const {
  dbMock,
  fetchIncomingVotesMock,
  syncWalletMock,
  deliverConfirmedVoteReceiptsForPollMock
} = vi.hoisted(() => ({
  dbMock: {},
  fetchIncomingVotesMock: vi.fn(),
  syncWalletMock: vi.fn(),
  deliverConfirmedVoteReceiptsForPollMock: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  db: dbMock
}));

vi.mock("@/lib/zcash/zkool-client", () => ({
  getZkoolClient: () => ({
    fetchIncomingVotes: fetchIncomingVotesMock,
    syncWallet: syncWalletMock
  })
}));

vi.mock("@/lib/services/vote-receipts", () => ({
  deliverConfirmedVoteReceiptsForPoll: deliverConfirmedVoteReceiptsForPollMock
}));

import { POST as reconcilePollVotes } from "@/app/api/internal/polls/[pollId]/reconcile/route";
import { POST as syncWallet } from "@/app/api/internal/wallet/sync/route";

type OptionLetter = "A" | "B" | "C" | "D" | "E";
type ReceiptStatus = "PENDING" | "CONFIRMED" | "REJECTED" | "DUPLICATE_IGNORED";
type TicketStatus = "ISSUED" | "LOCKED" | "VOTED";

type TestState = {
  poll: {
    id: string;
    communityId: string | null;
    status: "OPEN" | "CLOSED" | "SCHEDULED";
    opensAt: Date;
    closesAt: Date;
    feeZat: bigint;
  };
  ticket: {
    id: string;
    pollId: string;
    ticketHash: string;
    status: TicketStatus;
    lockedOptionLetter: OptionLetter | null;
    lockedRequestId: string | null;
    lockedAt: Date | null;
  };
  request: {
    id: string;
    shieldedAddress: string;
    optionLetter: OptionLetter;
    status: "ACTIVE" | "USED" | "EXPIRED";
  };
  receipts: Array<{
    pollId: string;
    ticketHash: string;
    receiptPublicId: string | null;
    optionLetter: OptionLetter;
    txid: string;
    blockHeight: number | null;
    amountZat: bigint;
    memo: string;
    status: ReceiptStatus;
    rejectionReason: string | null;
    confirmedAt: Date | null;
  }>;
  tally: {
    pollId: string;
    countA: number;
    countB: number;
    countC: number;
    countD: number;
    countE: number;
    totalConfirmed: number;
  } | null;
};

function makeState(overrides?: Omit<Partial<TestState>, "poll"> & { poll?: Partial<TestState["poll"]> }): TestState {
  const poll = {
    id: overrides?.poll?.id ?? "poll_1",
    communityId: overrides?.poll?.communityId === null ? null : "community_1",
    status: overrides?.poll?.status ?? "OPEN",
    opensAt: overrides?.poll?.opensAt ?? new Date("2000-01-01T00:00:00Z"),
    closesAt: overrides?.poll?.closesAt ?? new Date("2099-01-01T00:00:00Z"),
    feeZat: overrides?.poll?.feeZat ?? 10000n
  };

  const ticket = {
    id: overrides?.ticket?.id ?? "ticket_1",
    pollId: overrides?.ticket?.pollId ?? "poll_1",
    ticketHash: overrides?.ticket?.ticketHash ?? "ticket_hash_1",
    status: overrides?.ticket?.status ?? "ISSUED",
    lockedOptionLetter: overrides?.ticket?.lockedOptionLetter ?? null,
    lockedRequestId: overrides?.ticket?.lockedRequestId ?? null,
    lockedAt: overrides?.ticket?.lockedAt ?? null
  };

  const request = {
    id: overrides?.request?.id ?? "request_1",
    shieldedAddress: overrides?.request?.shieldedAddress ?? "utest1examplea",
    optionLetter: overrides?.request?.optionLetter ?? "A",
    status: overrides?.request?.status ?? ("ACTIVE" as const)
  };

  return {
    poll,
    ticket,
    request,
    receipts: overrides?.receipts ?? [],
    tally: overrides?.tally ?? null
  };
}

function makeDbApi(state: TestState, includeTransaction = true) {
  return {
    poll: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id !== state.poll.id) {
          return null;
        }

        return { ...state.poll };
      }),
      updateMany: vi.fn(async ({ where }) => ({ count: state.poll.id === where.id
        && state.poll.status === where.status && state.poll.communityId === where.communityId
        && state.poll.opensAt <= where.opensAt.lte && state.poll.closesAt > where.closesAt.gt ? 1 : 0 }))
    },
    voteTicket: {
      updateMany: vi.fn(
        async ({
          where,
          data
        }: {
          where: {
            id: string;
            status:
              | TicketStatus
              | {
                  in: TicketStatus[];
                };
          };
          data: { status: TicketStatus };
        }) => {
          const statusMatches =
            typeof where.status === "string"
              ? state.ticket.status === where.status
              : where.status.in.includes(state.ticket.status);

          if (where.id !== state.ticket.id || !statusMatches) {
            return { count: 0 };
          }

          state.ticket.status = data.status;
          return { count: 1 };
        }
      )
    },
    voteRequest: {
      findFirst: vi.fn(
        async ({
          where
        }: {
          where: {
            shieldedAddress: string;
            status:
              | "ACTIVE"
              | {
                  in: Array<"ACTIVE" | "USED">;
                };
          };
        }) => {
          const statusMatches =
            typeof where.status === "string"
              ? state.request.status === where.status
              : where.status.in.includes(state.request.status as "ACTIVE" | "USED");

          if (
            where.shieldedAddress !== state.request.shieldedAddress ||
            !statusMatches
          ) {
            return null;
          }

          return {
            optionLetter: state.request.optionLetter,
            ticket: {
              id: state.ticket.id,
              pollId: state.ticket.pollId,
              ticketHash: state.ticket.ticketHash
            }
          };
        }
      ),
      updateMany: vi.fn(
        async ({
          where,
          data
        }: {
          where: {
            ticketId?: string;
            status?: "ACTIVE";
            optionLetter?: OptionLetter;
          };
          data: {
            status: "USED" | "EXPIRED";
          };
        }) => {
          if (
            where.ticketId &&
            where.ticketId !== state.ticket.id
          ) {
            return { count: 0 };
          }

          if (where.status && state.request.status !== where.status) {
            return { count: 0 };
          }

          if (where.optionLetter && state.request.optionLetter !== where.optionLetter) {
            return { count: 0 };
          }

          state.request.status = data.status;
          return { count: 1 };
        }
      )
    },
    voteReceipt: {
      create: vi.fn(
        async ({
          data
        }: {
          data: {
            pollId: string;
            ticketHash: string;
            receiptPublicId: string | null;
            optionLetter: OptionLetter;
            txid: string;
            blockHeight: number | null;
            amountZat: bigint;
            memo: string;
            status: ReceiptStatus;
            rejectionReason: string | null;
            confirmedAt: Date | null;
          };
        }) => {
          const duplicate = state.receipts.some(
            (receipt) =>
              receipt.txid === data.txid && receipt.ticketHash === data.ticketHash
          );

          if (duplicate) {
            throw Object.assign(new Error("unique constraint"), { code: "P2002" });
          }

          state.receipts.push({ ...data });
          return data;
        }
      )
    },
    pollTally: {
      upsert: vi.fn(async ({ update, create }: { update: unknown; create: Exclude<TestState["tally"], null> }) => {
        if (!state.tally) {
          state.tally = { ...create };
          return state.tally;
        }

        const updateData = update as {
          totalConfirmed?: { increment: number };
          countA?: { increment: number };
          countB?: { increment: number };
          countC?: { increment: number };
          countD?: { increment: number };
          countE?: { increment: number };
        };

        state.tally.totalConfirmed += updateData.totalConfirmed?.increment ?? 0;
        state.tally.countA += updateData.countA?.increment ?? 0;
        state.tally.countB += updateData.countB?.increment ?? 0;
        state.tally.countC += updateData.countC?.increment ?? 0;
        state.tally.countD += updateData.countD?.increment ?? 0;
        state.tally.countE += updateData.countE?.increment ?? 0;

        return state.tally;
      })
    },
    publicAuditEvent: {
      create: vi.fn(async ({ data }: { data: unknown }) => data)
    },
    ...(includeTransaction
      ? {
          $transaction: vi.fn(async (callback: (tx: ReturnType<typeof makeDbApi>) => Promise<unknown>) => {
            const snapshot = structuredClone(state);
            const tx = makeDbApi(snapshot, false);
            const result = await callback(tx);
            Object.assign(state, snapshot);
            return result;
          })
        }
      : {})
  };
}

function assignDb(state: TestState) {
  Object.assign(dbMock, makeDbApi(state));
}

function makeRequest(secret: string | null) {
  return new Request("http://localhost/api/internal", {
    method: "POST",
    headers: secret
      ? {
          "x-zcap-internal-secret": secret
        }
      : undefined
  });
}

function makeIncomingVote(overrides?: Partial<IncomingVoteNote>): IncomingVoteNote {
  return {
    shieldedAddress: "utest1examplea",
    txid: "txid_1",
    amountZat: 10000n,
    memo: "A",
    blockHeight: 123,
    ...overrides
  };
}

beforeEach(() => {
  process.env.ZCAP_INTERNAL_SECRET = TEST_INTERNAL_SECRET;
  fetchIncomingVotesMock.mockReset();
  syncWalletMock.mockReset();
  deliverConfirmedVoteReceiptsForPollMock.mockReset();
  deliverConfirmedVoteReceiptsForPollMock.mockResolvedValue({
    sent: 0,
    skipped: 0,
    failed: 0
  });
  for (const key of Object.keys(dbMock)) {
    delete (dbMock as Record<string, unknown>)[key];
  }
});

describe("internal mutation routes", () => {
  it.each(["CLOSED", "EXPIRED_OPEN"])("preserves an uncollected vote when %s awaits cutoff proof", async (mode) => {
    const state = makeState({ poll: { status: mode === "CLOSED" ? "CLOSED" : "OPEN",
      closesAt: new Date("2026-01-01T00:00:00Z") } });
    assignDb(state);
    fetchIncomingVotesMock.mockResolvedValue([makeIncomingVote()]);
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await reconcilePollVotes(makeRequest(TEST_INTERNAL_SECRET), { params: Promise.resolve({ pollId: "poll_1" }) } as never);
      await expect(response.json()).resolves.toEqual({ processed: 0, tallyPending: true });
    }
    expect(fetchIncomingVotesMock).not.toHaveBeenCalled();
    expect(state.receipts).toEqual([]);
    expect(state.request.status).toBe("ACTIVE");
    expect(state.ticket.status).toBe("ISSUED");
    expect(state.tally).toBeNull();
  });

  it("rechecks a close that happens while the wallet response is in flight", async () => {
    const state = makeState();
    assignDb(state);
    fetchIncomingVotesMock.mockImplementation(async () => {
      state.poll.status = "CLOSED";
      return [makeIncomingVote()];
    });
    const response = await reconcilePollVotes(makeRequest(TEST_INTERNAL_SECRET), { params: Promise.resolve({ pollId: "poll_1" }) } as never);
    await expect(response.json()).resolves.toEqual({ processed: 0, tallyPending: true });
    expect(state.receipts).toEqual([]);
    expect(state.ticket.status).toBe("ISSUED");
    expect(state.request.status).toBe("ACTIVE");
    expect(state.tally).toBeNull();
  });

  it("does not collect unassigned legacy polls", async () => {
    const state = makeState({ poll: { communityId: null } });
    assignDb(state);
    const response = await reconcilePollVotes(makeRequest(TEST_INTERNAL_SECRET), { params: Promise.resolve({ pollId: "poll_1" }) } as never);
    expect(response.status).toBe(404);
    expect(fetchIncomingVotesMock).not.toHaveBeenCalled();
  });

  it("rejects wallet sync without the internal secret", async () => {
    const response = await syncWallet(makeRequest(null));

    expect(response.status).toBe(403);
    expect(syncWalletMock).not.toHaveBeenCalled();
  });

  it("rejects reconcile with the wrong internal secret", async () => {
    const state = makeState();
    assignDb(state);

    const response = await reconcilePollVotes(makeRequest("wrong-secret"), {
      params: Promise.resolve({ pollId: "poll_1" })
    } as never);

    expect(response.status).toBe(403);
    expect(fetchIncomingVotesMock).not.toHaveBeenCalled();
  });

  it("skips notes for a different poll and keeps tally stable", async () => {
    const state = makeState({
      poll: {
        id: "poll_1",
        status: "OPEN",
        feeZat: 10000n
      },
      ticket: {
        id: "ticket_2",
        pollId: "poll_2",
        ticketHash: "ticket_hash_2",
        status: "ISSUED",
        lockedOptionLetter: null,
        lockedRequestId: null,
        lockedAt: null
      },
      request: {
        id: "request_other",
        shieldedAddress: "utest1other",
        optionLetter: "B",
        status: "ACTIVE"
      }
    });
    assignDb(state);

    fetchIncomingVotesMock.mockResolvedValue([
      makeIncomingVote({
        shieldedAddress: "utest1other",
        memo: "B",
        txid: "txid_other"
      })
    ]);

    const response = await reconcilePollVotes(makeRequest(TEST_INTERNAL_SECRET), {
      params: Promise.resolve({ pollId: "poll_1" })
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ processed: 0 });
    expect(state.receipts).toHaveLength(0);
    expect(state.tally).toBeNull();
    expect(deliverConfirmedVoteReceiptsForPollMock).toHaveBeenCalledWith("poll_1");
  });

  it("confirms the first vote, records later attempts as duplicate ignored, and stays idempotent on replay", async () => {
    const state = makeState();
    assignDb(state);

    fetchIncomingVotesMock.mockResolvedValueOnce([
      makeIncomingVote({
        txid: "txid_1",
        memo: "A"
      })
    ]);

    const firstResponse = await reconcilePollVotes(
      makeRequest(TEST_INTERNAL_SECRET),
      {
        params: Promise.resolve({ pollId: "poll_1" })
      } as never
    );

    expect(firstResponse.status).toBe(200);
    await expect(firstResponse.json()).resolves.toEqual({ processed: 1 });
    expect(state.ticket.status).toBe("VOTED");
    expect(state.request.status).toBe("USED");
    expect(state.tally).toEqual({
      pollId: "poll_1",
      countA: 1,
      countB: 0,
      countC: 0,
      countD: 0,
      countE: 0,
      totalConfirmed: 1
    });
    expect(state.receipts[0]?.receiptPublicId).toMatch(/^receipt_/);
    expect(state.receipts.map((receipt) => receipt.status)).toEqual(["CONFIRMED"]);
    expect(deliverConfirmedVoteReceiptsForPollMock).toHaveBeenCalledWith("poll_1");

    fetchIncomingVotesMock.mockResolvedValueOnce([
      makeIncomingVote({
        txid: "txid_2",
        memo: "A"
      })
    ]);

    const secondResponse = await reconcilePollVotes(
      makeRequest(TEST_INTERNAL_SECRET),
      {
        params: Promise.resolve({ pollId: "poll_1" })
      } as never
    );

    expect(secondResponse.status).toBe(200);
    await expect(secondResponse.json()).resolves.toEqual({ processed: 1 });
    expect(state.tally).toEqual({
      pollId: "poll_1",
      countA: 1,
      countB: 0,
      countC: 0,
      countD: 0,
      countE: 0,
      totalConfirmed: 1
    });
    expect(state.receipts.map((receipt) => receipt.status)).toEqual([
      "CONFIRMED",
      "DUPLICATE_IGNORED"
    ]);
    expect(state.receipts[1]?.receiptPublicId).toBeNull();

    fetchIncomingVotesMock.mockResolvedValueOnce([
      makeIncomingVote({
        txid: "txid_1",
        memo: "A"
      })
    ]);

    const thirdResponse = await reconcilePollVotes(
      makeRequest(TEST_INTERNAL_SECRET),
      {
        params: Promise.resolve({ pollId: "poll_1" })
      } as never
    );

    expect(thirdResponse.status).toBe(200);
    await expect(thirdResponse.json()).resolves.toEqual({ processed: 0 });
    expect(state.tally).toEqual({
      pollId: "poll_1",
      countA: 1,
      countB: 0,
      countC: 0,
      countD: 0,
      countE: 0,
      totalConfirmed: 1
    });
    expect(state.receipts.map((receipt) => receipt.status)).toEqual([
      "CONFIRMED",
      "DUPLICATE_IGNORED"
    ]);
  });

  it("confirms a locked ticket and assigns a voter-facing receipt id", async () => {
    const state = makeState({
      ticket: {
        id: "ticket_locked",
        pollId: "poll_1",
        ticketHash: "ticket_hash_locked",
        status: "LOCKED",
        lockedOptionLetter: "B",
        lockedRequestId: "request_locked",
        lockedAt: new Date("2026-04-21T02:30:00.000Z")
      },
      request: {
        id: "request_locked",
        shieldedAddress: "utest1exampleb",
        optionLetter: "B",
        status: "ACTIVE"
      }
    });
    assignDb(state);

    fetchIncomingVotesMock.mockResolvedValueOnce([
      makeIncomingVote({
        shieldedAddress: "utest1exampleb",
        txid: "txid_locked",
        memo: "B"
      })
    ]);

    const response = await reconcilePollVotes(makeRequest(TEST_INTERNAL_SECRET), {
      params: Promise.resolve({ pollId: "poll_1" })
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ processed: 1 });
    expect(state.ticket.status).toBe("VOTED");
    expect(state.receipts[0]).toMatchObject({
      optionLetter: "B",
      txid: "txid_locked",
      status: "CONFIRMED"
    });
    expect(state.receipts[0]?.receiptPublicId).toMatch(/^receipt_/);
    expect(deliverConfirmedVoteReceiptsForPollMock).toHaveBeenCalledWith("poll_1");
  });
});
