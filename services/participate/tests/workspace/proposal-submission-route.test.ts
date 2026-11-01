// @vitest-environment node
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ session: vi.fn(), save: vi.fn(), publish: vi.fn(), list: vi.fn(), remove: vi.fn(), abandon: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ readSession: mocks.session }));
vi.mock("@/lib/services/proposal-submissions", () => ({
  saveProposalSubmission: mocks.save, publishProposalSubmission: mocks.publish, listOwnSubmissions: mocks.list,
  deleteProposalDraft: mocks.remove, abandonProposalSubmission: mocks.abandon,
  ProposalSubmissionError: class extends Error { constructor(public code: string, public status = 400) { super(code); } }
}));
const { GET, PUT, POST, DELETE, PATCH } = await import("@/app/api/participate/proposals/route");
const url = "http://localhost:4411/api/participate/proposals";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("PARTICIPATE_COMMUNITY_ID", "host"); mocks.session.mockResolvedValue({ subjectType: "user", userId: "author" }); });
afterEach(() => vi.unstubAllEnvs());

it("rejects guests, temporary voters and cross-origin mutations", async () => {
  expect((await PUT(new NextRequest(url, { method: "PUT", headers: { origin: "https://untrusted.invalid" }, body: "{}" }))).status).toBe(403);
  for (const session of [null, { subjectType: "poll_voter_access", userId: "" }]) {
    mocks.session.mockResolvedValue(session);
    expect((await GET(new NextRequest(url))).status).toBe(401);
    expect((await POST(new NextRequest(url, { method: "POST", headers: { origin: "http://localhost:4411" }, body: "{}" }))).status).toBe(401);
  }
  expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.publish).not.toHaveBeenCalled();
});
it("uses the server host and authenticated author, and makes private reads uncacheable", async () => {
  mocks.list.mockResolvedValue([]);
  const read = await GET(new NextRequest(url + "?authorId=other&communityId=other"));
  expect(read.headers.get("Cache-Control")).toBe("private, no-store");
  expect(mocks.list).toHaveBeenCalledWith("host", "author");
  mocks.save.mockResolvedValue({ id: "draft" });
  await PUT(new NextRequest(url, { method: "PUT", headers: { origin: "http://localhost:4411" }, body: JSON.stringify({ payload: { title: "Draft" } }) }));
  expect(mocks.save).toHaveBeenCalledWith("host", "author", { payload: { title: "Draft" } });
});
it("rejects oversized streamed bodies without trusting the length header", async () => {
  const response = await PUT(new NextRequest(url, { method: "PUT", headers: { origin: "http://localhost:4411" }, body: "a".repeat(180001) }));
  expect(response.status).toBe(413);
  expect(mocks.save).not.toHaveBeenCalled();
});
it("fails closed without configuration and masks internal errors", async () => {
  vi.stubEnv("PARTICIPATE_COMMUNITY_ID", "");
  expect((await GET(new NextRequest(url))).status).toBe(503);
  vi.stubEnv("PARTICIPATE_COMMUNITY_ID", "host");
  mocks.list.mockRejectedValue(new Error("private database details"));
  const response = await GET(new NextRequest(url));
  expect(await response.text()).not.toContain("private database");
  expect(response.status).toBe(500);
});
it.each([["DELETE", DELETE, mocks.remove], ["PATCH", PATCH, mocks.abandon]] as const)("protects %s with origin and author session, and does not accept caller scope", async (method, handler, service) => {
  const request = (origin: string) => new NextRequest(url + "?authorId=other&communityId=other", { method, headers: { origin }, body: JSON.stringify({ id: "proposal", consent: true }) });
  expect((await handler(request("https://untrusted.invalid"))).status).toBe(403);
  expect(service).not.toHaveBeenCalled();
  mocks.session.mockResolvedValue(null);
  expect((await handler(request("http://localhost:4411"))).status).toBe(401);
  mocks.session.mockResolvedValue({ subjectType: "user", userId: "author" });
  service.mockResolvedValue({ ok: true });
  const response = await handler(request("http://localhost:4411"));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(service).toHaveBeenCalledWith("host", "author", { id: "proposal", consent: true });
});
