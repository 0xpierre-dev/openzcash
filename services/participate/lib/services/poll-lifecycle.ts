import { PollStatus } from "@prisma/client";
import { db } from "@/lib/db";

export type PollLifecycleTransition =
  | "NONE"
  | "SCHEDULED_TO_OPEN"
  | "SCHEDULED_TO_CLOSED"
  | "OPEN_TO_CLOSED";

export async function syncPollLifecycleForPoll(
  pollId: string,
  now = new Date()
) {
  const poll = await db.poll.findUnique({
    where: { id: pollId },
    select: {
      id: true,
      communityId: true,
      status: true,
      opensAt: true,
      closesAt: true
    }
  });

  // Preserved legacy polls require explicit community mapping before any operational update.
  if (!poll?.communityId) {
    return null;
  }

  let nextStatus = poll.status;
  let transition: PollLifecycleTransition = "NONE";

  if (
    poll.status === PollStatus.SCHEDULED &&
    poll.closesAt.getTime() <= now.getTime()
  ) {
    nextStatus = PollStatus.CLOSED;
    transition = "SCHEDULED_TO_CLOSED";
  } else if (
    poll.status === PollStatus.SCHEDULED &&
    poll.opensAt.getTime() <= now.getTime()
  ) {
    nextStatus = PollStatus.OPEN;
    transition = "SCHEDULED_TO_OPEN";
  } else if (
    poll.status === PollStatus.OPEN &&
    poll.closesAt.getTime() <= now.getTime()
  ) {
    nextStatus = PollStatus.CLOSED;
    transition = "OPEN_TO_CLOSED";
  }

  if (nextStatus === poll.status) {
    return {
      pollId: poll.id,
      previousStatus: poll.status,
      status: poll.status,
      transition
    };
  }

  // Closing the UI window is not evidence that the collector has finished.
  // Preserve requests/tickets for cutoff-aware collection; execute no decision.
  // Compare the status and dates read above so a stale worker cannot reopen a
  // closed poll or overwrite another lifecycle transition.
  const changed = await db.poll.updateMany({
    where: {
      id: poll.id,
      communityId: poll.communityId,
      status: poll.status,
      opensAt: poll.opensAt,
      closesAt: poll.closesAt
    },
    data: { status: nextStatus }
  });

  if (changed.count !== 1) {
    const current = await db.poll.findUnique({ where: { id: poll.id }, select: { status: true } });
    return current ? {
      pollId: poll.id, previousStatus: poll.status, status: current.status,
      transition: "NONE" as const
    } : null;
  }

  return {
    pollId: poll.id,
    previousStatus: poll.status,
    status: nextStatus,
    transition
  };
}

export async function syncAllPollLifecycles(now = new Date()) {
  const polls = await db.poll.findMany({
    where: {
      communityId: { not: null },
      status: {
        in: [PollStatus.SCHEDULED, PollStatus.OPEN]
      }
    },
    select: {
      id: true
    }
  });

  let opened = 0;
  let closed = 0;
  const results = [];

  for (const poll of polls) {
    const result = await syncPollLifecycleForPoll(poll.id, now);

    if (!result) {
      continue;
    }

    if (result.transition === "SCHEDULED_TO_OPEN") {
      opened += 1;
    }

    if (
      result.transition === "SCHEDULED_TO_CLOSED" ||
      result.transition === "OPEN_TO_CLOSED"
    ) {
      closed += 1;
    }

    results.push(result);
  }

  return {
    processed: results.length,
    opened,
    closed,
    results
  };
}
