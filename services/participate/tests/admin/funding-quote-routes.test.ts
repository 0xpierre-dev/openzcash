import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(), read: vi.fn(), create: vi.fn(),
  QuoteError: class extends Error {
    constructor(message: string, public status: number, public code: string) { super(message); }
  }
}));
vi.mock("@/lib/auth/session", () => ({ readSession: mocks.session }));
vi.mock("@/lib/services/funding-quotes", () => ({ readFundingQuotes: mocks.read, createFundingQuote: mocks.create, FundingQuoteError: mocks.QuoteError }));
import { GET, POST } from "@/app/api/admin/communities/[communityId]/proposals/[pollId]/funding-quotes/route";

const ctx = { params: Promise.resolve({ communityId: "dao-a", pollId: "poll-a" }) };
const request = (origin: string | null = "http://localhost", body = "{}") => new Request("http://localhost/api/quotes", {
  method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body
});
beforeEach(() => {
  vi.clearAllMocks(); mocks.session.mockResolvedValue({ subjectType: "user", userId: "owner" });
});
describe("funding quote API", () => {
  it.each([null, { subjectType: "poll_voter_access" }])("rejects guests and voting invitations", async (session) => {
    mocks.session.mockResolvedValue(session);
    expect((await GET(new Request("http://localhost"), ctx)).status).toBe(401);
    expect((await POST(request(), ctx)).status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each([null, "https://foreign.example"])("rejects missing or cross-site origins before provider access", async (origin) => {
    expect((await POST(request(origin), ctx)).status).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("scopes the authenticated actor and returns private history and idempotent statuses", async () => {
    mocks.read.mockResolvedValue({ quotes: [] });
    const response = await GET(new Request("http://localhost"), ctx);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.read).toHaveBeenCalledWith("dao-a", "poll-a", "owner");
    mocks.create.mockResolvedValueOnce({ quote: { amountZat: "33333334" }, replayed: false }).mockResolvedValueOnce({ replayed: true });
    expect((await POST(request(), ctx)).status).toBe(201);
    expect((await POST(request(), ctx)).status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith("dao-a", "poll-a", "owner", {});
  });
  it("rejects oversized or malformed bodies and keeps internal error details private", async () => {
    expect((await POST(request("http://localhost", "x".repeat(513)), ctx)).status).toBe(400);
    expect((await POST(request("http://localhost", "{"), ctx)).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
    mocks.create.mockRejectedValue(new Error("database-secret"));
    const response = await POST(request(), ctx);
    expect(response.status).toBe(500); expect(JSON.stringify(await response.json())).not.toContain("database-secret");
  });
  it.each([404, 409, 429, 503])("preserves expected failure status %s", async (status) => {
    mocks.create.mockRejectedValue(new mocks.QuoteError("Try later", status, "EXPECTED"));
    expect((await POST(request(), ctx)).status).toBe(status);
  });
});
