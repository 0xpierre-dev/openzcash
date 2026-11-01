import { db } from "@/lib/db";
import { archiveManifestSchema } from "@/lib/archive/format";
import type { PasskeyContext } from "@/lib/auth/passkey-policy";
import { PasskeyError } from "@/lib/auth/passkey-policy";
import { createDecisionRound } from "@/lib/services/signed-decisions";
import { resolveCommittee } from "@/lib/services/committee-access";
import { DemoError, requireDemoEnvironment } from "./environment";

export type PracticeRound = {
  hostId: string;
  recordId: string;
  title: string;
  revision: number;
  roundId: string;
  signed: number;
  eligible: number;
  complete: boolean;
};

const SKIP = new Set([
  "PROPOSAL_SOURCE_WITHDRAWN",
  "PROPOSAL_ABANDONED",
  "DECISION_ALREADY_EXISTS",
  "DECISION_REVISION_CHANGED",
]);

async function describe(
  hostId: string,
  roundId: string,
): Promise<PracticeRound> {
  const round = await db.signedDecisionRound.findUniqueOrThrow({
    where: { id: roundId },
    include: {
      revision: { include: { archive: true } },
      voters: { select: { id: true } },
      ballots: { select: { id: true } },
    },
  });
  return {
    hostId,
    recordId: round.revision.archive.recordId,
    title: round.revision.archive.title,
    revision: round.revision.revision,
    roundId,
    signed: round.ballots.length,
    eligible: round.voters.length,
    complete: round.ballots.length === round.voters.length,
  };
}

/**
 * The tester's practice review: resumes their unfinished round, or opens a new
 * one on the newest proposal nobody has reviewed yet. `fresh` skips resuming a
 * completed round so "Try another" always lands on a new proposal.
 */
export async function startPracticeRound(
  hostId: string,
  userId: string,
  context: PasskeyContext,
  fresh = false,
): Promise<PracticeRound> {
  await requireDemoEnvironment();
  const committee = await resolveCommittee(db, hostId);
  const mine = await db.signedDecisionRound.findMany({
    where: { scopeId: committee.id, voters: { some: { userId } } },
    include: {
      voters: { select: { id: true } },
      ballots: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const open = mine.find((round) => round.ballots.length < round.voters.length);
  if (open) return describe(hostId, open.id);
  if (!fresh && mine[0]) return describe(hostId, mine[0].id);
  const archives = await db.proposalArchive.findMany({
    where: {
      communityId: hostId,
      committeeId: committee.id,
      abandonment: null,
      revisions: { some: {} },
    },
    orderBy: { createdAt: "desc" },
    include: {
      revisions: {
        orderBy: { revision: "desc" },
        take: 1,
        include: { decision: { select: { id: true } } },
      },
    },
  });
  for (const archive of archives) {
    const revision = archive.revisions[0];
    if (revision.decision) continue;
    const manifest = archiveManifestSchema.safeParse(
      JSON.parse(JSON.parse(revision.packageJson).manifest),
    );
    if (!manifest.success || manifest.data.kind === "HISTORICAL_SUMMARY")
      continue;
    try {
      const round = await createDecisionRound(
        hostId,
        archive.recordId,
        userId,
        { revision: revision.revision, policy: "ZCG_MAJORITY" },
        context,
      );
      return describe(hostId, round.id);
    } catch (error) {
      if (error instanceof PasskeyError && SKIP.has(error.code)) continue;
      throw error;
    }
  }
  throw new DemoError("DEMO_NO_PROPOSAL_AVAILABLE", 409);
}
