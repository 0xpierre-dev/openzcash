import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { TreasuryKindValue } from "@/lib/domain/treasury";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction } }));

import {
  allocateTreasuryFunds,
  readCommunityTreasuries,
  recordTreasuryFunding
} from "@/lib/services/treasuries";

type Membership = {
  communityId: string; userId: string; role: "OWNER" | "MANAGER";
  status: "ACTIVE" | "DISABLED"; userStatus: "ACTIVE" | "DISABLED"; nick: string;
};
type Fund = {
  id: string; communityId: string; kind: TreasuryKindValue;
  availableZat: bigint; reservedZat: bigint; committedZat: bigint; paidZat: bigint;
};
type Operation = {
  id: string; communityId: string; kind: "FUNDING" | "ALLOCATION";
  sourceTreasuryId?: string; destinationTreasuryId: string; amountZat: bigint;
  fundingSource?: string; reason: string; actorUserId: string; actorLabel: string;
  idempotencyKey: string; payloadHash: string; createdAt: Date;
};
type Entry = { communityId: string; treasuryId: string; operationId: string; deltaZat: bigint };
let state: { memberships: Membership[]; funds: Fund[]; operations: Operation[]; entries: Entry[]; nextId: number };
let pendingTransaction: Promise<void>;

// Transactional in-memory double: writes roll back on failure, serializable calls
// contend for the same state, and conditional balance updates enforce their predicates.
const tx = {
  communityMembership: { findFirst: vi.fn(async ({ where }: { where: { communityId: string; userId: string; status: string; user: { status: string } } }) => {
    const found = state.memberships.find((member) => member.communityId === where.communityId &&
      member.userId === where.userId && member.status === where.status && member.userStatus === where.user.status);
    return found ? { role: found.role, user: { nick: found.nick } } : null;
  }) },
  communityTreasury: {
    findMany: vi.fn(async ({ where }: { where: { communityId: string } }) => state.funds
      .filter((fund) => fund.communityId === where.communityId)
      .map((fund) => ({ ...fund, _count: { entries: state.entries.filter((entry) => entry.treasuryId === fund.id).length } }))),
    upsert: vi.fn(async ({ where }: { where: { communityId_kind: { communityId: string; kind: TreasuryKindValue } } }) => {
      const scope = where.communityId_kind;
      let fund = state.funds.find((entry) => entry.communityId === scope.communityId && entry.kind === scope.kind);
      if (!fund) {
        fund = { id: `fund_${++state.nextId}`, ...scope, availableZat: 0n, reservedZat: 0n, committedZat: 0n, paidZat: 0n };
        state.funds.push(fund);
      }
      return { id: fund.id };
    }),
    updateMany: vi.fn(async ({ where, data }: {
      where: { id: string; communityId: string; availableZat: { gte?: bigint; lte?: bigint } };
      data: { availableZat: { increment?: bigint; decrement?: bigint } };
    }) => {
      const fund = state.funds.find((entry) => entry.id === where.id && entry.communityId === where.communityId);
      if (!fund || (where.availableZat.gte !== undefined && fund.availableZat < where.availableZat.gte) ||
        (where.availableZat.lte !== undefined && fund.availableZat > where.availableZat.lte)) return { count: 0 };
      fund.availableZat += (data.availableZat.increment ?? 0n) - (data.availableZat.decrement ?? 0n);
      return { count: 1 };
    })
  },
  treasuryOperation: {
    findUnique: vi.fn(async ({ where }: { where: { communityId_idempotencyKey: { communityId: string; idempotencyKey: string } } }) => {
      const scope = where.communityId_idempotencyKey;
      return state.operations.find((entry) => entry.communityId === scope.communityId && entry.idempotencyKey === scope.idempotencyKey) ?? null;
    }),
    create: vi.fn(async ({ data }: { data: Omit<Operation, "id" | "createdAt"> }) => {
      if (state.operations.some((entry) => entry.communityId === data.communityId && entry.idempotencyKey === data.idempotencyKey)) {
        throw new Prisma.PrismaClientKnownRequestError("Duplicate", { code: "P2002", clientVersion: "6.19.3" });
      }
      const operation = { ...data, id: `operation_${++state.nextId}`, createdAt: new Date("2026-10-08T12:00:00Z") };
      state.operations.push(operation);
      return { id: operation.id };
    }),
    findMany: vi.fn(async ({ where }: { where: { communityId: string } }) => state.operations
      .filter((entry) => entry.communityId === where.communityId).slice(-20).reverse()
      .map((entry) => ({
        ...entry,
        fundingSource: entry.fundingSource ?? null,
        sourceTreasury: entry.sourceTreasuryId ? state.funds.find((fund) => fund.id === entry.sourceTreasuryId)! : null,
        destinationTreasury: state.funds.find((fund) => fund.id === entry.destinationTreasuryId)!
      })))
  },
  treasuryLedgerEntry: {
    create: vi.fn(async ({ data }: { data: Entry }) => { state.entries.push(data); return data; }),
    createMany: vi.fn(async ({ data }: { data: Entry[] }) => { state.entries.push(...data); return { count: data.length }; })
  }
};

