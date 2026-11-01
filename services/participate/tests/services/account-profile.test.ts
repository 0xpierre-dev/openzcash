// @vitest-environment node
import sharp from "sharp";
import { Prisma } from "@prisma/client";
import type { AccountProfileUpdate } from "@/lib/domain/account-profile";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), updateMany: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { user: { findFirst: mocks.findFirst }, $transaction: mocks.transaction } }));

import { readAccountProfile, sanitizeAccountAvatar, updateAccountProfile } from "@/lib/services/account-profile";
import { MAX_AVATAR_UPLOAD_BYTES } from "@/lib/domain/account-profile";

const initial = { nick: "alice", displayName: null as string | null, avatarUrl: "data:image/webp;base64,existing" as string | null, shareProfileInDiscussion: false };
const input = { displayName: "  Alice Example  ", shareProfileInDiscussion: true };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findFirst.mockResolvedValue(initial);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(async callback => callback({ user: { findFirst: mocks.findFirst, updateMany: mocks.updateMany } }));
});

describe("private account profile", () => {
  it("selects only the authenticated active account's profile fields", async () => {
    expect(await readAccountProfile("alice-id")).toEqual(initial);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "alice-id", status: "ACTIVE" },
      select: { nick: true, displayName: true, avatarUrl: true, shareProfileInDiscussion: true }
    });
  });

  it("scopes writes to that active account and preserves nick, credentials and the existing avatar", async () => {
    await updateAccountProfile("alice-id", input);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "alice-id", status: "ACTIVE" },
      data: { displayName: "Alice Example", shareProfileInDiscussion: true }
    });
    expect(mocks.findFirst.mock.calls.every(([query]) => query.where.id === "alice-id")).toBe(true);
  });

  it("clears a blank name and explicitly removes the avatar without changing the login identity", async () => {
    await updateAccountProfile("alice-id", { displayName: "  ", shareProfileInDiscussion: false, removeAvatar: true });
    expect(mocks.updateMany.mock.calls[0][0].data).toEqual({ displayName: null, shareProfileInDiscussion: false, avatarUrl: null });
  });

  it("saves a new public username on the authenticated account and returns the stored value", async () => {
    const saved = { ...initial, nick: "alice.community", displayName: "Alice Example", shareProfileInDiscussion: true };
    mocks.findFirst.mockReset().mockResolvedValueOnce(initial).mockResolvedValueOnce(null).mockResolvedValueOnce(saved);
    expect(await updateAccountProfile("alice-id", { ...input, username: " Alice.Community " })).toEqual(saved);
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { id: { not: "alice-id" }, nick: { equals: "alice.community", mode: "insensitive" } }, select: { id: true } });
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: "alice-id", status: "ACTIVE" }, data: { nick: "alice.community", displayName: "Alice Example", shareProfileInDiscussion: true } });
  });

  it("rejects an occupied username and handles a concurrent uniqueness conflict", async () => {
    mocks.findFirst.mockReset().mockResolvedValueOnce(initial).mockResolvedValueOnce({ id: "other-user" });
    await expect(updateAccountProfile("alice-id", { ...input, username: "Taken.Name" })).rejects.toMatchObject({ status: 409, code: "USERNAME_TAKEN" });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    mocks.findFirst.mockReset().mockResolvedValueOnce(initial).mockResolvedValueOnce(null);
    mocks.updateMany.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("Duplicate username", { code: "P2002", clientVersion: "test" }));
    await expect(updateAccountProfile("alice-id", { ...input, username: "new-name" })).rejects.toMatchObject({ status: 409, code: "USERNAME_TAKEN" });
  });

  it.each(["", "ab", "bad name", "-leading", "trailing-", "a".repeat(31), "admin", "OpenZcash"])("rejects an invalid or reserved username %j", async username => {
    await expect(updateAccountProfile("alice-id", { ...input, username })).rejects.toMatchObject({ status: 400 });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    { ...input, displayName: "a".repeat(61) },
    { ...input, displayName: "Alice\nAdministrator" },
    { ...input, shareProfileInDiscussion: "true" },
    { ...input, nick: "administrator" },
    { ...input, userId: "bob-id" },
    { ...input, avatarUrl: "https://tracking.example/avatar" },
    { ...input, avatar: { bytes: new Uint8Array([1]), mimeType: "image/png" }, removeAvatar: true }
  ])("rejects invalid or extra profile fields before writing %j", async invalid => {
    await expect(updateAccountProfile("alice-id", invalid as unknown as AccountProfileUpdate)).rejects.toMatchObject({ status: 400, code: "INVALID_PROFILE_INPUT" });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("refuses missing or disabled accounts, including an account disabled before the update", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await expect(updateAccountProfile("alice-id", input)).rejects.toMatchObject({ status: 403, code: "ACCOUNT_UNAVAILABLE" });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    mocks.findFirst.mockResolvedValue(initial);
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(updateAccountProfile("alice-id", input)).rejects.toMatchObject({ status: 403, code: "ACCOUNT_UNAVAILABLE" });
  });
});

describe("sanitized avatar storage", () => {
  it.each([ ["png", "image/png"], ["jpeg", "image/jpeg"], ["webp", "image/webp"] ] as const)("decodes an actual %s upload and stores a bounded metadata-free WebP", async (format, mimeType) => {
    const bytes = await sharp({ create: { width: 512, height: 300, channels: 3, background: "#237c70" } }).withMetadata({ orientation: 6 }).toFormat(format).toBuffer();
    const url = await sanitizeAccountAvatar({ bytes, mimeType });
    expect(url).toMatch(/^data:image\/webp;base64,/);
    const output = Buffer.from(url.split(",")[1], "base64");
    const metadata = await sharp(output).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBeLessThanOrEqual(256);
    expect(metadata.height).toBeLessThanOrEqual(256);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
    expect(output.length).toBeLessThanOrEqual(128 * 1024);
  });

  it("rejects malformed images, disallowed formats and a MIME type that disagrees with decoded content", async () => {
    const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } }).jpeg().toBuffer();
    for (const avatar of [
      { bytes: Buffer.from("not an image"), mimeType: "image/png" },
      { bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), mimeType: "image/svg+xml" },
      { bytes: jpeg, mimeType: "image/png" }
    ]) {
      await expect(sanitizeAccountAvatar(avatar)).rejects.toMatchObject({ status: 400, code: "INVALID_AVATAR" });
    }
  });

  it("rejects byte and decoded pixel limits before any stored profile change", async () => {
    await expect(updateAccountProfile("alice-id", { ...input, avatar: { bytes: new Uint8Array(MAX_AVATAR_UPLOAD_BYTES + 1), mimeType: "image/png" } })).rejects.toMatchObject({ status: 413, code: "AVATAR_TOO_LARGE" });
    const pixels = await sharp({ create: { width: 4001, height: 4000, channels: 3, background: "red" } }).png().toBuffer();
    await expect(updateAccountProfile("alice-id", { ...input, avatar: { bytes: pixels, mimeType: "image/png" } })).rejects.toMatchObject({ status: 400, code: "INVALID_AVATAR" });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("persists the server-reencoded image instead of client-controlled image content", async () => {
    const avatar = { bytes: await sharp({ create: { width: 8, height: 8, channels: 3, background: "blue" } }).png().toBuffer(), mimeType: "image/png" };
    await updateAccountProfile("alice-id", { ...input, avatar });
    const stored = mocks.updateMany.mock.calls[0][0].data.avatarUrl;
    expect(stored).toMatch(/^data:image\/webp;base64,/);
    expect((await sharp(Buffer.from(stored.split(",")[1], "base64")).metadata()).format).toBe("webp");
  });
});
