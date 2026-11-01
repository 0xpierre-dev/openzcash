import { NextResponse, type NextRequest } from "next/server";
import { readSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { UNPUBLISHED_POLL_STATUSES } from "@/lib/domain/polls";
import { scheduleAutoPollReconcile } from "@/lib/services/poll-auto-reconcile";
const receiptRecencyOrderBy = [{ id: "desc" as const }];

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ pollId: string }> }
) {
  const session = await readSession();

  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { pollId } = await context.params;
  const assignment = await db.ticketAssignment.findFirst({
    where: {
      pollId,
      poll: {
        communityId: { not: null },
        status: { notIn: UNPUBLISHED_POLL_STATUSES }
      },
      ...(session.subjectType === "poll_voter_access"
        ? { pollVoterAccessId: session.pollVoterAccessId }
        : { userId: session.userId })
    },
    include: {
      ticket: true
    }
  });

  const latestReceipt = assignment
    ? await db.voteReceipt.findFirst({
        where: {
          pollId,
          ticketHash: assignment.ticket.ticketHash
        },
        orderBy: receiptRecencyOrderBy,
        select: {
          status: true
        }
      })
    : null;

  if (
    assignment?.ticket.status === "ISSUED" ||
    assignment?.ticket.status === "LOCKED"
  ) {
    scheduleAutoPollReconcile(pollId);
  }

  return NextResponse.json({
    ticketStatus: assignment?.ticket.status ?? null,
    latestReceiptStatus: latestReceipt?.status ?? null
  });
}
