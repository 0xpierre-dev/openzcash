// @vitest-environment node
const mocks = vi.hoisted(() => ({ session: vi.fn(), list: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ readSession: mocks.session }));
vi.mock("@/lib/services/discussion-notifications", async original => ({ ...await original<typeof import("@/lib/services/discussion-notifications")>(), readDiscussionNotifications: mocks.list, markDiscussionNotificationsRead: mocks.read }));
import { GET, PATCH } from "@/app/api/account/notifications/route";
import { NotificationError } from "@/lib/services/discussion-notifications";
const origin = "https://participate.example.test";
const url = `${origin}/api/account/notifications?communityId=host`;
const write = (body: unknown, source = origin) => new Request(url, { method: "PATCH", headers: { origin: source, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("APP_BASE_URL", origin); mocks.session.mockResolvedValue({ subjectType: "user", userId: "current-account" }); mocks.list.mockResolvedValue({ items: [], unreadCount: 0, nextCursor: null }); mocks.read.mockResolvedValue({ updated: 1 }); });
afterEach(() => vi.unstubAllEnvs());
it.each([null, { subjectType: "poll_voter_access" }])("requires a personal account for reads and writes", async session => {
  mocks.session.mockResolvedValue(session);
  expect((await GET(new Request(url))).status).toBe(401); expect((await PATCH(write({ ids: ["n1"] }))).status).toBe(401);
  expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
});
it("uses only the session recipient and returns private uncached responses", async () => {
  const response = await GET(new Request(`${url}&userId=someone-else&cursor=n1`));
  expect(mocks.list).toHaveBeenCalledWith("current-account", "host", "n1", false);
  expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(response.headers.get("vary")).toBe("Cookie");
  expect((await PATCH(write({ ids: ["n1"] }))).status).toBe(200);
  expect(mocks.read).toHaveBeenCalledWith("current-account", "host", { ids: ["n1"] }, false);
});
it("rejects cross-origin writes and oversized payloads before service mutation", async () => {
  expect((await PATCH(write({ ids: ["n1"] }, "https://other.test"))).status).toBe(403);
  expect((await PATCH(write({ ids: ["x".repeat(20000)] }))).status).toBe(413);
  expect(mocks.read).not.toHaveBeenCalled();
});
it("returns controlled errors without private database details", async () => {
  mocks.list.mockRejectedValueOnce(new NotificationError("ACCOUNT_UNAVAILABLE", 403));
  expect((await GET(new Request(url))).status).toBe(403);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.list.mockRejectedValueOnce(new Error("secret database connection"));
  const response = await GET(new Request(url));
  expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "NOTIFICATIONS_UNAVAILABLE" });
  expect(log).toHaveBeenCalledWith("discussion_notifications_unavailable"); log.mockRestore();
});

it("includes proposal arrivals only for clients that understand the new type", async () => {
  expect((await GET(new Request(`${url}&include=proposals`))).status).toBe(200);
  expect(mocks.list).toHaveBeenCalledWith("current-account", "host", undefined, true);
  expect((await PATCH(new Request(`${url}&include=proposals`, { method: "PATCH", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ ids: ["arrival"] }) }))).status).toBe(200);
  expect(mocks.read).toHaveBeenCalledWith("current-account", "host", { ids: ["arrival"] }, true);
});
