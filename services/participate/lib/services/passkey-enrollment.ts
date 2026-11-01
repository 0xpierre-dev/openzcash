import { createHash, randomBytes } from "node:crypto";
import type { PasskeyChallenge, User } from "@prisma/client";
import { db } from "@/lib/db";
import { isDemoAccount } from "@/lib/auth/email-policy";
import { PasskeyError, RECENT_PASSKEY_EMAIL_TTL_SECONDS, type PasskeyContext } from "@/lib/auth/passkey-policy";
import { passkeyAccountVersion } from "@/lib/services/email-auth";

const PURPOSE = "EMAIL_ENROLL";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export type RecentPasskeyEmailProof = { token?: string; sessionToken?: string };
const eligible = (user: User | null): user is User => Boolean(user && user.status === "ACTIVE" && !isDemoAccount(user.id) && user.email && user.emailVerifiedAt);

function matches(grant: PasskeyChallenge | null, user: User | null, proof: RecentPasskeyEmailProof, context: PasskeyContext) {
  return eligible(user) && Boolean(grant && proof.sessionToken && grant.purpose === PURPOSE &&
    grant.expiresAt > new Date() && grant.userId === user.id && grant.origin === context.origin && grant.rpId === context.rpId &&
    grant.challenge === digest(proof.sessionToken) && grant.passwordVersion === passkeyAccountVersion(user));
}

// Called only by successful email-code sign-in. An ordinary account session
// cannot mint this authorization. No code or raw session token is persisted.
export async function issueRecentPasskeyEmail(userId: string, context: PasskeyContext, sessionToken: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RECENT_PASSKEY_EMAIL_TTL_SECONDS * 1000);
  return db.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!eligible(user) || await tx.passkey.count({ where: { userId, rpId: context.rpId } })) return null;
    await tx.passkeyChallenge.deleteMany({ where: { purpose: PURPOSE, expiresAt: { lte: new Date() } } });
    await tx.passkeyChallenge.create({ data: {
      id: digest(token), purpose: PURPOSE, challenge: digest(sessionToken), userId,
      ...context, passwordVersion: passkeyAccountVersion(user), expiresAt
    } });
    return { token, expiresAt };
  });
}

export async function recentPasskeyEmailAccess(userId: string, proof: RecentPasskeyEmailProof, context: PasskeyContext) {
  if (!proof.token || !proof.sessionToken || !/^[A-Za-z0-9_-]{43}$/.test(proof.token)) return null;
  const [grant, user] = await Promise.all([
    db.passkeyChallenge.findUnique({ where: { id: digest(proof.token) } }),
    db.user.findUnique({ where: { id: userId } })
  ]);
  if (!matches(grant, user, proof, context) || await db.passkey.count({ where: { userId, rpId: context.rpId } })) return null;
  return { expiresAt: grant!.expiresAt };
}

export async function consumeRecentPasskeyEmail(userId: string, proof: RecentPasskeyEmailProof, context: PasskeyContext) {
  if (!proof.token || !proof.sessionToken || !/^[A-Za-z0-9_-]{43}$/.test(proof.token)) throw new PasskeyError("PASSKEY_EMAIL_CONFIRMATION_REQUIRED", 403);
  const id = digest(proof.token);
  return db.$transaction(async tx => {
    // Serialize enrollment authorization with registration/revocation updates.
    const locked = await tx.user.updateMany({ where: { id: userId, status: "ACTIVE" }, data: { id: userId } });
    if (locked.count !== 1) throw new PasskeyError("PASSKEY_EMAIL_CONFIRMATION_REQUIRED", 403);
    const user = await tx.user.findUnique({ where: { id: userId } });
    const grant = await tx.passkeyChallenge.findUnique({ where: { id } });
    if (!matches(grant, user, proof, context) || await tx.passkey.count({ where: { userId, rpId: context.rpId } })) {
      throw new PasskeyError("PASSKEY_EMAIL_CONFIRMATION_REQUIRED", 403);
    }
    const claimed = await tx.passkeyChallenge.deleteMany({ where: { id, purpose: PURPOSE } });
    if (claimed.count !== 1) throw new PasskeyError("PASSKEY_EMAIL_CONFIRMATION_REQUIRED", 403);
    return user!;
  });
}
