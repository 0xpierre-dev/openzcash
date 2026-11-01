// @vitest-environment node
import { AccountProfileError } from "@/lib/services/account-profile";
import { MAX_ACCOUNT_SETTINGS_BODY_BYTES, MAX_AVATAR_UPLOAD_BYTES } from "@/lib/domain/account-profile";

const mocks = vi.hoisted(() => ({ session: vi.fn(), read: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ readSession: mocks.session }));
vi.mock("@/lib/services/account-profile", async importOriginal => {
  const original = await importOriginal<typeof import("@/lib/services/account-profile")>();
  return { ...original, readAccountProfile: mocks.read, updateAccountProfile: mocks.update };
});

import { GET, PATCH } from "@/app/api/account/settings/route";

const profile = { nick: "alice", displayName: "Alice", avatarUrl: null, shareProfileInDiscussion: false };
function form() {
  const data = new FormData();
  data.set("displayName", "Alice");
  data.set("shareProfileInDiscussion", "false");
  return data;
}
function request(body: FormData = form(), origin: string | null = "http://localhost") {
  return new Request("http://localhost/api/account/settings", { method: "PATCH", body, headers: origin ? { origin } : {} });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ subjectType: "user", userId: "alice-id", nick: "alice", role: "USER" });
  mocks.read.mockResolvedValue(profile);
  mocks.update.mockResolvedValue(profile);
});

describe("account settings API", () => {
  it("returns only the session user's profile with private cache controls", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ profile });
    expect(mocks.read).toHaveBeenCalledWith("alice-id");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
  });

  it("passes multipart settings only to the authenticated actor, regardless of query parameters", async () => {
    const data = form();
    data.set("removeAvatar", "true");
    const response = await PATCH(new Request("http://localhost/api/account/settings?userId=bob-id", { method: "PATCH", body: data, headers: { origin: "http://localhost" } }));
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith("alice-id", { displayName: "Alice", shareProfileInDiscussion: false, removeAvatar: true });
    expect(await response.json()).toEqual({ profile });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("accepts a username edit without accepting a client-supplied account ID", async () => {
    const data = form();
    data.set("username", "alice.community");
    const response = await PATCH(request(data));
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith("alice-id", { displayName: "Alice", username: "alice.community", shareProfileInDiscussion: false });
  });

  it.each([ [null, 401], [{ subjectType: "poll_voter_access", pollVoterAccessId: "guest", role: "VOTER_TEMP" }, 403] ])("rejects unsigned and temporary sessions before reading uploads", async (session, status) => {
    mocks.session.mockResolvedValue(session);
    const get = await GET();
    const patch = await PATCH(request());
    expect(get.status).toBe(status);
    expect(patch.status).toBe(status);
    expect(get.headers.get("cache-control")).toBe("private, no-store");
    expect(patch.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each(["https://other.example", null])("rejects a foreign or missing write origin before session and database access", async origin => {
    const response = await PATCH(request(form(), origin));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden_origin" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each(["unknown", "userId", "nick", "avatarUrl"]) ("rejects extra multipart field %s instead of permitting account targeting", async field => {
    const data = form();
    data.set(field, "bob-id");
    expect((await PATCH(request(data))).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects duplicated fields, missing privacy choice, invalid booleans and simultaneous upload/removal", async () => {
    const duplicate = form(); duplicate.append("displayName", "Other name");
    const missing = form(); missing.delete("shareProfileInDiscussion");
    const invalid = form(); invalid.set("shareProfileInDiscussion", "yes");
    const both = form(); both.set("removeAvatar", "true"); both.set("avatar", new Blob(["png"], { type: "image/png" }), "avatar.png");
    for (const data of [duplicate, missing, invalid, both]) expect((await PATCH(request(data))).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("parses upload bytes without allowing a remote avatar URL", async () => {
    const data = form();
    data.set("avatar", new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" }), "avatar.webp");
    expect((await PATCH(request(data))).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith("alice-id", { displayName: "Alice", shareProfileInDiscussion: false, avatar: { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/webp" } });
  });

  it("bounds streamed body size even when Content-Length is missing or dishonest", async () => {
    for (const declaredLength of [null, "1"]) {
      const body = new Uint8Array(MAX_ACCOUNT_SETTINGS_BODY_BYTES + 1);
      const headers = { origin: "http://localhost", "content-type": "multipart/form-data; boundary=test", ...(declaredLength ? { "content-length": declaredLength } : {}) };
      const response = await PATCH(new Request("http://localhost/api/account/settings", { method: "PATCH", headers, body }));
      expect(response.status).toBe(413);
      expect(await response.json()).toMatchObject({ error: "PROFILE_BODY_TOO_LARGE" });
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("limits the individual avatar as well as the complete multipart request", async () => {
    const data = form();
    data.set("avatar", new Blob([new Uint8Array(MAX_AVATAR_UPLOAD_BYTES + 1)], { type: "image/png" }), "large.png");
    const response = await PATCH(request(data));
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: "AVATAR_TOO_LARGE" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("cancels a streaming upload as soon as its cumulative byte limit is exceeded", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
      cancel
    });
    const streaming = new Request("http://localhost/api/account/settings", {
      method: "PATCH", body: stream, duplex: "half",
      headers: { origin: "http://localhost", "content-type": "multipart/form-data; boundary=test", "content-length": "1" }
    } as RequestInit & { duplex: "half" });
    expect((await PATCH(streaming)).status).toBe(413);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects malformed multipart and hides unexpected internal failures", async () => {
    const malformed = new Request("http://localhost/api/account/settings", { method: "PATCH", headers: { origin: "http://localhost", "content-type": "multipart/form-data; boundary=test" }, body: "not multipart" });
    expect((await PATCH(malformed)).status).toBe(400);
    mocks.read.mockRejectedValue(new Error("private database details"));
    const failed = await GET();
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "ACCOUNT_SETTINGS_FAILED" });
    expect(failed.headers.get("cache-control")).toBe("private, no-store");
  });

  it("preserves a disabled-account rejection and sanitized validation errors", async () => {
    mocks.update.mockRejectedValue(new AccountProfileError("An active account is required", 403, "ACCOUNT_UNAVAILABLE"));
    const response = await PATCH(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "ACCOUNT_UNAVAILABLE" });
  });
});
