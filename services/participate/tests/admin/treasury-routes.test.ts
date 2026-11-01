import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), read: vi.fn(), fund: vi.fn(), allocate: vi.fn(),
  TreasuryError: class extends Error {
    constructor(message: string, public readonly status: 400 | 403 | 404 | 409, public readonly code: string) { super(message); }
  }
}));
vi.mock("@/lib/auth/session", () => ({ readSession: mocks.session }));
vi.mock("@/lib/services/treasuries", () => ({
  readCommunityTreasuries: mocks.read,
  recordTreasuryFunding: mocks.fund,
  allocateTreasuryFunds: mocks.allocate,
  TreasuryServiceError: mocks.TreasuryError
}));

import { GET } from "@/app/api/admin/communities/[communityId]/treasuries/route";
import { POST as fund } from "@/app/api/admin/communities/[communityId]/treasuries/funding/route";
import { POST as allocate } from "@/app/api/admin/communities/[communityId]/treasuries/allocations/route";

const context = { params: Promise.resolve({ communityId: "community_a" }) };
const input = { treasuryKind: "COMMUNITY", amountZec: "1.00000001", fundingSource: "Approved budget", reason: "Opening funding", idempotencyKey: "00000000-0000-4000-8000-000000000001" };
const request = (body: unknown = input, origin: string | null = "http://localhost") => new Request("http://localhost/api/admin/communities/community_a/treasuries/funding", {
  method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(body)
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ subjectType: "user", userId: "user_a", role: "ADMIN" });
});

describe("treasury API boundaries", () => {
  it("returns the service's scoped JSON-safe view with private cache controls", async () => {
    const view = { communityId: "community_a", canManage: false, funds: [{ availableZat: "100000001" }] };
    mocks.read.mockResolvedValue(view);
    const response = await GET(new Request("http://localhost"), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ treasuries: view });
    expect(mocks.read).toHaveBeenCalledWith("community_a", "user_a");
  });

  it.each([null, { subjectType: "poll_voter_access", role: "VOTER_TEMP" }])("requires a permanent user for reads and both writes", async (session) => {
    mocks.session.mockResolvedValue(session);
    expect((await GET(new Request("http://localhost"), context)).status).toBe(401);
    expect((await fund(request(), context)).status).toBe(401);
    expect((await allocate(request(), context)).status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.fund).not.toHaveBeenCalled();
    expect(mocks.allocate).not.toHaveBeenCalled();
  });

  it.each(["https://foreign.example", null])("rejects foreign or missing write origins before service access", async (origin) => {
    expect((await fund(request(input, origin), context)).status).toBe(403);
    expect((await allocate(request(input, origin), context)).status).toBe(403);
    expect(mocks.fund).not.toHaveBeenCalled();
    expect(mocks.allocate).not.toHaveBeenCalled();
  });

  it("passes route community and authenticated actor, rather than trusting global ADMIN for a mutation", async () => {
    mocks.fund.mockRejectedValue(new mocks.TreasuryError("Owner required", 403, "TREASURY_OWNER_REQUIRED"));
    const response = await fund(request(), context);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "TREASURY_OWNER_REQUIRED", message: "Owner required" });
    expect(mocks.fund).toHaveBeenCalledWith("community_a", "user_a", input);
  });

  it("returns fresh and replay responses without treating either as a payment", async () => {
    const treasuries = { communityId: "community_a", currency: "ZEC", funds: [] };
    mocks.fund.mockResolvedValueOnce({ treasuries, replayed: false }).mockResolvedValueOnce({ treasuries, replayed: true });
    expect((await fund(request(), context)).status).toBe(201);
    const replay = await fund(request(), context);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ treasuries, replayed: true });
    mocks.allocate.mockResolvedValue({ treasuries, replayed: false });
    expect((await allocate(request(), context)).status).toBe(201);
    expect(mocks.allocate).toHaveBeenCalledWith("community_a", "user_a", input);
  });

  it.each([
    [404, "COMMUNITY_NOT_FOUND"], [409, "INSUFFICIENT_RECORDED_FUNDS"],
    [409, "IDEMPOTENCY_CONFLICT"], [400, "INVALID_TREASURY_INPUT"]
  ] as const)("preserves service status %s for %s", async (status, code) => {
    mocks.allocate.mockRejectedValue(new mocks.TreasuryError(code, status, code));
    expect((await allocate(request(), context)).status).toBe(status);
  });

  it("rejects malformed JSON and hides unexpected internal failures", async () => {
    const malformed = new Request("http://localhost/api/admin/communities/community_a/treasuries/funding", {
      method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: "{"
    });
    expect((await fund(malformed, context)).status).toBe(400);
    expect(mocks.fund).not.toHaveBeenCalled();
    mocks.read.mockRejectedValue(new Error("internal private connection details"));
    const failed = await GET(new Request("http://localhost"), context);
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "TREASURY_READ_FAILED" });
  });
});
