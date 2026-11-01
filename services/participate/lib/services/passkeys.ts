import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  generateAuthenticationOptions, generateRegistrationOptions,
  verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON
} from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { confirmPasskeyEmail, passkeyEmailAccount, passkeyAccountVersion, type EmailProof } from "@/lib/services/email-auth";
import { PasskeyError, PASSKEY_TTL_SECONDS, type PasskeyContext } from "@/lib/auth/passkey-policy";
import { consumeRecentPasskeyEmail, type RecentPasskeyEmailProof } from "@/lib/services/passkey-enrollment";

const MAX_PASSKEYS = 10;
const ALGORITHMS = [-7, -257]; // ES256 and RS256; identical at options and verification.
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const metadata = { id: true, label: true, createdAt: true, lastUsedAt: true } as const;

async function activeUser(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "ACTIVE") throw new PasskeyError("unauthorized", 401);
  return user;
}

async function lockUser(tx: Prisma.TransactionClient, userId: string) {
  const lock = await tx.user.updateMany({ where: { id: userId, status: "ACTIVE" }, data: { id: userId } });
  if (lock.count !== 1) throw new PasskeyError("unauthorized", 401);
  return tx.user.findUniqueOrThrow({ where: { id: userId } });
}

async function claimAttempt(id: string, limit: number, windowMs: number) {
  const now = new Date();
  await db.passkeyThrottle.updateMany({ where: { id, resetsAt: { lte: now } }, data: { attempts: 0, resetsAt: new Date(+now + windowMs) } });
  const throttle = await db.passkeyThrottle.upsert({
    where: { id },
    create: { id, attempts: 1, resetsAt: new Date(+now + windowMs) },
    update: { attempts: { increment: 1 } }
  });
  if (throttle.attempts > limit) throw new PasskeyError("PASSKEY_RATE_LIMITED", 429);
}

async function rememberChallenge(input: Omit<Prisma.PasskeyChallengeCreateInput, "id" | "expiresAt">, previousToken?: string) {
  const token = randomBytes(32).toString("base64url");
  // Expired ceremonies and this browser's replaced ceremony cannot be replayed.
  await db.passkeyChallenge.deleteMany({ where: { OR: [
    { expiresAt: { lte: new Date() } },
    ...(previousToken ? [{ id: digest(previousToken) }] : [])
  ] } });
  await db.passkeyChallenge.create({ data: {
    ...input, id: digest(token), expiresAt: new Date(Date.now() + PASSKEY_TTL_SECONDS * 1000)
  } });
  return token;
}

async function takeChallenge(token: string | undefined, purpose: string | string[], context: PasskeyContext, userId?: string) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new PasskeyError("PASSKEY_EXPIRED");
  const id = digest(token);
  const saved = await db.passkeyChallenge.findUnique({ where: { id } });
  // Atomic claim before verification. Even failed attempts consume the challenge.
  const claimed = await db.passkeyChallenge.deleteMany({ where: { id } });
  if (!saved || claimed.count !== 1 || saved.expiresAt <= new Date() || !(Array.isArray(purpose) ? purpose : [purpose]).includes(saved.purpose) ||
      saved.origin !== context.origin || saved.rpId !== context.rpId || (userId && saved.userId !== userId)) {
    throw new PasskeyError("PASSKEY_EXPIRED");
  }
  return saved;
}

function requireTopLevel(response: RegistrationResponseJSON | AuthenticationResponseJSON) {
  try {
    const client = JSON.parse(Buffer.from(response.response.clientDataJSON, "base64url").toString("utf8"));
    if (client.crossOrigin === true || client.topOrigin) throw new Error("Cross-origin ceremony");
  } catch { throw new PasskeyError("PASSKEY_INVALID"); }
}

export async function listPasskeys(userId: string, context: PasskeyContext) {
  await activeUser(userId);
  return db.passkey.findMany({ where: { userId, rpId: context.rpId, revokedAt: null }, select: metadata, orderBy: { createdAt: "desc" } });
}

export async function beginPasskeyRegistration(userId: string, input: { code?: string; label: string }, context: PasskeyContext, previousToken?: string, emailToken?: string, recentEmailProof: RecentPasskeyEmailProof = {}) {
  const user = input.code
    ? await confirmPasskeyEmail(userId, "add", input.label, { code: input.code, token: emailToken }, context.origin)
    : await consumeRecentPasskeyEmail(userId, recentEmailProof, context);
  const existing = await db.passkey.findMany({ where: { userId, rpId: context.rpId, revokedAt: null } });
  if (existing.length >= MAX_PASSKEYS) throw new PasskeyError("PASSKEY_LIMIT");
  const options = await generateRegistrationOptions({
    rpName: "Participate", rpID: context.rpId, userName: user.nick, userDisplayName: user.displayName || user.nick,
    attestationType: "none", timeout: 60_000, supportedAlgorithmIDs: ALGORITHMS,
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
    excludeCredentials: existing.map(key => ({ id: key.credentialId, transports: key.transports }))
  });
  const token = await rememberChallenge({
    purpose: input.code ? "REGISTER" : "REGISTER_FIRST", ...context, challenge: options.challenge,
    userId, userHandle: options.user.id, passwordVersion: passkeyAccountVersion(user), label: input.label
  }, previousToken);
  return { options, token };
}

