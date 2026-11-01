import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  lockCommittee,
  resolveCommittee,
} from "@/lib/services/committee-access";
import { lockProposalArchive } from "@/lib/services/proposal-lifecycle";
import { requireDemoEnvironment } from "./environment";

type Tx = Prisma.TransactionClient;
type LabelEvent = {
  kind?: string;
  actor?: string;
  labelsVersion?: number;
  labels?: Array<{ id: string }>;
};

type Truncation = "NONE" | "TRUNCATED" | "BLOCKED";

/**
 * Removes the tester's activity tail on one archive. The chain is hash-linked,
 * so only a tail made entirely of the tester's own review and label events can
 * go; anything else (another person's comment, like or labels, or anchored
 * evidence) blocks the reset for this archive.
 */
async function truncateActivity(
  tx: Tx,
  archiveId: string,
  roundKeys: Set<string>,
  actorId: string | null,
): Promise<Truncation> {
  const mineEvent = (event: { sourceKey: string; eventJson: string }) =>
    roundKeys.has(event.sourceKey) ||
    Boolean(
      actorId &&
        event.sourceKey.startsWith("committee-labels:") &&
        (JSON.parse(event.eventJson) as LabelEvent).actor === actorId,
    );
  const candidates = await tx.archiveActivityEvent.findMany({
    where: {
      archiveId,
      OR: [
        { sourceKey: { startsWith: "review-decided:" } },
        { sourceKey: { startsWith: "committee-labels:" } },
      ],
    },
    select: { sequence: true, sourceKey: true, eventJson: true },
  });
  const mine = candidates.filter(mineEvent);
  if (!mine.length) return "NONE";
  const from = Math.min(...mine.map((event) => event.sequence));
  const tail = await tx.archiveActivityEvent.findMany({
    where: { archiveId, sequence: { gte: from } },
    select: { id: true, sourceKey: true, eventJson: true },
  });
  if (!tail.every(mineEvent)) return "BLOCKED";
  const ids = tail.map((event) => event.id);
  // Anchored or referenced evidence is never removed, even in the demo.
  const referenced =
    (await tx.archiveActivityInclusion.count({
      where: { eventId: { in: ids } },
    })) +
    (await tx.proposalAbandonment.count({ where: { eventId: { in: ids } } }));
  if (referenced) return "BLOCKED";
  await tx.archiveActivityEvent.deleteMany({ where: { id: { in: ids } } });
  return "TRUNCATED";
}

async function restoreLabels(
  tx: Tx,
  archive: { id: string; labels: string[]; labelsVersion: number },
) {
  const events = await tx.archiveActivityEvent.findMany({
    where: {
      archiveId: archive.id,
      sourceKey: { startsWith: "committee-labels:" },
    },
    orderBy: { sequence: "desc" },
    take: 1,
    select: { eventJson: true },
  });
  const last = events[0]
    ? (JSON.parse(events[0].eventJson) as LabelEvent)
    : null;
  const [baseline] = await tx.$queryRaw<
    Array<{ labels: string[]; labelsVersion: number }>
  >`SELECT "labels", "labelsVersion" FROM "ParticipateDemoBaseline" WHERE "archiveId" = ${archive.id}`;
  const labels = last?.labels
    ? last.labels.map((label) => label.id)
    : (baseline?.labels ?? []);
  const labelsVersion = last?.labelsVersion ?? baseline?.labelsVersion ?? 0;
  if (
    JSON.stringify(labels) === JSON.stringify(archive.labels) &&
    labelsVersion === archive.labelsVersion
  )
    return;
  await tx.proposalArchive.update({
    where: { id: archive.id },
    data: { labels, labelsVersion },
  });
}

/**
 * Clears the tester's rounds, ballots and proposal tags so the demo starts over.
 * Only rounds the tester was seated in are removed; other testers' rounds stay.
 * The committee audit log is append-only and is filtered by reset time instead.
 */
export async function resetDemoTester(hostId: string, userId: string) {
  await requireDemoEnvironment();
  return db.$transaction(
    async (tx) => {
      // Transaction-local. Only the demo database's triggers honour it.
      await tx.$executeRaw`SELECT set_config('participate.demo_reset', 'on', true)`;
      const committee = await resolveCommittee(tx, hostId);
      const rounds = await tx.signedDecisionRound.findMany({
        where: { scopeId: committee.id, voters: { some: { userId } } },
        select: { id: true, revision: { select: { archiveId: true } } },
      });
      const labelled = await tx.committeeEvent.findMany({
        where: {
          communityId: committee.id,
          actorId: userId,
          action: "PROPOSAL_LABELS_SET",
        },
        select: { details: true },
      });
      const recordIds = [
        ...new Set(
          labelled
            .map(
              (event) => (event.details as Record<string, unknown>)?.recordId,
            )
            .filter((id): id is string => typeof id === "string"),
        ),
      ];
      const archives = await tx.proposalArchive.findMany({
        where: {
          communityId: hostId,
          OR: [
            { id: { in: rounds.map((round) => round.revision.archiveId) } },
            { recordId: { in: recordIds } },
          ],
        },
        orderBy: { id: "asc" },
      });
      for (const archive of archives) await lockProposalArchive(tx, archive.id);
      await lockCommittee(tx, committee.id);
      let activity = 0;
      const blocked = new Set<string>();
      const roundKeys = new Set(rounds.map((round) => `review-decided:${round.id}`));
      for (const archive of archives) {
        const actor = await tx.archiveActivityActor.findUnique({
          where: { archiveId_userId: { archiveId: archive.id, userId } },
          select: { id: true },
        });
        const result = await truncateActivity(tx, archive.id, roundKeys, actor?.id ?? null);
        if (result === "BLOCKED") blocked.add(archive.id);
        if (result === "TRUNCATED") {
          activity++;
          await restoreLabels(tx, archive);
        }
      }
      // A round whose published event could not be removed stays, so no
      // activity event ever points at a deleted round.
      const roundIds = rounds.filter((round) => !blocked.has(round.revision.archiveId)).map((round) => round.id);
      await tx.signedDecisionChallenge.deleteMany({
        where: { roundId: { in: roundIds } },
      });
      await tx.signedDecisionBallot.deleteMany({
        where: { roundId: { in: roundIds } },
      });
      await tx.signedDecisionVoter.deleteMany({
        where: { roundId: { in: roundIds } },
      });
      await tx.signedDecisionRound.deleteMany({
        where: { id: { in: roundIds } },
      });
      await tx.$executeRaw`UPDATE "ParticipateDemoTester" SET "resetAt" = (now() AT TIME ZONE 'UTC') WHERE "userId" = ${userId}`;
      return { rounds: roundIds.length, proposals: activity, kept: rounds.length - roundIds.length };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 30000,
    },
  );
}