const key = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const funding = (id = 1, amountZec = "10") => ({ treasuryKind: "COMMUNITY", amountZec, fundingSource: "Community opening funds", reason: "Record approved funding", idempotencyKey: key(id) });
const allocation = (id = 2, amountZec = "3") => ({ fromTreasuryKind: "COMMUNITY", toTreasuryKind: "SUSTAINABILITY", amountZec, reason: "Reserve for recurring costs", idempotencyKey: key(id) });
const available = (kind: TreasuryKindValue, communityId = "community_a") => state.funds.find((fund) => fund.kind === kind && fund.communityId === communityId)?.availableZat ?? 0n;

beforeEach(() => {
  vi.clearAllMocks();
  state = {
    memberships: [
      { communityId: "community_a", userId: "owner_a", role: "OWNER", status: "ACTIVE", userStatus: "ACTIVE", nick: "Alice" },
      { communityId: "community_a", userId: "manager_a", role: "MANAGER", status: "ACTIVE", userStatus: "ACTIVE", nick: "Mary" },
      { communityId: "community_b", userId: "owner_b", role: "OWNER", status: "ACTIVE", userStatus: "ACTIVE", nick: "Bob" }
    ], funds: [], operations: [], entries: [], nextId: 0
  };
  pendingTransaction = Promise.resolve();
  mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => {
    const previous = pendingTransaction;
    let release!: () => void;
    pendingTransaction = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const before = structuredClone(state);
    try { return await callback(tx); } catch (error) { state = before; throw error; } finally { release(); }
  });
});

describe("treasury permissions and recorded views", () => {
  it("returns two honest unconfigured fund cards without creating records on a manager read", async () => {
    const view = await readCommunityTreasuries("community_a", "manager_a");
    expect(view.canManage).toBe(false);
    expect(view.funds.map((fund) => [fund.kind, fund.id, fund.hasEntries, fund.availableZat])).toEqual([
      ["COMMUNITY", null, false, "0"], ["SUSTAINABILITY", null, false, "0"]
    ]);
    expect(tx.communityTreasury.upsert).not.toHaveBeenCalled();
    expect(() => JSON.stringify(view)).not.toThrow();
  });

  it("fails closed for wrong community, missing scope, disabled membership and disabled user", async () => {
    await expect(readCommunityTreasuries("community_b", "owner_a")).rejects.toMatchObject({ code: "COMMUNITY_NOT_FOUND" });
    await expect(readCommunityTreasuries("", "owner_a")).rejects.toMatchObject({ code: "COMMUNITY_NOT_FOUND" });
    state.memberships[0].status = "DISABLED";
    await expect(recordTreasuryFunding("community_a", "owner_a", funding())).rejects.toMatchObject({ code: "COMMUNITY_NOT_FOUND" });
    state.memberships[0].status = "ACTIVE";
    state.memberships[0].userStatus = "DISABLED";
    await expect(allocateTreasuryFunds("community_a", "owner_a", allocation())).rejects.toMatchObject({ code: "COMMUNITY_NOT_FOUND" });
    expect(tx.communityTreasury.findMany).not.toHaveBeenCalled();
    expect(tx.treasuryOperation.create).not.toHaveBeenCalled();
  });

  it("denies manager funding and allocation before initializing or changing funds", async () => {
    await expect(recordTreasuryFunding("community_a", "manager_a", funding())).rejects.toMatchObject({ status: 403, code: "TREASURY_OWNER_REQUIRED" });
    await expect(allocateTreasuryFunds("community_a", "manager_a", allocation())).rejects.toMatchObject({ status: 403, code: "TREASURY_OWNER_REQUIRED" });
    expect(state.funds).toHaveLength(0);
    expect(state.operations).toHaveLength(0);
  });

  it("records exact ZEC funding and frozen source/reason/actor without changing another community", async () => {
    const result = await recordTreasuryFunding("community_a", "owner_a", funding(1, "0.00000001"));
    await recordTreasuryFunding("community_b", "owner_b", funding(1, "7"));
    expect(result.replayed).toBe(false);
    expect(available("COMMUNITY")).toBe(1n);
    expect(available("COMMUNITY", "community_b")).toBe(700_000_000n);
    expect(result.treasuries.recentActivity[0]).toMatchObject({
      kind: "FUNDING", amountZat: "1", fundingSource: "Community opening funds", reason: "Record approved funding", actorLabel: "Alice"
    });
    expect(state.entries[0].deltaZat).toBe(1n);
    expect(result.treasuries.funds[0]).toMatchObject({ hasEntries: true, reservedZat: "0", committedZat: "0", paidZat: "0" });
  });
});

