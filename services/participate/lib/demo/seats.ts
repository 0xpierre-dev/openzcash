import { createHash } from "node:crypto";
import { env as processEnvironment } from "node:process";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isDemoAccount } from "@/lib/auth/email-policy";
import type { PasskeyContext } from "@/lib/auth/passkey-policy";
import type { CommitteeWorkspace } from "@/lib/domain/committee";
import {
  appendCommitteeEvent,
  lockCommittee,
  resolveCommittee,
} from "@/lib/services/committee-access";
import { createSeatKey } from "./authenticator";
import { demoEnvironmentActive } from "./environment";

type Tx = Prisma.TransactionClient;
export const DEMO_SEAT_IDS = [
  "demo_seat_2",
  "demo_seat_3",
  "demo_seat_4",
  "demo_seat_5",
] as const;
export const isDemoSeat = (userId: string | null | undefined) =>
  Boolean(userId && (DEMO_SEAT_IDS as readonly string[]).includes(userId));

export function demoTesterName(userId: string) {
  return `Demo tester ${createHash("sha256").update(userId).digest("hex").slice(0, 4).toUpperCase()}`;
}

/** Optional allowlist: comma-separated emails or "@domain" entries. Empty means any verified email. */
export function demoEmailAllowed(
  email: string,
  list = processEnvironment.PARTICIPATE_DEMO_ALLOWED_EMAILS ?? "",
) {
  const entries = list
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (!entries.length) return true;
  const address = email.toLowerCase();
  return entries.some((entry) =>
    entry.startsWith("@") ? address.endsWith(entry) : address === entry,
  );
}

/** Each TEST seat holds exactly one server-side key per relying party. */
export async function ensureSeatKeys(tx: Tx, rpId: string) {
  for (const userId of DEMO_SEAT_IDS) {
    const saved = await tx.$queryRaw<Array<{ credentialId: string }>>`
      SELECT "credentialId" FROM "ParticipateDemoSeatKey" WHERE "userId" = ${userId} AND "rpId" = ${rpId}`;
    if (saved.length) continue;
    const key = createSeatKey();
    await tx.passkey.create({
      data: {
        credentialId: key.credentialId,
        userId,
        userHandle: key.userHandle,
        rpId,
        publicKey: key.publicKey,
        counter: 0,
        transports: ["internal"],
        deviceType: "singleDevice",
        backedUp: false,
        label: "Demo test seat key",
      },
    });
    await tx.$executeRaw`INSERT INTO "ParticipateDemoSeatKey"("credentialId", "userId", "rpId", "privateKey") VALUES (${key.credentialId}, ${userId}, ${rpId}, ${key.privateKey})`;
  }
}

/**
 * A signed-in, verified tester takes a Coordinator seat in the demo committee.
 * Coordinators open reviews and vote; they cannot invite or remove members.
 * No-op outside an active demo environment.
 */
export async function joinDemoCommittee(
  hostId: string,
  userId: string | undefined,
  context: PasskeyContext | null,
) {
  if (!userId || !context || !(await demoEnvironmentActive()))
    return { joined: false };
  // Fast path for every later read: seated tester, seat keys already present.
  const [ready] = await db.$queryRaw<Array<{ seated: boolean; keys: number }>>`
    SELECT EXISTS (SELECT 1 FROM "ParticipateDemoTester" t JOIN "CommunityMembership" m ON m."userId" = t."userId"
      JOIN "ParticipateDemoEnvironment" e ON e."committeeId" = m."communityId" WHERE t."userId" = ${userId} AND m."status" = 'ACTIVE') AS "seated",
      (SELECT count(*)::int FROM "ParticipateDemoSeatKey" WHERE "rpId" = ${context.rpId}) AS "keys"`;
  if (ready?.seated && ready.keys >= DEMO_SEAT_IDS.length) return { joined: true };
  try {
    return await seatTester(hostId, userId, context);
  } catch (error) {
    // Two first loads at once: the loser retries once against the winner's seat.
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) return seatTester(hostId, userId, context);
    throw error;
  }
}

