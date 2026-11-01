import { createHmac } from "node:crypto";
import { compare } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { db } from "@/lib/db";
import { isDemoAccount } from "@/lib/auth/email-policy";
import type { Prisma } from "@prisma/client";
import { publicPilotScope } from "@/lib/auth/public-pilot-policy";

export const COMMITTEE_ADMIN_TTL = 15 * 60;
const PURPOSE = "participate-committee-preview";
const MODERATION_PURPOSE = "participate-pilot-moderation";
type AdminReader = Pick<Prisma.TransactionClient, "user">;
export class CommitteeAdminError extends Error {
  constructor(public code: string, public status = 403) { super(code); }
}
const input = z.object({ password: z.string().min(1).max(72).refine(value => Buffer.byteLength(value, "utf8") <= 72) }).strict();
function secret() {
  const key = process.env.ZCAP_SESSION_SECRET;
  if (!key || Buffer.byteLength(key) < 32) throw new CommitteeAdminError("ADMIN_ACCESS_UNAVAILABLE", 503);
  return new TextEncoder().encode(key);
}
async function administrator(userId: string, reader: AdminReader = db) {
  if (isDemoAccount(userId)) return null;
  const user = await reader.user.findFirst({ where: { id: userId, status: "ACTIVE", role: "ADMIN", emailVerifiedAt: { not: null }, email: { not: null } }, select: { id: true, passwordHash: true } });
  // An empty email-only password, or a non-bcrypt value, never grants access.
  return user && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(user.passwordHash) ? user : null;
}
function credentialVersion(passwordHash: string, key: Uint8Array, purpose: string) {
  return createHmac("sha256", key).update(`${purpose}:${passwordHash}`).digest("hex");
}

async function unlockAdminAccess(userId: string, hostId: string, body: unknown, purpose: string, committeeId?: string) {
  const { password } = input.parse(body);
  const key = secret();
  const user = await administrator(userId);
  if (!user) throw new CommitteeAdminError("ADMIN_ACCESS_DENIED");
  const now = new Date(), id = `committee-admin:${userId}`;
  // Commit attempts BEFORE checking the password. A rejected password must not
  // roll back the counter; a per-account lock serializes simultaneous attempts.
  const allowed = await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`;
    const previous = await tx.passkeyThrottle.findUnique({ where: { id } });
    if (previous && previous.resetsAt > now && previous.attempts >= 5) return false;
    await tx.passkeyThrottle.upsert({ where: { id }, create: { id, attempts: 1, resetsAt: new Date(+now + COMMITTEE_ADMIN_TTL * 1000) },
      update: { attempts: previous && previous.resetsAt > now ? previous.attempts + 1 : 1, resetsAt: previous && previous.resetsAt > now ? previous.resetsAt : new Date(+now + COMMITTEE_ADMIN_TTL * 1000) } });
    return true;
  });
  if (!allowed) throw new CommitteeAdminError("ADMIN_RATE_LIMITED", 429);
  if (!await compare(password, user.passwordHash)) throw new CommitteeAdminError("ADMIN_ACCESS_DENIED");
  return new SignJWT({ hostId, ...(committeeId ? { committeeId } : {}), credentialVersion: credentialVersion(user.passwordHash, key, purpose) })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(user.id)
    .setIssuer(purpose).setAudience(purpose).setIssuedAt().setExpirationTime(`${COMMITTEE_ADMIN_TTL}s`).sign(key);
}

async function verifyAdminAccess(userId: string | undefined, hostId: string, token: string | undefined, purpose: string, committeeId?: string, reader: AdminReader = db) {
  if (!userId || !token || token.length > 2048) return false;
  try {
    const key = secret();
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"], issuer: purpose, audience: purpose, maxTokenAge: `${COMMITTEE_ADMIN_TTL}s` });
    if (payload.sub !== userId || payload.hostId !== hostId || (committeeId && payload.committeeId !== committeeId)) return false;
    const user = await administrator(userId, reader);
    return Boolean(user && payload.credentialVersion === credentialVersion(user.passwordHash, key, purpose));
  } catch { return false; }
}

export function unlockCommitteePreview(userId: string, hostId: string, body: unknown) {
  return unlockAdminAccess(userId, hostId, body, PURPOSE);
}
export function verifyCommitteePreview(userId: string | undefined, hostId: string, token?: string) {
  return verifyAdminAccess(userId, hostId, token, PURPOSE);
}

/** Separate authority from the read-only committee preview, with the SAME password attempt budget. */
export async function unlockPilotModeration(userId: string, body: unknown) {
  const scope = publicPilotScope();
  if (!scope) throw new CommitteeAdminError("ADMIN_ACCESS_UNAVAILABLE", 503);
  return unlockAdminAccess(userId, scope.hostId, body, MODERATION_PURPOSE, scope.committeeId);
}
export async function verifyPilotModeration(userId: string | undefined, hostId: string, committeeId: string | null, token?: string, reader: AdminReader = db) {
  const scope = publicPilotScope();
  if (!scope || scope.hostId !== hostId || scope.committeeId !== committeeId) return false;
  return verifyAdminAccess(userId, hostId, token, MODERATION_PURPOSE, scope.committeeId, reader);
}
