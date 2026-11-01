// @vitest-environment node
const mocks = vi.hoisted(() => ({ readSession: vi.fn(), createDecisionRound: vi.fn(), readSignedDecisions: vi.fn(), beginDecisionSignature: vi.fn(), finishDecisionSignature: vi.fn(), readPublishedDecisionReceipt: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ readSession: mocks.readSession }));
vi.mock("@/lib/services/signed-decisions", () => mocks);
import { GET as list, POST as create } from "@/app/api/communities/[communityId]/archives/[recordId]/decisions/route";
import { GET as download, POST as sign } from "@/app/api/communities/[communityId]/archives/[recordId]/decisions/[roundId]/route";
import { PasskeyError } from "@/lib/auth/passkey-policy";
const ctx = { params: Promise.resolve({ communityId: "host", recordId: "record", roundId: "8a059ca2-36ce-4903-8eb1-758dc5fcb4a8" }) };
const credential = { id: "abc", rawId: "abc", type: "public-key", clientExtensionResults: {}, response: { clientDataJSON: "abc", authenticatorData: "abc", signature: "abc", userHandle: null } };
const request = (body = {}, origin = "http://localhost:4411") => new Request("http://localhost:4411/api/test", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("PASSKEY_ORIGIN", undefined); mocks.readSession.mockResolvedValue({ subjectType: "user", userId: "account-1", role: "USER" }); mocks.readSignedDecisions.mockResolvedValue({ round: null }); mocks.beginDecisionSignature.mockResolvedValue({}); mocks.finishDecisionSignature.mockResolvedValue({}); });
afterEach(() => vi.unstubAllEnvs());
it("reads public review status without signing in and marks capability responses private", async () => {
  mocks.readSession.mockResolvedValue(null);
  const response = await list(new Request("http://localhost:4411/api/test?revision=1"), ctx);
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.readSignedDecisions).toHaveBeenCalledWith("host", "record", 1, undefined, expect.any(Object));
});
it.each([null, { subjectType: "poll_voter_access", userId: "" }])("rejects anonymous and invitation mutations", async session => {
  mocks.readSession.mockResolvedValue(session);
  expect((await create(request(), ctx)).status).toBe(session ? 403 : 401);
  expect((await sign(request({ action: "prepare", choice: "APPROVE" }), ctx)).status).toBe(session ? 403 : 401);
  expect(mocks.createDecisionRound).not.toHaveBeenCalled(); expect(mocks.beginDecisionSignature).not.toHaveBeenCalled();
});
it("rejects foreign origins and never trusts user IDs in the payload", async () => {
  expect((await create(request({}, "https://evil.example"), ctx)).status).toBe(403);
  expect((await sign(request({ action: "prepare", choice: "APPROVE" }, "https://evil.example"), ctx)).status).toBe(403);
  expect((await sign(request({ action: "prepare", choice: "APPROVE", userId: "other" }), ctx)).status).toBe(400);
  expect(mocks.beginDecisionSignature).not.toHaveBeenCalled();
  await sign(request({ action: "prepare", choice: "APPROVE" }), ctx);
  expect(mocks.beginDecisionSignature).toHaveBeenCalledWith("host", "record", (await ctx.params).roundId, "account-1", { choice: "APPROVE" }, expect.any(Object));
});
it("supports non-discoverable assertions with a null handle and enforces the body limit", async () => {
  const body = { action: "sign", ceremonyId: "82700ca4-aeb9-496b-8077-1b9d688b0907", credential };
  expect((await sign(request(body), ctx)).status).toBe(200);
  expect(mocks.finishDecisionSignature).toHaveBeenCalledTimes(1);
  expect((await sign(request({ ...body, padding: "x".repeat(70000) }), ctx)).status).toBe(413);
  expect(mocks.finishDecisionSignature).toHaveBeenCalledTimes(1);
});
it("sanitizes errors and downloads receipts without requiring an account", async () => {
  mocks.createDecisionRound.mockRejectedValue(new Error("private database detail"));
  expect(await (await create(request(), ctx)).json()).toEqual({ error: "DECISION_UNAVAILABLE" });
  mocks.readSession.mockResolvedValue(null); mocks.readPublishedDecisionReceipt.mockResolvedValue({ schema: "public-fixture" });
  const response = await download(new Request("http://localhost:4411/api/test"), ctx);
  expect(response.status).toBe(200); expect(response.headers.get("content-disposition")).toContain("attachment");
  expect(response.headers.get("x-receipt-sha256")).toMatch(/^[a-f0-9]{64}$/);
  mocks.readPublishedDecisionReceipt.mockRejectedValue(new PasskeyError("DECISION_NOT_FOUND", 404));
  expect((await download(new Request("http://localhost:4411/api/test"), ctx)).status).toBe(404);
});

it("refuses a public receipt before all five committee responses", async () => {
  mocks.readPublishedDecisionReceipt.mockRejectedValue(new PasskeyError("DECISION_NOT_PUBLISHED", 409));
  const response = await download(new Request("http://localhost:4411/api/test"), ctx);
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "DECISION_NOT_PUBLISHED" });
});