async function seatTester(hostId: string, userId: string, context: PasskeyContext) {
  return db.$transaction(
    async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: userId, status: "ACTIVE" },
      });
      if (
        !user?.email ||
        !user.emailVerifiedAt ||
        isDemoAccount(userId) ||
        isDemoSeat(userId) ||
        !demoEmailAllowed(user.email)
      )
        return { joined: false };
      const committee = await resolveCommittee(tx, hostId);
      await lockCommittee(tx, committee.id);
      await ensureSeatKeys(tx, context.rpId);
      const membership = await tx.communityMembership.findUnique({
        where: { communityId_userId: { communityId: committee.id, userId } },
      });
      await tx.$executeRaw`INSERT INTO "ParticipateDemoTester"("userId") VALUES (${userId}) ON CONFLICT ("userId") DO NOTHING`;
      if (membership?.status === "ACTIVE") return { joined: true };
      const publicName = demoTesterName(userId);
      const seat = membership
        ? await tx.communityMembership.update({
            where: { id: membership.id },
            data: {
              status: "ACTIVE",
              role: "MANAGER",
              publicName,
              version: { increment: 1 },
            },
          })
        : await tx.communityMembership.create({
            data: {
              communityId: committee.id,
              userId,
              role: "MANAGER",
              publicName,
            },
          });
      await appendCommitteeEvent(tx, committee.id, userId, "MEMBER_JOINED", {
        memberId: seat.id,
        role: "MANAGER",
        publicName,
        summary: `${publicName} took a demo coordinator seat.`,
      });
      return { joined: true };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 15000,
    },
  );
}

/** In the demo every round's roster is the tester who opens it plus the four TEST seats. */
export async function demoRosterScope<T extends { userId: string | null }>(
  entries: T[],
  viewerId: string | undefined,
): Promise<T[]> {
  if (!(await demoEnvironmentActive())) return entries;
  return entries.filter(
    (entry) =>
      isDemoSeat(entry.userId) ||
      (viewerId !== undefined && entry.userId === viewerId),
  );
}

async function testerRounds(client: Tx | typeof db, userId: string) {
  const rows = await client.signedDecisionVoter.findMany({
    where: { userId },
    select: { roundId: true },
  });
  return new Set(rows.map((row) => row.roundId));
}

/** Testers see their own seat, the TEST seats and their own activity since their last reset. */
export async function scopeDemoWorkspace(
  workspace: CommitteeWorkspace,
  hostId: string,
  userId: string | undefined,
): Promise<CommitteeWorkspace> {
  if (
    !userId ||
    workspace.access !== "MEMBER" ||
    !(await demoEnvironmentActive())
  )
    return workspace;
  const committee = await resolveCommittee(db, hostId);
  const seats = await db.communityMembership.findMany({
    where: {
      communityId: committee.id,
      userId: { in: [...DEMO_SEAT_IDS, userId] },
    },
    select: { id: true },
  });
  const visible = new Set(seats.map((seat) => seat.id));
  const [tester] = await db.$queryRaw<
    Array<{ since: Date }>
  >`SELECT COALESCE("resetAt", "joinedAt") AS "since" FROM "ParticipateDemoTester" WHERE "userId" = ${userId}`;
  const rounds = await testerRounds(db, userId);
  const events = await db.committeeEvent.findMany({
    where: {
      communityId: committee.id,
      id: { in: workspace.history.map((event) => event.id) },
    },
    select: { id: true, actorId: true, details: true, createdAt: true },
  });
  const allowed = new Set(
    events
      .filter((event) => {
        if (tester && event.createdAt < tester.since) return false;
        const roundId = (event.details as Record<string, unknown> | null)
          ?.roundId;
        return typeof roundId === "string"
          ? rounds.has(roundId)
          : event.actorId === userId;
      })
      .map((event) => event.id),
  );
  return {
    ...workspace,
    members: workspace.members
      .filter((member) => visible.has(member.id))
      .sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name, "en", { numeric: true })),
    queue: workspace.queue.map((row) =>
      row.roundId ? row : { ...row, eligible: 5 },
    ),
    history: workspace.history.filter((event) => allowed.has(event.id)),
  };
}

export async function readDemoStatus(
  hostId: string,
  userId: string | undefined,
) {
  if (!(await demoEnvironmentActive())) return null;
  const committee = await resolveCommittee(db, hostId);
  const seats = await db.communityMembership.findMany({
    where: {
      communityId: committee.id,
      userId: { in: [...DEMO_SEAT_IDS] },
      status: "ACTIVE",
    },
    select: { publicName: true },
    orderBy: { userId: "asc" },
  });
  const mine = userId ? await testerRounds(db, userId) : new Set<string>();
  const open = await db.signedDecisionRound.findMany({
    where: { scopeId: committee.id },
    select: {
      id: true,
      revision: { select: { archive: { select: { recordId: true } } } },
    },
  });
  return {
    demo: true as const,
    testSeats: seats.map((seat) => seat.publicName ?? "Test seat"),
    myRecords: open
      .filter((round) => mine.has(round.id))
      .map((round) => round.revision.archive.recordId),
    otherTesterRecords: open
      .filter((round) => !mine.has(round.id))
      .map((round) => round.revision.archive.recordId),
  };
}
