import { MAX_ACCOUNT_SETTINGS_BODY_BYTES, MAX_AVATAR_UPLOAD_BYTES, type AccountProfileUpdate } from "@/lib/domain/account-profile";
import { AccountProfileError } from "@/lib/services/account-profile";

function invalid(): never {
  throw new AccountProfileError("Submit a display name, profile privacy choice and optional avatar", 400, "INVALID_PROFILE_INPUT");
}

export async function readAccountProfileForm(request: Request): Promise<AccountProfileUpdate> {
  const contentType = request.headers.get("content-type");
  if (!contentType || !/^multipart\/form-data(?:;|$)/i.test(contentType)) return invalid();
  const declaredLength = Number(request.headers.get("content-length"));
  if (declaredLength > MAX_ACCOUNT_SETTINGS_BODY_BYTES) {
    throw new AccountProfileError("Account settings upload is too large", 413, "PROFILE_BODY_TOO_LARGE");
  }
  if (!request.body) return invalid();
  const reader = request.body.getReader();
  const bytes = new Uint8Array(MAX_ACCOUNT_SETTINGS_BODY_BYTES);
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > MAX_ACCOUNT_SETTINGS_BODY_BYTES - total) {
        await reader.cancel().catch(() => undefined);
        throw new AccountProfileError("Account settings upload is too large", 413, "PROFILE_BODY_TOO_LARGE");
      }
      bytes.set(value, total);
      total += value.byteLength;
    }
  } catch (error) {
    if (error instanceof AccountProfileError) throw error;
    return invalid();
  } finally {
    reader.releaseLock();
  }
  let form: FormData;
  try {
    form = await new Response(bytes.subarray(0, total), { headers: { "content-type": contentType } }).formData();
  } catch {
    return invalid();
  }
  const allowed = new Set(["displayName", "username", "shareProfileInDiscussion", "avatar", "removeAvatar"]);
  for (const key of form.keys()) {
    if (!allowed.has(key) || form.getAll(key).length !== 1) return invalid();
  }
  const displayName = form.get("displayName");
  const username = form.get("username");
  const share = form.get("shareProfileInDiscussion");
  const remove = form.get("removeAvatar");
  const avatar = form.get("avatar");
  if (typeof displayName !== "string" || (username !== null && typeof username !== "string") || (share !== "true" && share !== "false") || (remove !== null && remove !== "true") || (avatar !== null && (typeof avatar === "string" || remove !== null))) return invalid();
  if (avatar && typeof avatar !== "string" && avatar.size > MAX_AVATAR_UPLOAD_BYTES) {
    throw new AccountProfileError("Avatar uploads must be at most 2 MB", 413, "AVATAR_TOO_LARGE");
  }
  return {
    displayName,
    ...(typeof username === "string" ? { username } : {}),
    shareProfileInDiscussion: share === "true",
    ...(remove === "true" ? { removeAvatar: true } : {}),
    ...(avatar && typeof avatar !== "string" ? { avatar: { bytes: new Uint8Array(await avatar.arrayBuffer()), mimeType: avatar.type } } : {})
  };
}
