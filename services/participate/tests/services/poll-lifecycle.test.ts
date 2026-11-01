import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, applyMembershipAction } = vi.hoisted(() => ({
  dbMock: {} as Record<string, unknown>,
  applyMembershipAction: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  db: dbMock
}));

vi.mock("@/lib/services/dao-members", () => ({
  applyDaoMembershipActionForPoll: applyMembershipAction
}));

import {
  syncAllPollLifecycles,
  syncPollLifecycleForPoll
} from "@/lib/services/poll-lifecycle";

type PollStatus = "SCHEDULED" | "OPEN" | "CLOSED";
type TicketStatus = "ISSUED" | "EXPIRED";
type VoteRequestStatus = "ACTIVE" | "EXPIRED";

function makeState(status: PollStatus, opensAt: Date, closesAt: Date) {
  return {
    poll: {
      id: "poll_1",
      communityId: "community_1" as string | null,
      status,
      opensAt,
      closesAt
    },
    ticketStatus: "ISSUED" as TicketStatus,
    requestStatus: "ACTIVE" as VoteRequestStatus
  };
}

function assignDb(state: ReturnType<typeof makeState>, openPollIds?: string[]) {
  Object.assign(dbMock, {
    poll: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === state.poll.id ? { ...state.poll } : null
      ),
      findMany: vi.fn(async () =>
        (openPollIds ?? [state.poll.id]).map((id) => ({ id }))
      ),
      updateMany: vi.fn(
        async ({
          where,
          data
        }: {
          where: { id: string; status: PollStatus; opensAt: Date; closesAt: Date };
          data: { status: PollStatus };
        }) => {
          if (where.id !== state.poll.id) {
            throw new Error("unexpected poll id");
          }

          if (where.status !== state.poll.status || +where.opensAt !== +state.poll.opensAt || +where.closesAt !== +state.poll.closesAt) return { count: 0 };
          state.poll.status = data.status;
          return { count: 1 };
        }
      )
    },
    voteTicket: {
      updateMany: vi.fn(
        async ({
          data
        }: {
          data: {
            status: TicketStatus;
          };
        }) => {
          state.ticketStatus = data.status;
          return { count: 1 };
        }
      )
    },
    voteRequest: {
      updateMany: vi.fn(
        async ({
          data
        }: {
          data: {
            status: VoteRequestStatus;
          };
        }) => {
          state.requestStatus = data.status;
          return { count: 1 };
        }
      )
    },
    $transaction: vi.fn(async (callback: (tx: typeof dbMock) => Promise<unknown>) =>
      callback(dbMock as typeof dbMock)
    )
  });
}

beforeEach(() => {
  applyMembershipAction.mockReset();
  for (const key of Object.keys(dbMock)) {
    delete (dbMock as Record<string, unknown>)[key];
  }
});

