import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { communityFindFirst, communityFindMany, communityCreate, userFindFirst, transaction } = vi.hoisted(() => ({
  communityFindFirst: vi.fn(),
  communityFindMany: vi.fn(),
  communityCreate: vi.fn(),
  userFindFirst: vi.fn(),
  transaction: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  db: {
    community: { findFirst: communityFindFirst, findMany: communityFindMany },
    $transaction: transaction
  }
}));

import {
  createCommunity,
  findManagedCommunity,
  manageableCommunityWhere,
  readManagedCommunities
} from "@/lib/services/communities";

beforeEach(() => {
  vi.resetAllMocks();
  transaction.mockImplementation(async (callback) => callback({
    user: { findFirst: userFindFirst },
    community: { create: communityCreate }
  }));
  userFindFirst.mockResolvedValue({ id: "user_1" });
  communityCreate.mockResolvedValue({ id: "community_1", name: "First Community", slug: "first-community" });
});

describe("community access", () => {
  it("requires an active owner or manager belonging to an active user", async () => {
    const where = {
      kind: "DAO",
      memberships: { some: {
        userId: "user_1",
        role: { in: ["OWNER", "MANAGER"] },
        status: "ACTIVE",
        user: { status: "ACTIVE" }
      } }
    };
    expect(manageableCommunityWhere("user_1")).toEqual(where);
    await readManagedCommunities("user_1");
    expect(communityFindMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    await findManagedCommunity("community_1", "user_1");
    expect(communityFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "community_1", ...where }
    }));
  });

  it("fails closed for missing identity or community scope", async () => {
    expect(manageableCommunityWhere("  ")).toEqual({ id: { in: [] } });
    await expect(findManagedCommunity("", "user_1")).resolves.toBeNull();
    await expect(findManagedCommunity("community_1", "")).resolves.toBeNull();
    expect(communityFindFirst).not.toHaveBeenCalled();
  });

  it("does not grant another community access based on a global user role", async () => {
    communityFindFirst.mockImplementation(async ({ where }) =>
      where.id === "community_1" && where.memberships.some.userId === "user_1"
        ? { id: "community_1", name: "First Community", slug: "first-community" }
        : null
    );
    await expect(findManagedCommunity("community_2", "user_1")).resolves.toBeNull();
    await expect(findManagedCommunity("community_1", "user_2")).resolves.toBeNull();
    await expect(findManagedCommunity("community_1", "user_1")).resolves.toMatchObject({ id: "community_1" });
  });
});

describe("community creation", () => {
  it("creates the community and active owner together for the authenticated active user", async () => {
    await expect(createCommunity({ name: " First Community ", slug: "first-community" }, "user_1"))
      .resolves.toMatchObject({ id: "community_1" });
    expect(transaction).toHaveBeenCalledOnce();
    expect(userFindFirst).toHaveBeenCalledWith({
      where: { id: "user_1", status: "ACTIVE" }, select: { id: true }
    });
    expect(communityCreate).toHaveBeenCalledWith({
      data: {
        name: "First Community",
        slug: "first-community",
        createdById: "user_1",
        memberships: { create: { userId: "user_1", role: "OWNER", status: "ACTIVE" } }
      },
      select: { id: true, name: true, slug: true }
    });
  });

  it("rejects missing or disabled users before creating a community", async () => {
    userFindFirst.mockResolvedValue(null);
    await expect(createCommunity({ name: "First Community", slug: "first-community" }, "user_1"))
      .rejects.toMatchObject({ status: 404, code: "ACTIVE_USER_NOT_FOUND" });
    expect(communityCreate).not.toHaveBeenCalled();
  });

  it("rejects invalid names and slugs before touching the database", async () => {
    await expect(createCommunity({ name: "x", slug: "Invalid slug" }, "user_1"))
      .rejects.toMatchObject({ status: 400, code: "INVALID_COMMUNITY_INPUT" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("reports conflicting slugs without reusing or granting membership in the existing community", async () => {
    communityCreate.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002", clientVersion: "6.19.3", meta: { target: ["slug"] }
    }));
    await expect(createCommunity({ name: "First Community", slug: "first-community" }, "user_1"))
      .rejects.toMatchObject({ status: 409, code: "COMMUNITY_SLUG_TAKEN" });
    expect(communityFindFirst).not.toHaveBeenCalled();
  });
});
