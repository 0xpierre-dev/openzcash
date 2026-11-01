import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { EmailAuthError, EMAIL_CODE_TTL_SECONDS, isDemoAccount, type EmailPurpose } from "@/lib/auth/email-policy";
import { deliverEmailCode, emailDeliveryAvailable } from "@/lib/services/email-delivery";
import { isParticipationCreditSandbox } from "@/lib/services/participation-credits";
import { publicPilotRequested } from "@/lib/auth/public-pilot-policy";
import { DEMO_USER_IDS, type DemoPersona } from "@/lib/auth/demo-persona";

export const emailInput = z.string().trim().email().max(254).transform(value => value.toLowerCase());
export const emailCodeInput = z.string().regex(/^\d{6}$/);
export const emailDigest = (value: string) => createHash("sha256").update(value).digest("hex");
const MAX_ATTEMPTS = 5;
function keyedHash(value: string) {
  const secret = process.env.EMAIL_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new EmailAuthError("EMAIL_NOT_CONFIGURED", 503);
  return createHmac("sha256", secret).update(value).digest("hex");
}
const proofHash = (id: string, code: string) => keyedHash(`participate-code:${id}:${code}`);
export type EmailProof = { token?: string; code: string };
type ChallengeInput = { email: string; purpose: EmailPurpose; origin: string; userId?: string; binding?: string };

export async function requestEmailCode(input: ChallengeInput, previousToken?: string) {
  if (!emailDeliveryAvailable()) throw new EmailAuthError("EMAIL_NOT_CONFIGURED", 503);
  const email = emailInput.parse(input.email);
  const token = randomBytes(32).toString("base64url");
  const id = emailDigest(token);
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const now = new Date();
  await db.$transaction(async tx => {
    // Shared and recipient caps are serialized across all application instances.
    // No IP addresses or plaintext recipient addresses in the throttle table.
    for (const scope of ["global", `recipient:${keyedHash(email)}`]) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`email-rate:${scope}`}, 0))`;
      const key = keyedHash(scope);
      const saved = await tx.emailAuthThrottle.findUnique({ where: { id: key } });
      const live = saved && saved.resetsAt > now;
      if (live && saved.attempts >= (scope === "global" ? 200 : 5)) {
        throw new EmailAuthError("EMAIL_RATE_LIMITED", 429, Math.max(1, Math.ceil((+saved.resetsAt - +now) / 1000)));
      }
      if (live && scope !== "global" && +now - +saved.lastSentAt < 60_000) {
        throw new EmailAuthError("EMAIL_RATE_LIMITED", 429, Math.max(1, Math.ceil((60_000 - (+now - +saved.lastSentAt)) / 1000)));
      }
      await tx.emailAuthThrottle.upsert({ where: { id: key },
        create: { id: key, attempts: 1, resetsAt: new Date(+now + 600_000), lastSentAt: now },
        update: { attempts: live ? saved.attempts + 1 : 1, resetsAt: live ? saved.resetsAt : new Date(+now + 600_000), lastSentAt: now }
      });
    }
    await tx.emailAuthChallenge.deleteMany({ where: { expiresAt: { lte: now } } });
    await tx.emailAuthThrottle.deleteMany({ where: { resetsAt: { lte: now } } });
    // Bind replacement to the same browser token. Other browsers are independent.
    if (previousToken) await tx.emailAuthChallenge.updateMany({ where: { id: emailDigest(previousToken) }, data: { consumedAt: now } });
    await tx.emailAuthChallenge.create({ data: {
      id, email, purpose: input.purpose, userId: input.userId, binding: input.binding ?? "", origin: input.origin,
      codeHash: proofHash(id, code), expiresAt: new Date(+now + EMAIL_CODE_TTL_SECONDS * 1000)
    } });
  });
  try {
    await deliverEmailCode(email, code, input.purpose, id);
    await db.emailAuthChallenge.update({ where: { id }, data: { deliveredAt: new Date() } });
  } catch (error) {
    await db.emailAuthChallenge.deleteMany({ where: { id } });
    throw error;
  }
  return { token, expiresIn: EMAIL_CODE_TTL_SECONDS, retryAfter: 60 };
}

async function consumeEmailCode(proof: EmailProof, expected: { purpose: EmailPurpose; origin: string; userId?: string; binding?: string }) {
  if (!proof.token || !/^[A-Za-z0-9_-]{43}$/.test(proof.token)) throw new EmailAuthError("EMAIL_CODE_INVALID");
  const id = emailDigest(proof.token);
  const result = await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`email-proof:${id}`}, 0))`;
    const saved = await tx.emailAuthChallenge.findUnique({ where: { id } });
    if (!saved || saved.consumedAt || !saved.deliveredAt || saved.expiresAt <= new Date() || saved.attempts >= MAX_ATTEMPTS ||
        saved.origin !== expected.origin || saved.purpose !== expected.purpose || saved.userId !== (expected.userId ?? null) ||
        saved.binding !== (expected.binding ?? "")) return null;
    // Failed attempts must commit. Throwing here would roll back the attempt counter.
    const valid = /^\d{6}$/.test(proof.code) && timingSafeEqual(Buffer.from(saved.codeHash, "hex"), Buffer.from(proofHash(id, proof.code), "hex"));
    await tx.emailAuthChallenge.update({ where: { id }, data: { attempts: { increment: 1 }, ...(valid ? { consumedAt: new Date() } : {}) } });
    return valid ? saved : null;
  });
  if (!result) throw new EmailAuthError("EMAIL_CODE_INVALID");
  return result;
}

