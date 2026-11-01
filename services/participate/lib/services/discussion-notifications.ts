import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { isVerifiedPilotAccount, publicPilotRequested, publicPilotScope } from "@/lib/auth/public-pilot-policy";
import { committeeOperationsEnabled } from "@/lib/auth/committee-policy";
import { isDemoAccount } from "@/lib/auth/email-policy";
import type { DiscussionInbox, DiscussionNotificationItem } from "@/lib/domain/discussion-notifications";

export class NotificationError extends Error {
  constructor(public readonly code: string, public readonly status = 400) { super(code); }
}
const id = z.string().min(1).max(128);
const readInput = z.union([
  z.object({ ids: z.array(id).min(1).max(100) }).strict(),
  z.object({ through: z.string().datetime() }).strict()
]);

/** Must run in the interaction's transaction: no notification for a failed debit or write. */
export async function recordDiscussionNotification(tx: Prisma.TransactionClient, event: {
  kind: "COMMENT_LIKED" | "COMMENT_REPLIED"; recipientId: string; actorId: string; commentId: string; createdAt: Date;
}, active = true) {
  if (event.recipientId === event.actorId) return;
  const { kind, actorId, commentId } = event;
  if (!active) {
    await tx.discussionNotification.updateMany({ where: { kind, actorId, commentId, withdrawnAt: null }, data: { withdrawnAt: new Date() } });
    return;
  }
  // A re-like restores the same item, preserving its read state and original date.
  await tx.discussionNotification.upsert({ where: { kind_actorId_commentId: { kind, actorId, commentId } }, create: event, update: { withdrawnAt: null } });
}

/** Called inside the first real publication transaction, never for drafts or reimports.
 * Recording an arrival grants no committee access. Read access is checked on every request.
 */
export async function recordProposalArrival(tx: Prisma.TransactionClient, archive: {
  id: string; committeeId: string | null; createdAt: Date;
}) {
  if (!archive.committeeId) return;
  const members = await tx.communityMembership.findMany({ where: {
    communityId: archive.committeeId, community: { kind: "COMMITTEE" }, status: "ACTIVE", user: { status: "ACTIVE" }
  }, select: { userId: true } });
  const recipients = members.filter(member => !isDemoAccount(member.userId));
  if (!recipients.length) return;
  // The unique recipient/archive key also protects against concurrent retries.
  await tx.discussionNotification.createMany({ data: recipients.map(member => ({
    kind: "PROPOSAL_ARRIVED", recipientId: member.userId, archiveId: archive.id, createdAt: archive.createdAt
  })), skipDuplicates: true });
}

async function inboxScope(tx: Prisma.TransactionClient, userId: string, communityId: string, includeProposals: boolean): Promise<Prisma.DiscussionNotificationWhereInput> {
  if (!id.safeParse(communityId).success) throw new NotificationError("INVALID_NOTIFICATION_SCOPE");
  const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, status: true, email: true, emailVerifiedAt: true } });
  if (user?.status !== "ACTIVE") throw new NotificationError("ACCOUNT_UNAVAILABLE", 403);
  const pilot = publicPilotRequested() ? publicPilotScope() : null;
  if (publicPilotRequested() && (!pilot || pilot.hostId !== communityId || !isVerifiedPilotAccount(user))) throw new NotificationError("forbidden", 403);
  const visible: Prisma.DiscussionNotificationWhereInput[] = [{
    kind: { in: ["COMMENT_LIKED", "COMMENT_REPLIED"] }, comment: { hiddenAt: null, archive: {
      communityId, ...(pilot ? { committeeId: pilot.committeeId } : {}), revisions: { some: {} }
    } }
  }];
  if (includeProposals && committeeOperationsEnabled() && !isDemoAccount(user.id)) visible.push({
    kind: "PROPOSAL_ARRIVED", archive: { communityId, revisions: { some: {} }, committee: {
      kind: "COMMITTEE", memberships: { some: { userId, status: "ACTIVE" } }
    } }
  });
  return { recipientId: userId, withdrawnAt: null, OR: visible };
}

export async function readDiscussionNotifications(userId: string, communityId: string, cursor?: string, includeProposals = false): Promise<DiscussionInbox> {
  if (cursor !== undefined && !id.safeParse(cursor).success) throw new NotificationError("INVALID_NOTIFICATION_CURSOR");
  return db.$transaction(async tx => {
    const where = await inboxScope(tx, userId, communityId, includeProposals);
    const asOf = new Date();
    // Resolve cursors only inside the recipient's inbox; IDs are not access grants.
    const after = cursor ? await tx.discussionNotification.findFirst({ where: { ...where, id: cursor }, select: { id: true, createdAt: true } }) : null;
    if (cursor && !after) throw new NotificationError("INVALID_NOTIFICATION_CURSOR");
    const [rows, unreadCount] = await Promise.all([
      tx.discussionNotification.findMany({ where: { AND: [where, ...(after ? [{ OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] }] : [])] },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 21,
        include: { archive: { select: { recordId: true, title: true } }, actor: { select: { status: true, displayName: true, avatarUrl: true, shareProfileInDiscussion: true } }, comment: { select: { id: true, archiveId: true, body: true, archive: { select: { recordId: true, title: true } } } } } }),
      tx.discussionNotification.count({ where: { ...where, readAt: null } })
    ]);
    const items = rows.slice(0, 20).map((row): DiscussionNotificationItem => {
      if (row.kind === "PROPOSAL_ARRIVED") {
        if (!row.archive) throw new NotificationError("INVALID_NOTIFICATION_TARGET", 500);
        return { id: row.id, kind: row.kind, read: Boolean(row.readAt), createdAt: row.createdAt.toISOString(),
          actorLabel: null, actorAvatarUrl: null, commentId: null, proposalTitle: row.archive.title,
          recordId: row.archive.recordId, excerpt: "Open committee review" };
      }
      if (!row.actor || !row.comment || !row.commentId) throw new NotificationError("INVALID_NOTIFICATION_TARGET", 500);
      const shared = row.actor.status === "ACTIVE" && row.actor.shareProfileInDiscussion;
      return { id: row.id, kind: row.kind, read: Boolean(row.readAt), createdAt: row.createdAt.toISOString(),
        actorLabel: shared && row.actor.displayName ? row.actor.displayName : `Participant ${createHash("sha256").update(`${row.comment.archiveId}:${row.actorId}`).digest("hex").slice(0, 6)}`,
        actorAvatarUrl: shared ? row.actor.avatarUrl : null, proposalTitle: row.comment.archive.title,
        excerpt: row.comment.body.replace(/\s+/g, " ").slice(0, 160), recordId: row.comment.archive.recordId, commentId: row.commentId };
    });
    return { items, unreadCount, nextCursor: rows.length > 20 ? items.at(-1)!.id : null, asOf: asOf.toISOString() };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function markDiscussionNotificationsRead(userId: string, communityId: string, input: unknown, includeProposals = false) {
  const parsed = readInput.safeParse(input);
  if (!parsed.success) throw new NotificationError("INVALID_NOTIFICATION_INPUT");
  const now = new Date(), data = parsed.data;
  if ("through" in data && new Date(data.through) > now) throw new NotificationError("INVALID_NOTIFICATION_INPUT");
  return db.$transaction(async tx => {
    const where = await inboxScope(tx, userId, communityId, includeProposals);
    const result = await tx.discussionNotification.updateMany({ where: { ...where, readAt: null,
      ...("ids" in data ? { id: { in: data.ids } } : { createdAt: { lte: new Date(data.through) } }) }, data: { readAt: now } });
    return { updated: result.count };
  });
}