describe("atomic allocations and idempotency", () => {
  it("pairs one debit with one credit, preserving the combined balance and separate accounting buckets", async () => {
    await recordTreasuryFunding("community_a", "owner_a", funding());
    const result = await allocateTreasuryFunds("community_a", "owner_a", allocation());
    expect(result.replayed).toBe(false);
    expect(available("COMMUNITY")).toBe(700_000_000n);
    expect(available("SUSTAINABILITY")).toBe(300_000_000n);
    const entries = state.entries.slice(1);
    expect(entries.map((entry) => entry.deltaZat)).toEqual([-300_000_000n, 300_000_000n]);
    expect(entries[0].operationId).toBe(entries[1].operationId);
    expect(entries.reduce((sum, entry) => sum + entry.deltaZat, 0n)).toBe(0n);
    expect(result.treasuries.recentActivity[0]).toMatchObject({ fromTreasuryKind: "COMMUNITY", toTreasuryKind: "SUSTAINABILITY", fundingSource: null });
    expect(mocks.transaction).toHaveBeenLastCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: "Serializable" }));
  });

  it("replays funding and allocations once using canonical amounts, and rejects a reused key with different intent", async () => {
    await recordTreasuryFunding("community_a", "owner_a", funding());
    expect((await recordTreasuryFunding("community_a", "owner_a", funding(1, "10.0"))).replayed).toBe(true);
    await allocateTreasuryFunds("community_a", "owner_a", allocation());
    expect((await allocateTreasuryFunds("community_a", "owner_a", allocation())).replayed).toBe(true);
    await expect(allocateTreasuryFunds("community_a", "owner_a", allocation(2, "4"))).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(state.operations).toHaveLength(2);
    expect(state.entries).toHaveLength(3);
    expect(available("COMMUNITY")).toBe(700_000_000n);
  });

  it("rolls back an overspend without leaving a failed operation or ledger entries", async () => {
    await recordTreasuryFunding("community_a", "owner_a", funding());
    await expect(allocateTreasuryFunds("community_a", "owner_a", allocation(2, "11"))).rejects.toMatchObject({ code: "INSUFFICIENT_RECORDED_FUNDS" });
    expect(state.operations).toHaveLength(1);
    expect(state.entries).toHaveLength(1);
    expect(available("COMMUNITY")).toBe(1_000_000_000n);
    expect(available("SUSTAINABILITY")).toBe(0n);
  });

  it("cannot draw reserved or committed amounts through an available-funds allocation", async () => {
    await recordTreasuryFunding("community_a", "owner_a", funding(1, "2"));
    const fund = state.funds.find((entry) => entry.kind === "COMMUNITY")!;
    fund.reservedZat = 800_000_000n;
    fund.committedZat = 1_000_000_000n;
    await expect(allocateTreasuryFunds("community_a", "owner_a", allocation(2, "3"))).rejects.toMatchObject({ code: "INSUFFICIENT_RECORDED_FUNDS" });
    expect(available("COMMUNITY")).toBe(200_000_000n);
    expect(state.funds.find((entry) => entry.kind === "COMMUNITY")!.reservedZat).toBe(800_000_000n);
  });

  it("concurrent allocations cannot both consume the same funds", async () => {
    await recordTreasuryFunding("community_a", "owner_a", funding());
    const results = await Promise.allSettled([
      allocateTreasuryFunds("community_a", "owner_a", allocation(2, "7")),
      allocateTreasuryFunds("community_a", "owner_a", allocation(3, "7"))
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "INSUFFICIENT_RECORDED_FUNDS" } });
    expect(available("COMMUNITY")).toBe(300_000_000n);
    expect(available("SUSTAINABILITY")).toBe(700_000_000n);
    expect(state.entries).toHaveLength(3);
  });

  it("concurrent retries with the same key apply only once", async () => {
    await recordTreasuryFunding("community_a", "owner_a", funding());
    const results = await Promise.all([
      allocateTreasuryFunds("community_a", "owner_a", allocation()),
      allocateTreasuryFunds("community_a", "owner_a", allocation())
    ]);
    expect(results.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect(available("SUSTAINABILITY")).toBe(300_000_000n);
    expect(state.entries).toHaveLength(3);
  });

  it("retries serialization failures using the same request and never retries validation or permission failures", async () => {
    mocks.transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("Conflict", { code: "P2034", clientVersion: "6.19.3" }));
    await recordTreasuryFunding("community_a", "owner_a", funding());
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    await expect(recordTreasuryFunding("community_a", "owner_a", { ...funding(), amountZec: 10 })).rejects.toMatchObject({ code: "INVALID_TREASURY_INPUT" });
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(state.operations).toHaveLength(1);
  });

  it("rejects repeated transaction conflicts and rolls back destination overflow", async () => {
    await recordTreasuryFunding("community_a", "owner_a", funding(1, "21000000"));
    await expect(recordTreasuryFunding("community_a", "owner_a", funding(2, "0.00000001"))).rejects.toMatchObject({ code: "TREASURY_BALANCE_LIMIT" });
    expect(state.operations).toHaveLength(1);
    mocks.transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Conflict", { code: "P2034", clientVersion: "6.19.3" }));
    await expect(allocateTreasuryFunds("community_a", "owner_a", allocation())).rejects.toMatchObject({ code: "RETRY_REQUIRED" });
    expect(state.operations).toHaveLength(1);
  });
});
