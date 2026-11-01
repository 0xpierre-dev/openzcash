import { describe, expect, it } from "vitest";
import { chatParentOrigin, embeddedInvitation, embeddedShellRequest, CHAT_INVITATION_MESSAGE, CHAT_THEME_MESSAGE, CHAT_LEAVE_REQUEST } from "./embedding";

describe("portal invitation boundary", () => {
  const parent = {} as Window;
  const data = { type: CHAT_INVITATION_MESSAGE, kind: "invite", token: "test-invite" };
  const valid = { origin: "https://openzcash.org", source: parent, data };
  it("uses only an explicitly configured valid parent origin", () => {
    expect(chatParentOrigin({ NODE_ENV: "production" })).toBeNull();
    expect(chatParentOrigin({ NODE_ENV: "production", PRIVATE_CHAT_PARENT_ORIGIN: "https://portal.example.org" })).toBe("https://portal.example.org");
    expect(chatParentOrigin({ NODE_ENV: "development", PRIVATE_CHAT_PARENT_ORIGIN: "http://127.0.0.1:3000" })).toBe("http://127.0.0.1:3000");
    for (const value of ["http://external.example", "https://u:p@example.org", "https://example.org/path", "https://example.org?x=1", "https://example.org/#secret", "javascript:alert(1)"]) {
      expect(chatParentOrigin({ NODE_ENV: "production", PRIVATE_CHAT_PARENT_ORIGIN: value })).toBeNull();
    }
  });
  it("accepts only bounded invitations from the exact parent window and origin", () => {
    expect(embeddedInvitation(valid, parent, valid.origin)).toEqual({ kind: "invite", token: "test-invite" });
    for (const event of [
      { ...valid, origin: "https://openzcash.org.evil.example" },
      { ...valid, source: {} as Window },
      { ...valid, data: null },
      { ...valid, data: { ...data, kind: "connect" } },
      { ...valid, data: { ...data, type: "send-message" } },
      { ...valid, data: { ...data, token: "" } },
      { ...valid, data: { ...data, token: "x".repeat(4097) } },
      { ...valid, data: { ...data, alias: "injected" } },
    ]) expect(embeddedInvitation(event, parent, valid.origin)).toBeNull();
  });
  it("accepts only theme values and bounded leave request IDs from the authenticated parent", () => {
    const theme = { ...valid, data: { type: CHAT_THEME_MESSAGE, theme: "dark" } };
    const leave = { ...valid, data: { type: CHAT_LEAVE_REQUEST, id: "request-123" } };
    expect(embeddedShellRequest(theme, parent, valid.origin)).toEqual({ type: "theme", theme: "dark" });
    expect(embeddedShellRequest(leave, parent, valid.origin)).toEqual({ type: "leave", id: "request-123" });
    for (const event of [
      { ...theme, origin: "https://evil.example" }, { ...leave, source: {} as Window },
      { ...theme, data: { ...theme.data, theme: "javascript:alert(1)" } },
      { ...leave, data: { ...leave.data, approved: true } },
      { ...leave, data: { ...leave.data, href: "https://evil.example" } },
      { ...leave, data: { ...leave.data, id: "" } },
      { ...leave, data: { ...leave.data, id: "a".repeat(65) } },
      { ...leave, data: { ...leave.data, type: "connect" } },
    ]) expect(embeddedShellRequest(event, parent, valid.origin)).toBeNull();
  });
});
