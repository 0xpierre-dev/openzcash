// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ readSession: vi.fn(), requestDaoMembership: vi.fn(), reviewMembershipRequest: vi.fn(), initializeAccountRoster: vi.fn(), createAccountMembershipProposal: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ readSession: mocks.readSession }));
vi.mock("@/lib/services/account-membership", () => ({ ...mocks, AccountMembershipError: class extends Error { constructor(public code: string, public status: number) { super(code); } } }));
import { POST } from "@/app/api/communities/[communityId]/membership/route";
import { AccountMembershipError } from "@/lib/services/account-membership";
const key = "dc210d2c-50ed-497f-b8d4-d85d54c7239d";
const context = { params: Promise.resolve({ communityId: "alpha" }) };
function request(body: unknown, origin = "http://localhost:4411") { return new NextRequest("http://localhost:4411/api/communities/alpha/membership", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
beforeEach(() => { vi.resetAllMocks(); mocks.readSession.mockResolvedValue({ subjectType: "user", userId: "signed-account", role: "USER" }); });
it("denies foreign-origin writes before session or service access", async () => {
  expect((await POST(request({ operation: "request", requestId: key }, "https://foreign.test"), context)).status).toBe(403);
  expect(mocks.readSession).not.toHaveBeenCalled();
  expect(mocks.requestDaoMembership).not.toHaveBeenCalled();
});
it.each([null, { subjectType: "poll_voter_access", userId: "", role: "VOTER_TEMP" }])("requires a stable user session (%s)", async session => {
  mocks.readSession.mockResolvedValue(session);
  expect((await POST(request({ operation: "request", requestId: key }), context)).status).toBe(403);
  expect(mocks.requestDaoMembership).not.toHaveBeenCalled();
});
it("uses the signed-in account and refuses injected account or role fields", async () => {
  expect((await POST(request({ operation: "request", requestId: key, userId: "other" }), context)).status).toBe(400);
  mocks.requestDaoMembership.mockResolvedValue({ id: key, status: "PENDING" });
  expect((await POST(request({ operation: "request", requestId: key }), context)).status).toBe(200);
  expect(mocks.requestDaoMembership).toHaveBeenCalledExactlyOnceWith("alpha", "signed-account", { requestId: key });
});
it("returns safe validation and unexpected-failure responses", async () => {
  mocks.createAccountMembershipProposal.mockRejectedValue(new Error("database-private-connection"));
  const response = await POST(request({ operation: "propose", proposal: {} }), context);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "MEMBERSHIP_UNAVAILABLE" });
  mocks.createAccountMembershipProposal.mockRejectedValue(new AccountMembershipError("COMMUNITY_NOT_FOUND", 404));
  expect((await POST(request({ operation: "propose", proposal: {} }), context)).status).toBe(404);
});
