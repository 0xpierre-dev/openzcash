import { committeeOperationsEnabled } from "@/lib/auth/committee-policy";
import { verifyCommitteePreview } from "@/lib/auth/committee-admin";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { decisionHash } from "@/lib/decisions/format";
import { committeePermissions } from "@/lib/domain/committee";
import { isDemoAccount } from "@/lib/auth/email-policy";

export class CommitteeError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export async function resolveCommittee(tx: Prisma.TransactionClient, hostId: string) {
  const scopes = await tx.proposalArchive.findMany({ where: { communityId: hostId, revisions: { some: {} } }, distinct: ["committeeId"], select: { committeeId: true } });
  const id = scopes.length === 1 ? scopes[0].committeeId : null;
  const committee = id ? await tx.community.findFirst({ where: { id, kind: "COMMITTEE" }, select: { id: true, name: true } }) : null;
  if (!committee) throw new CommitteeError("COMMITTEE_UNAVAILABLE", 404);
  return committee;
}
export async function committeeActor(tx: Prisma.TransactionClient, committeeId: string, userId?: string) {
  const user = userId ? await tx.user.findFirst({ where: { id: userId, status: "ACTIVE" } }) : null;
  const membership = user ? await tx.communityMembership.findUnique({ where: { communityId_userId: { communityId: committeeId, userId: user.id } } }) : null;
  const role = membership?.status === "ACTIVE" ? membership.role : null;
  return { user, membership, role, permissions: committeePermissions(role), canMutate: Boolean(user?.email && user.emailVerifiedAt && !isDemoAccount(user.id)) };
}
export async function lockCommittee(tx: Prisma.TransactionClient, communityId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`committee:${communityId}`}, 0))`;
}
export async function appendCommitteeEvent(tx: Prisma.TransactionClient, communityId: string, actorId: string, action: string, details: Prisma.InputJsonObject) {
  await lockCommittee(tx, communityId);
  const previous = await tx.committeeEvent.findFirst({ where: { communityId }, orderBy: { sequence: "desc" } });
  const createdAt = new Date();
  const payload = { id: randomUUID(), communityId, sequence: (previous?.sequence ?? 0) + 1, actorId, action, details, previousHash: previous?.hash ?? null, createdAt: createdAt.toISOString() };
  return tx.committeeEvent.create({ data: { ...payload, createdAt, hash: await decisionHash(payload) } });
}
export async function readCommitteeEntry(hostId: string, userId?: string, previewToken?: string) {
  if (!userId) return null;
  if (!committeeOperationsEnabled()) return await verifyCommitteePreview(userId, hostId, previewToken) ? { label: "Committee preview", href: "/participate/committee" } : null;
  const scope = await resolveCommittee(db, hostId).catch(() => null);
  if (!scope) return null;
  const actor = await committeeActor(db, scope.id, userId);
  if (actor.role) return { label: "Committee workspace", href: "/participate/committee" };
  if (actor.canMutate && await db.committeeInvitation.findFirst({ where: { communityId: scope.id, email: actor.user!.email!.toLowerCase(), acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } })) return { label: "Committee invitation", href: "/participate/committee" };
  return null;
}
