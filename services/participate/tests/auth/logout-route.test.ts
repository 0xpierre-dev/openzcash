import { beforeEach, describe, expect, it, vi } from "vitest";

const { clearSessionCookieMock } = vi.hoisted(() => ({
  clearSessionCookieMock: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  clearSessionCookie: clearSessionCookieMock
}));

const { clearPreview, clearModeration } = vi.hoisted(() => ({ clearPreview: vi.fn(), clearModeration: vi.fn() }));
vi.mock("@/lib/auth/pilot-moderation-cookie", () => ({ clearPilotModerationToken: clearModeration }));
vi.mock("@/lib/auth/committee-admin-cookie", () => ({ clearCommitteePreviewToken: clearPreview }));

import { POST } from "@/app/api/auth/logout/route";

beforeEach(() => {
  clearSessionCookieMock.mockReset(); clearPreview.mockReset(); clearModeration.mockReset();
});

describe("logout route", () => {
  it("returns a private acknowledgement for embedded sign-out after clearing the cookie", async () => {
    const response = await POST(new Request("http://localhost/api/auth/logout", { method: "POST",
      headers: { origin: "http://localhost", "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ next: "/participate" }) }) as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ redirectTo: "/participate" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(clearSessionCookieMock).toHaveBeenCalledOnce();
    expect(clearPreview).toHaveBeenCalledOnce(); expect(clearModeration).toHaveBeenCalledOnce();
  });
  it("clears the session cookie for trusted same-origin requests", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: {
          origin: "http://localhost"
        }
      }) as never
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/communities");
    expect(clearSessionCookieMock).toHaveBeenCalledOnce();
  });

  it.each(["form", "json"] as const)("returns to the community supplied in a %s request", async (format) => {
    const next = "/communities/preview_orchard#proposals";
    const response = await POST(new Request("http://localhost/api/auth/logout", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": format === "json" ? "application/json" : "application/x-www-form-urlencoded"
      },
      body: format === "json" ? JSON.stringify({ next }) : new URLSearchParams({ next })
    }) as never);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`http://localhost${next}`);
    expect(clearSessionCookieMock).toHaveBeenCalledOnce();
  });

  it.each([
    "https://evil.example/",
    "//evil.example/",
    "/\\evil.example/",
    "/communities\n/preview_orchard",
    "/communities\u0000/preview_orchard",
    "/communities\u007f/preview_orchard"
  ])("uses the community entry for an unsafe return path %j", async (next) => {
    const response = await POST(new Request("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": "application/json" },
      body: JSON.stringify({ next })
    }) as never);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/communities");
    expect(clearSessionCookieMock).toHaveBeenCalledOnce();
  });

  it.each(["{", "null", '{"next":7}'])("still signs out and uses the community entry for invalid JSON input %j", async (body) => {
    const response = await POST(new Request("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": "application/json" },
      body
    }) as never);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/communities");
    expect(clearSessionCookieMock).toHaveBeenCalledOnce();
  });

  it("rejects logout requests from an untrusted origin", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: {
          origin: "https://evil.example"
        }
      }) as never
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "forbidden_origin"
    });
    expect(clearSessionCookieMock).not.toHaveBeenCalled();
  });
});
