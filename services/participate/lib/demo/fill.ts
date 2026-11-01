import { z } from "zod";
import { db } from "@/lib/db";
import { roundSchema } from "@/lib/decisions/format";
import {
  beginDecisionSignature,
  finishDecisionSignature,
} from "@/lib/services/signed-decisions";
import { seatAssertion } from "./authenticator";
import { DemoError, requireDemoEnvironment } from "./environment";
import { DEMO_SEAT_IDS, isDemoSeat } from "./seats";
import { clearSeatThrottle } from "./throttle";

export const demoOutcome = z.enum(["SPLIT", "APPROVE", "REJECT"]);
export type DemoOutcome = z.infer<typeof demoOutcome>;
type Choice = "APPROVE" | "REJECT";

/** SPLIT leaves the result to the tester: two TEST approvals, two TEST rejections. */
export function seatChoice(outcome: DemoOutcome, seatIndex: number): Choice {
  if (outcome === "SPLIT") return seatIndex < 2 ? "APPROVE" : "REJECT";
  return outcome;
}

export function seatRationale(seatName: string, choice: Choice) {
  const reason =
    choice === "APPROVE"
      ? "approves to show how an approval is counted"
      : "rejects to show how a rejection is counted";
  return `Demo test ballot. ${seatName} ${reason}. Signed automatically in the demo environment; this is not a committee member's vote.`;
}

/**
 * Signs every unsigned TEST seat in the tester's open round, one ballot at a
 * time, through beginDecisionSignature/finishDecisionSignature: the same
 * challenge, WebAuthn verification, counter update and publication as a person.
 */
export async function fillDemoSeats(
  hostId: string,
  recordId: string,
  userId: string,
  outcomeInput: unknown,
  limit = 4,
) {
  await requireDemoEnvironment();
  const outcome = demoOutcome.parse(outcomeInput);
  const archive = await db.proposalArchive.findUnique({
    where: { communityId_recordId: { communityId: hostId, recordId } },
    include: {
      revisions: {
        orderBy: { revision: "desc" },
        take: 1,
        include: {
          decision: {
            include: {
              voters: { include: { ballot: { select: { id: true } } } },
            },
          },
        },
      },
    },
  });
  const round = archive?.revisions[0]?.decision;
  if (!round) throw new DemoError("DEMO_ROUND_REQUIRED", 409);
  if (!round.voters.some((voter) => voter.userId === userId))
    throw new DemoError("DEMO_NOT_YOUR_ROUND", 403);
  const manifest = roundSchema.parse(JSON.parse(round.manifestJson));
  const context = { origin: manifest.origin, rpId: manifest.rpId };
  const pending = round.voters
    .filter((voter) => isDemoSeat(voter.userId) && !voter.ballot)
    .sort(
      (a, b) =>
        DEMO_SEAT_IDS.indexOf(a.userId as never) -
        DEMO_SEAT_IDS.indexOf(b.userId as never),
    );
  const signed: { seat: string; choice: Choice }[] = [];
  // `limit` lets the guided demo sign one seat per request and show progress.
  for (const voter of pending.slice(0, Math.max(1, Math.min(4, limit)))) {
    const index = DEMO_SEAT_IDS.indexOf(voter.userId as never);
    const seatName =
      manifest.members.find((member) => member.id === voter.id)?.label ??
      `Test seat ${index + 2}`;
    const choice = seatChoice(outcome, index);
    const keys = await db.$queryRaw<
      Array<{ credentialId: string; privateKey: string }>
    >`
      SELECT "credentialId", "privateKey" FROM "ParticipateDemoSeatKey" WHERE "userId" = ${voter.userId} AND "rpId" = ${context.rpId}`;
    const passkey = keys.length
      ? await db.passkey.findFirst({
          where: {
            credentialId: keys[0].credentialId,
            userId: voter.userId,
            id: { in: voter.keyIds },
            revokedAt: null,
          },
        })
      : null;
    if (!passkey) throw new DemoError("DEMO_SEAT_KEY_UNAVAILABLE", 409);
    await clearSeatThrottle(voter.userId);
    const ceremony = await beginDecisionSignature(
      hostId,
      recordId,
      round.id,
      voter.userId,
      { choice, rationale: seatRationale(seatName, choice) },
      context,
    );
    const response = seatAssertion({
      credentialId: passkey.credentialId,
      userHandle: passkey.userHandle,
      privateKey: keys[0].privateKey,
      challenge: ceremony.options.challenge,
      origin: context.origin,
      rpId: context.rpId,
      counter: Number(passkey.counter) + 1,
    });
    await finishDecisionSignature(
      hostId,
      recordId,
      round.id,
      voter.userId,
      ceremony.ceremonyId,
      response,
      context,
    );
    signed.push({ seat: seatName, choice });
  }
  return { signed, remaining: Math.max(0, pending.length - signed.length) };
}