export async function finishPasskeyRegistration(userId: string, token: string | undefined, response: RegistrationResponseJSON, context: PasskeyContext) {
  await passkeyEmailAccount(userId);
  const challenge = await takeChallenge(token, ["REGISTER", "REGISTER_FIRST"], context, userId);
  requireTopLevel(response);
  const verification = await verifyRegistrationResponse({
    response, expectedChallenge: challenge.challenge, expectedOrigin: context.origin, expectedRPID: context.rpId,
    requireUserVerification: true, requireUserPresence: true, supportedAlgorithmIDs: ALGORITHMS
  }).catch(() => { throw new PasskeyError("PASSKEY_INVALID"); });
  if (!verification.verified || !challenge.userHandle || verification.registrationInfo.credential.id !== response.id) {
    throw new PasskeyError("PASSKEY_INVALID");
  }
  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  return db.$transaction(async tx => {
    const user = await lockUser(tx, userId);
    if (passkeyAccountVersion(user) !== challenge.passwordVersion) throw new PasskeyError("PASSKEY_EXPIRED");
    if (challenge.purpose === "REGISTER_FIRST" && await tx.passkey.count({ where: { userId, rpId: context.rpId } })) {
      throw new PasskeyError("PASSKEY_EMAIL_CONFIRMATION_REQUIRED", 403);
    }
    if (await tx.passkey.count({ where: { userId, rpId: context.rpId, revokedAt: null } }) >= MAX_PASSKEYS) throw new PasskeyError("PASSKEY_LIMIT");
    if (await tx.passkey.findUnique({ where: { credentialId: credential.id } })) throw new PasskeyError("PASSKEY_EXISTS", 409);
    return tx.passkey.create({ data: {
      credentialId: credential.id, userId, userHandle: challenge.userHandle!, rpId: context.rpId,
      publicKey: credential.publicKey, counter: BigInt(credential.counter), transports: credential.transports ?? [],
      deviceType: credentialDeviceType, backedUp: credentialBackedUp, label: challenge.label || "Passkey"
    }, select: metadata });
  });
}

export async function beginPasskeyAuthentication(context: PasskeyContext, previousToken?: string) {
  // A shared cap bounds anonymous challenge creation without retaining IPs.
  // Deployments should additionally rate-limit traffic at their trusted edge.
  await claimAttempt(`authentication:${context.rpId}`, 500, 60_000);
  // Discoverable login: never disclose an account's credential IDs or existence.
  const options = await generateAuthenticationOptions({ rpID: context.rpId, timeout: 60_000, userVerification: "required" });
  const token = await rememberChallenge({ purpose: "AUTHENTICATE", ...context, challenge: options.challenge }, previousToken);
  return { options, token };
}

export async function finishPasskeyAuthentication(token: string | undefined, response: AuthenticationResponseJSON, context: PasskeyContext) {
  const challenge = await takeChallenge(token, "AUTHENTICATE", context);
  requireTopLevel(response);
  const key = await db.passkey.findUnique({ where: { credentialId: response.id } });
  if (!key || key.revokedAt || key.rpId !== context.rpId || response.response.userHandle !== key.userHandle) {
    throw new PasskeyError("PASSKEY_INVALID", 401);
  }
  await passkeyEmailAccount(key.userId);
  const verification = await verifyAuthenticationResponse({
    response, expectedChallenge: challenge.challenge, expectedOrigin: context.origin, expectedRPID: context.rpId,
    requireUserVerification: true,
    credential: { id: key.credentialId, publicKey: new Uint8Array(key.publicKey), counter: Number(key.counter) }
  }).catch(() => { throw new PasskeyError("PASSKEY_INVALID", 401); });
  if (!verification.verified) throw new PasskeyError("PASSKEY_INVALID", 401);
  return db.$transaction(async tx => {
    const user = await lockUser(tx, key.userId);
    const updated = await tx.passkey.updateMany({
      where: { id: key.id, userId: user.id, revokedAt: null, counter: key.counter },
      data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date(), backedUp: verification.authenticationInfo.credentialBackedUp }
    });
    if (updated.count !== 1) throw new PasskeyError("PASSKEY_INVALID", 401);
    return { subjectType: "user" as const, userId: user.id, nick: user.nick, role: user.role };
  });
}

export async function revokePasskey(userId: string, id: string, proof: EmailProof, context: PasskeyContext) {
  const confirmed = await confirmPasskeyEmail(userId, "remove", id, proof, context.origin);
  await db.$transaction(async tx => {
    const user = await lockUser(tx, userId);
    if (passkeyAccountVersion(user) !== passkeyAccountVersion(confirmed)) throw new PasskeyError("PASSKEY_EXPIRED");
    const changed = await tx.passkey.updateMany({ where: { id, userId, rpId: context.rpId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (changed.count !== 1) throw new PasskeyError("PASSKEY_NOT_FOUND", 404);
  });
}