export async function finishEmailSignIn(proof: EmailProof, origin: string) {
  const challenge = await consumeEmailCode(proof, { purpose: "SIGN_IN", origin });
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`email-account:${challenge.email}`}, 0))`;
    const existing = await tx.user.findMany({ where: { email: { equals: challenge.email, mode: "insensitive" } }, take: 2 });
    // Never guess between legacy accounts that differ only by email letter case.
    if (existing.length > 1 || existing.some(user => user.status !== "ACTIVE" || isDemoAccount(user.id))) throw new EmailAuthError("EMAIL_ACCOUNT_UNAVAILABLE", 403);
    const user = existing[0]
      ? await tx.user.update({ where: { id: existing[0].id }, data: { emailVerifiedAt: existing[0].emailVerifiedAt ?? new Date() } })
      : await tx.user.create({ data: { email: challenge.email, emailVerifiedAt: new Date(), nick: `member-${randomBytes(8).toString("hex")}`, passwordHash: "", role: "USER" } });
    return { subjectType: "user" as const, userId: user.id, nick: user.nick, role: user.role };
  });
}

export async function passkeyEmailAccount(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "ACTIVE" || isDemoAccount(userId) || !user.email || !user.emailVerifiedAt) throw new EmailAuthError("EMAIL_ACCOUNT_REQUIRED", 403);
  return user;
}
export async function passkeyEmailAccess(userId: string) {
  try { await passkeyEmailAccount(userId); return { canManage: true, emailAvailable: emailDeliveryAvailable() }; }
  catch (error) { if (error instanceof EmailAuthError) return { canManage: false, emailAvailable: false }; throw error; }
}
export async function requestPasskeyEmailCode(userId: string, action: "add" | "remove", binding: string, origin: string, previousToken?: string) {
  const user = await passkeyEmailAccount(userId);
  if (action === "remove" && !await db.passkey.findFirst({ where: { id: binding, userId, revokedAt: null } })) throw new EmailAuthError("PASSKEY_NOT_FOUND", 404);
  return requestEmailCode({ email: user.email!, userId, purpose: action === "add" ? "PASSKEY_ADD" : "PASSKEY_REMOVE", binding, origin }, previousToken);
}
export async function confirmPasskeyEmail(userId: string, action: "add" | "remove", binding: string, proof: EmailProof, origin: string) {
  const saved = await consumeEmailCode(proof, { userId, purpose: action === "add" ? "PASSKEY_ADD" : "PASSKEY_REMOVE", binding, origin });
  const user = await passkeyEmailAccount(userId);
  if (user.email!.toLowerCase() !== saved.email) throw new EmailAuthError("EMAIL_CODE_INVALID");
  return user;
}
export const passkeyAccountVersion = (user: { email: string | null; emailVerifiedAt: Date | null; passwordHash: string }) =>
  emailDigest(JSON.stringify([user.email, user.emailVerifiedAt, user.passwordHash]));

export function demoSignInAvailable() { return !publicPilotRequested() && isParticipationCreditSandbox() && process.env.NODE_ENV !== "production"; }
export async function signInToDemo(persona: DemoPersona = "participant") {
  if (!demoSignInAvailable()) throw new EmailAuthError("DEMO_UNAVAILABLE", 404);
  if (persona !== "participant") throw new EmailAuthError("COMMITTEE_ADMIN_REQUIRED", 403);
  const id = DEMO_USER_IDS[persona];
  if (!id) throw new EmailAuthError("DEMO_UNAVAILABLE", 404);
  const user = await db.user.findUnique({ where: { id } });
  if (!user || user.status !== "ACTIVE" || user.role !== "USER") throw new EmailAuthError("DEMO_UNAVAILABLE", 404);
  if (persona === "participant" && await db.communityMembership.findFirst({ where: { userId: id, status: "ACTIVE" }, select: { id: true } })) {
    throw new EmailAuthError("DEMO_UNAVAILABLE", 404);
  }
  return { subjectType: "user" as const, userId: user.id, nick: user.nick, role: user.role };
}
