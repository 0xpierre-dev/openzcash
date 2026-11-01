import sharp from "sharp";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  MAX_AVATAR_DIMENSION, MAX_AVATAR_OUTPUT_BYTES, MAX_AVATAR_PIXELS,
  MAX_AVATAR_UPLOAD_BYTES, type AccountProfile, type AccountProfileUpdate
} from "@/lib/domain/account-profile";

export class AccountProfileError extends Error {
  constructor(message: string, public readonly status: 400 | 403 | 409 | 413, public readonly code: string) {
    super(message);
    this.name = "AccountProfileError";
  }
}

const profileSelection = { nick: true, displayName: true, avatarUrl: true, shareProfileInDiscussion: true } as const;
const updateSchema = z.object({
  displayName: z.string().trim().max(60).refine(value => !/[\u0000-\u001f\u007f]/u.test(value)),
  username: z.string().optional(),
  shareProfileInDiscussion: z.boolean(),
  avatar: z.object({ bytes: z.instanceof(Uint8Array), mimeType: z.string() }).strict().optional(),
  removeAvatar: z.boolean().optional()
}).strict().refine(value => !(value.avatar && value.removeAvatar));
const formats = { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp" } as const;
const usernamePattern = /^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])$/;
const reservedUsernames = new Set(["admin", "administrator", "committee", "help", "moderator", "openzcash", "participate", "security", "support", "system", "zcg"]);

function hasImageSignature(bytes: Uint8Array, format: (typeof formats)[keyof typeof formats]) {
  const prefix = Buffer.from(bytes.subarray(0, 12));
  if (format === "png") return prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (format === "jpeg") return prefix.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  return prefix.subarray(0, 4).toString("ascii") === "RIFF" && prefix.subarray(8, 12).toString("ascii") === "WEBP";
}

function unavailable(): never {
  throw new AccountProfileError("An active account is required", 403, "ACCOUNT_UNAVAILABLE");
}

export async function readAccountProfile(userId: string): Promise<AccountProfile> {
  if (!userId?.trim()) return unavailable();
  const user = await db.user.findFirst({ where: { id: userId, status: "ACTIVE" }, select: profileSelection });
  if (!user) return unavailable();
  return user;
}

export async function sanitizeAccountAvatar(avatar: NonNullable<AccountProfileUpdate["avatar"]>): Promise<string> {
  const format = formats[avatar.mimeType as keyof typeof formats];
  if (!format || !avatar.bytes.length) {
    throw new AccountProfileError("Choose a PNG, JPEG or WebP image", 400, "INVALID_AVATAR");
  }
  if (avatar.bytes.length > MAX_AVATAR_UPLOAD_BYTES) {
    throw new AccountProfileError("Avatar uploads must be at most 2 MB", 413, "AVATAR_TOO_LARGE");
  }
  if (!hasImageSignature(avatar.bytes, format)) {
    throw new AccountProfileError("Choose a PNG, JPEG or WebP image matching its file type", 400, "INVALID_AVATAR");
  }
  try {
    const image = sharp(avatar.bytes, { limitInputPixels: MAX_AVATAR_PIXELS, failOn: "warning", animated: false });
    const metadata = await image.metadata();
    if (metadata.format !== format || !metadata.width || !metadata.height || metadata.width * metadata.height > MAX_AVATAR_PIXELS || (metadata.pages ?? 1) > 1) {
      throw new Error("Unsupported image");
    }
    // Re-encoding strips EXIF, XMP and other metadata. Never retain the uploaded file.
    const output = await image.rotate().resize(MAX_AVATAR_DIMENSION, MAX_AVATAR_DIMENSION, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).timeout({ seconds: 5 }).toBuffer();
    if (output.length > MAX_AVATAR_OUTPUT_BYTES) throw new Error("Output exceeds the avatar limit");
    return `data:image/webp;base64,${output.toString("base64")}`;
  } catch {
    throw new AccountProfileError("Choose a valid static PNG, JPEG or WebP image up to 16 megapixels", 400, "INVALID_AVATAR");
  }
}

export async function updateAccountProfile(userId: string, input: AccountProfileUpdate): Promise<AccountProfile> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) throw new AccountProfileError("Enter a display name of up to 60 characters and a profile privacy choice", 400, "INVALID_PROFILE_INPUT");
  const current = await readAccountProfile(userId);
  const value = parsed.data;
  const username = value.username?.trim().toLowerCase();
  const nextNick = username !== undefined && username !== current.nick.toLowerCase() ? username : undefined;
  if (nextNick !== undefined) {
    if (!usernamePattern.test(nextNick)) throw new AccountProfileError("Use 3–30 letters, numbers, dots, hyphens or underscores for your username", 400, "INVALID_USERNAME");
    if (reservedUsernames.has(nextNick)) throw new AccountProfileError("Choose another username", 400, "RESERVED_USERNAME");
    const taken = await db.user.findFirst({ where: { id: { not: userId }, nick: { equals: nextNick, mode: "insensitive" } }, select: { id: true } });
    if (taken) throw new AccountProfileError("That username is already taken", 409, "USERNAME_TAKEN");
  }
  const avatarUrl = value.avatar ? await sanitizeAccountAvatar(value.avatar) : value.removeAvatar ? null : undefined;
  try {
    return await db.$transaction(async tx => {
      const result = await tx.user.updateMany({
        where: { id: userId, status: "ACTIVE" },
        data: { displayName: value.displayName || null, shareProfileInDiscussion: value.shareProfileInDiscussion, ...(nextNick !== undefined ? { nick: nextNick } : {}), ...(avatarUrl !== undefined ? { avatarUrl } : {}) }
      });
      if (result.count !== 1) return unavailable();
      const user = await tx.user.findFirst({ where: { id: userId, status: "ACTIVE" }, select: profileSelection });
      if (!user) return unavailable();
      return user;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && nextNick !== undefined) {
      throw new AccountProfileError("That username is already taken", 409, "USERNAME_TAKEN");
    }
    throw error;
  }
}
