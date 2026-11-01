import {
  CommunityMembershipRole,
  CommunityMembershipStatus,
  Prisma,
  UserStatus
} from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";

export class CommunityServiceError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 409,
    public readonly code: string
  ) {
    super(message);
    this.name = "CommunityServiceError";
  }
}

const communitySelection = { id: true, name: true, slug: true } as const;

export const createCommunityInputSchema = z.object({
  name: z.string().trim().min(3).max(100),
  slug: z.string().trim().min(3).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
}).strict();

export function manageableCommunityWhere(userId: string): Prisma.CommunityWhereInput {
  if (!userId?.trim()) {
    return { id: { in: [] } };
  }

  return {
    kind: "DAO",
    memberships: {
      some: {
        userId,
        role: { in: [CommunityMembershipRole.OWNER, CommunityMembershipRole.MANAGER] },
        status: CommunityMembershipStatus.ACTIVE,
        user: { status: UserStatus.ACTIVE }
      }
    }
  };
}

export async function readManagedCommunities(userId: string) {
  return db.community.findMany({
    where: manageableCommunityWhere(userId),
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: communitySelection
  });
}

export async function findManagedCommunity(communityId: string, userId: string) {
  if (!communityId?.trim() || !userId?.trim()) {
    return null;
  }

  return db.community.findFirst({
    where: { id: communityId, ...manageableCommunityWhere(userId) },
    select: communitySelection
  });
}

export async function createCommunity(
  input: z.input<typeof createCommunityInputSchema>,
  userId: string
) {
  const result = createCommunityInputSchema.safeParse(input);

  if (!result.success) {
    throw new CommunityServiceError(
      "Enter a community name and a lowercase slug containing letters, numbers, and hyphens",
      400,
      "INVALID_COMMUNITY_INPUT"
    );
  }

  if (!userId?.trim()) {
    throw new CommunityServiceError("Active user not found", 404, "ACTIVE_USER_NOT_FOUND");
  }

  try {
    return await db.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: userId, status: UserStatus.ACTIVE },
        select: { id: true }
      });

      if (!user) {
        throw new CommunityServiceError("Active user not found", 404, "ACTIVE_USER_NOT_FOUND");
      }

      return tx.community.create({
        data: {
          ...result.data,
          createdById: user.id,
          memberships: {
            create: {
              userId: user.id,
              role: CommunityMembershipRole.OWNER,
              status: CommunityMembershipStatus.ACTIVE
            }
          }
        },
        select: communitySelection
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new CommunityServiceError("Community slug is already in use", 409, "COMMUNITY_SLUG_TAKEN");
    }
    throw error;
  }
}
