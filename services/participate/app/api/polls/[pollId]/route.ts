import { NextResponse, type NextRequest } from "next/server";
import { pollManagementWhere } from "@/lib/auth/poll-ownership";
import { readSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getActiveOptionLetters, getPollOptionLabelMap } from "@/lib/domain/options";
import { UNPUBLISHED_POLL_STATUSES } from "@/lib/domain/polls";

function formatZatToZec(value: bigint) {
  const digits = value.toString().padStart(9, "0");
  const whole = digits.slice(0, -8) || "0";
  const fraction = digits.slice(-8).replace(/0+$/g, "");

  return fraction ? `${whole}.${fraction}` : whole;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ pollId: string }> }
) {
  const session = await readSession();

  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { pollId } = await context.params;
  const where = {
    id: pollId,
    communityId: { not: null },
    ...(session.subjectType === "poll_voter_access"
      ? {
          status: { notIn: UNPUBLISHED_POLL_STATUSES },
          voterAccesses: {
            some: {
              id: session.pollVoterAccessId,
              status: "ACTIVE" as const,
              expiresAt: { gt: new Date() }
            }
          }
        }
      : {
          OR: [
            pollManagementWhere(session.userId),
            {
              status: { notIn: UNPUBLISHED_POLL_STATUSES },
              eligibility: { some: { userId: session.userId } }
            }
          ]
        })
  };

  const poll = await db.poll.findFirst({
    where,
    select: {
      id: true,
      communityId: true,
      question: true,
      optionALabel: true,
      optionBLabel: true,
      optionCLabel: true,
      optionDLabel: true,
      optionELabel: true,
      status: true,
      voteModel: true,
      quorumPercent: true,
      passingThresholdPercent: true,
      feeZat: true,
      opensAt: true,
      closesAt: true
    }
  });

  if (!poll) {
    return NextResponse.json({ poll: null }, { status: 404 });
  }

  return NextResponse.json({
    poll: {
      id: poll.id,
      communityId: poll.communityId,
      question: poll.question,
      activeOptions: getActiveOptionLetters(poll),
      optionLabels: getPollOptionLabelMap(poll),
      status: poll.status,
      governance: {
        voteModel: poll.voteModel,
        quorumPercent: poll.quorumPercent,
        passingThresholdPercent: poll.passingThresholdPercent
      },
      feeZec: formatZatToZec(poll.feeZat),
      opensAt: poll.opensAt.toISOString(),
      closesAt: poll.closesAt.toISOString()
    }
  });
}
