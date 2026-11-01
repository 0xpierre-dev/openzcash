import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { canonicalJson, sha256, utf8 } from "@/lib/archive/format";
import { activityEventSchema, verifyActivityEvent, type ActivityAction } from "@/lib/archive/activity";

type Tx = Prisma.TransactionClient;
type Archive = { id: string; communityId: string; recordId: string };

/** Runs in the SAME serializable transaction as the interaction and credit debit. */
export async function appendArchiveActivity(tx: Tx, archive: Archive, userId: string | null, sourceKey: string, action: ActivityAction,
  occurredAt: Date, origin: "LIVE" | "IMPORTED" = "LIVE") {
  // One snapshot read for chain metadata. In particular, never transfer the
  // archived proposal package over the database connection for every like.
  const [state] = await tx.$queryRaw<Array<{ replayId: string | null; actorId: string | null; sequence: number | null; eventHash: string | null; manifestHash: string | null }>>`
    SELECT (SELECT "id" FROM "ArchiveActivityEvent" WHERE "archiveId" = ${archive.id} AND "sourceKey" = ${sourceKey}) AS "replayId",
      (SELECT "id" FROM "ArchiveActivityActor" WHERE "archiveId" = ${archive.id} AND "userId" = ${userId}) AS "actorId",
      previous."sequence", previous."eventHash", revision."manifestHash"
    FROM "ProposalArchive" AS archive
    LEFT JOIN LATERAL (SELECT "sequence", "eventHash" FROM "ArchiveActivityEvent" WHERE "archiveId" = archive."id" ORDER BY "sequence" DESC LIMIT 1) AS previous ON true
    LEFT JOIN LATERAL (SELECT "manifestHash" FROM "ArchiveRevision" WHERE "archiveId" = archive."id" ORDER BY "revision" DESC LIMIT 1) AS revision ON true
    WHERE archive."id" = ${archive.id}`;
  if (state?.replayId) return tx.archiveActivityEvent.findUniqueOrThrow({ where: { id: state.replayId } });
  if (!state?.manifestHash) throw new Error("Published archive revision required");
  if ((action.kind === "DISCUSSION_CLOSED") !== (userId === null)) throw new Error("Invalid system event authority");
  const actorId = userId === null ? "SOURCE_OBSERVER" : state.actorId ?? (await tx.archiveActivityActor.upsert({ where: { archiveId_userId: { archiveId: archive.id, userId } },
    create: { archiveId: archive.id, userId }, update: {}, select: { id: true } })).id;
  const event = activityEventSchema.parse({ schema: "PARTICIPATE_EVENT_V1", id: randomUUID(), communityId: archive.communityId,
    recordId: archive.recordId, proposalManifestHash: state.manifestHash, actor: actorId,
    sequence: (state.sequence ?? 0) + 1, previousEventHash: state.eventHash,
    occurredAt: occurredAt.toISOString(), recordedAt: new Date(Math.max(Date.now(), occurredAt.getTime())).toISOString(), origin, ...action });
  const eventJson = canonicalJson(event), eventHash = await sha256(utf8(eventJson));
  return tx.archiveActivityEvent.create({ data: { id: event.id, archiveId: archive.id, sequence: event.sequence, sourceKey, eventJson, eventHash } });
}

/** Existing actions are explicitly imported NOW, never presented as an earlier chain proof.
 * No public read performs this migration. The first write or operator backfill does it.
 */
export async function initializeArchiveActivity(tx: Tx, archive: Archive) {
  if (await tx.archiveActivityEvent.findFirst({ where: { archiveId: archive.id }, select: { id: true } })) return;
  const [comments, likes, reactions] = await Promise.all([
    tx.archiveComment.findMany({ where: { archiveId: archive.id } }),
    tx.archiveProposalLikeRequest.findMany({ where: { archiveId: archive.id }, take: 10001 }),
    tx.archiveReactionRequest.findMany({ where: { comment: { archiveId: archive.id } }, take: 10001 })
  ]);
  if (likes.length > 10000 || reactions.length > 10000) throw new Error("Activity import requires an operator migration");
  const actions: { userId: string; sourceKey: string; action: ActivityAction; at: Date }[] = [];
  for (const comment of comments) {
    actions.push({ userId: comment.authorId, sourceKey: `comment:${comment.id}`, at: comment.createdAt,
      action: { kind: "COMMENT_POSTED", commentId: comment.id, parentId: comment.parentId, bodyHash: await sha256(utf8(comment.body)) } });
    if (comment.hiddenAt && comment.hiddenById && comment.hideReason) actions.push({ userId: comment.hiddenById, sourceKey: `hide:${comment.id}`, at: comment.hiddenAt,
      action: { kind: "COMMENT_HIDDEN", commentId: comment.id, reason: comment.hideReason } });
  }
  for (const like of likes) actions.push({ userId: like.userId, sourceKey: `proposal-like:${like.id}`, at: like.createdAt, action: { kind: "PROPOSAL_LIKE_SET", liked: like.liked } });
  for (const like of reactions) actions.push({ userId: like.userId, sourceKey: `comment-like:${like.id}`, at: like.createdAt, action: { kind: "COMMENT_LIKE_SET", commentId: like.commentId, liked: like.liked } });
  actions.sort((a, b) => a.at.getTime() - b.at.getTime() || a.sourceKey.localeCompare(b.sourceKey));
  for (const item of actions) await appendArchiveActivity(tx, archive, item.userId, item.sourceKey, item.action, item.at, "IMPORTED");
}

export async function backfillArchiveActivity(communityId: string) {
  const archives = await db.proposalArchive.findMany({ where: { communityId, revisions: { some: {} } } });
  for (const archive of archives) await db.$transaction(tx => initializeArchiveActivity(tx, archive), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
  return db.archiveActivityEvent.count({ where: { archive: { communityId } } });
}

export async function checkedActivityRow(row: { id: string; archiveId: string; sequence: number; eventHash: string; eventJson: string }, archive: Archive) {
  const event = await verifyActivityEvent(row.eventJson, row.eventHash);
  if (event.id !== row.id || event.sequence !== row.sequence || event.recordId !== archive.recordId || event.communityId !== archive.communityId || row.archiveId !== archive.id) throw new Error("Activity identity mismatch");
  return event;
}
