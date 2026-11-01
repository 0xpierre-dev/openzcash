import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { manageableCommunityWhere } from "@/lib/services/communities";

export function pollManagementWhere(userId: string): Prisma.PollWhereInput {
  return { community: { is: manageableCommunityWhere(userId) } };
}

export async function creatorOwnsPoll(pollId: string, userId: string) {
  const poll = await db.poll.findFirst({
    where: {
      id: pollId,
      ...pollManagementWhere(userId)
    },
    select: {
      id: true
    }
  });

  return Boolean(poll);
}

export async function findOwnedPoll<T extends Prisma.PollSelect>(
  pollId: string,
  userId: string,
  select: T
) {
  return db.poll.findFirst({
    where: {
      id: pollId,
      ...pollManagementWhere(userId)
    },
    select
  }) as Promise<Prisma.PollGetPayload<{ select: T }> | null>;
}