describe("poll lifecycle service", () => {
  it("leaves unassigned legacy polls, tickets and requests unchanged", async () => {
    const state = makeState("OPEN", new Date("2026-04-20T09:00:00.000Z"), new Date("2026-04-20T10:00:00.000Z"));
    state.poll.communityId = null;
    assignDb(state);

    await expect(syncPollLifecycleForPoll("poll_1", new Date("2026-04-20T12:00:00.000Z"))).resolves.toBeNull();
    expect(state.poll.status).toBe("OPEN");
    expect(state.ticketStatus).toBe("ISSUED");
    expect(state.requestStatus).toBe("ACTIVE");
    expect(dbMock.$transaction).not.toHaveBeenCalled();
    expect(applyMembershipAction).not.toHaveBeenCalled();
  });

  it("processes assigned polls while excluding legacy polls from the bulk cycle", async () => {
    const assigned = makeState("OPEN", new Date("2026-04-20T09:00:00.000Z"), new Date("2026-04-20T10:00:00.000Z"));
    const legacy = makeState("OPEN", assigned.poll.opensAt, assigned.poll.closesAt);
    legacy.poll.id = "legacy_poll";
    legacy.poll.communityId = null;
    assignDb(assigned);
    const pollMock = dbMock.poll as {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
    };
    pollMock.findMany.mockImplementation(async ({ where }) =>
      [legacy.poll, assigned.poll]
        .filter((poll) => where.communityId.not === null && poll.communityId !== null)
        .map(({ id }) => ({ id }))
    );
    pollMock.findUnique.mockImplementation(async ({ where }) =>
      [legacy.poll, assigned.poll].find((poll) => poll.id === where.id) ?? null
    );

    await expect(syncAllPollLifecycles(new Date("2026-04-20T12:00:00.000Z")))
      .resolves.toMatchObject({ processed: 1, opened: 0, closed: 1 });
    expect(pollMock.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { communityId: { not: null }, status: { in: ["SCHEDULED", "OPEN"] } }
    }));
    expect(legacy.poll.status).toBe("OPEN");
    expect(legacy.ticketStatus).toBe("ISSUED");
    expect(applyMembershipAction).not.toHaveBeenCalled();
  });

  it("opens scheduled polls when the open time has passed", async () => {
    const state = makeState(
      "SCHEDULED",
      new Date("2026-04-20T09:00:00.000Z"),
      new Date("2026-04-20T11:00:00.000Z")
    );
    assignDb(state);

    const result = await syncPollLifecycleForPoll(
      "poll_1",
      new Date("2026-04-20T10:00:00.000Z")
    );

    expect(result).toMatchObject({
      pollId: "poll_1",
      previousStatus: "SCHEDULED",
      status: "OPEN",
      transition: "SCHEDULED_TO_OPEN"
    });
    expect(state.poll.status).toBe("OPEN");
  });

  it("closes while preserving uncollected tickets and requests without applying membership", async () => {
    const state = makeState(
      "OPEN",
      new Date("2026-04-20T09:00:00.000Z"),
      new Date("2026-04-20T10:00:00.000Z")
    );
    assignDb(state);

    const result = await syncPollLifecycleForPoll(
      "poll_1",
      new Date("2026-04-20T12:00:00.000Z")
    );

    expect(result).toMatchObject({
      pollId: "poll_1",
      previousStatus: "OPEN",
      status: "CLOSED",
      transition: "OPEN_TO_CLOSED"
    });
    expect(state.poll.status).toBe("CLOSED");
    expect(state.ticketStatus).toBe("ISSUED");
    expect(state.requestStatus).toBe("ACTIVE");
    expect(applyMembershipAction).not.toHaveBeenCalled();
  });

  it("reports one transition across concurrent closing retries", async () => {
    const state = makeState("OPEN", new Date("2026-04-20T09:00:00Z"), new Date("2026-04-20T10:00:00Z"));
    assignDb(state);
    const results = await Promise.all(Array.from({ length: 5 }, () => syncPollLifecycleForPoll("poll_1", new Date("2026-04-20T12:00:00Z"))));
    expect(results.filter(result => result?.transition === "OPEN_TO_CLOSED")).toHaveLength(1);
    expect(results.every(result => result?.status === "CLOSED")).toBe(true);
    expect(state.requestStatus).toBe("ACTIVE");
    expect(applyMembershipAction).not.toHaveBeenCalled();
  });

  it("does not let a stale opener overwrite a concurrent close", async () => {
    const state = makeState("SCHEDULED", new Date("2026-04-20T09:00:00Z"), new Date("2026-04-20T10:00:00Z"));
    assignDb(state);
    const pollMock = dbMock.poll as { updateMany: ReturnType<typeof vi.fn> };
    pollMock.updateMany.mockImplementationOnce(async () => {
      state.poll.status = "CLOSED";
      return { count: 0 };
    });
    await expect(syncPollLifecycleForPoll("poll_1", new Date("2026-04-20T09:30:00Z")))
      .resolves.toMatchObject({ status: "CLOSED", transition: "NONE" });
    expect(state.poll.status).toBe("CLOSED");
  });

  it("summarizes bulk lifecycle sync counts", async () => {
    const state = makeState(
      "SCHEDULED",
      new Date("2026-04-20T09:00:00.000Z"),
      new Date("2026-04-20T11:00:00.000Z")
    );
    assignDb(state);

    const result = await syncAllPollLifecycles(
      new Date("2026-04-20T10:00:00.000Z")
    );

    expect(result.processed).toBe(1);
    expect(result.opened).toBe(1);
    expect(result.closed).toBe(0);
  });
});
