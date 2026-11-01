import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { CreditPurchaseError } from "@/lib/domain/credit-purchases";

const { session, list, create, check, reconcile } = vi.hoisted(() => ({ session: vi.fn(), list: vi.fn(), create: vi.fn(), check: vi.fn(), reconcile: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ readSession: session }));
vi.mock("@/lib/services/credit-purchases", () => ({ readCreditPurchases: list, createCreditPurchase: create, checkCreditPurchase: check, reconcileCreditPurchases: reconcile }));

import { GET, POST } from "@/app/api/account/credits/purchases/route";
import { POST as checkPost } from "@/app/api/account/credits/purchases/[purchaseId]/check/route";
import { POST as internalPost } from "@/app/api/internal/credits/reconcile/route";

const user = { subjectType: "user", userId: "alice", nick: "Alice", role: "USER" };
const context = { params: Promise.resolve({ purchaseId: "purchase-a" }) };
function request(method: string, body?: unknown, origin = "http://localhost", url = "http://localhost/api/account/credits/purchases") {
  return new Request(url, { method, headers: { origin, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
beforeEach(() => {
  vi.clearAllMocks(); session.mockResolvedValue(user);
  list.mockResolvedValue({ funding: { configured: false, network: null, package: null }, purchases: [] });
  create.mockResolvedValue({ id: "purchase-a", status: "PENDING" }); check.mockResolvedValue({ id: "purchase-a", status: "CONFIRMING" });
  reconcile.mockResolvedValue({ processed: 1, results: [{ id: "purchase-a", status: "CONFIRMING" }] });
  vi.stubEnv("CREDIT_RECONCILE_SECRET", "server-owned-secret-at-least-32-characters");
});
afterEach(() => vi.unstubAllEnvs());

describe("private credit purchase APIs", () => {
  it("requires permanent active sessions and never accepts an actor supplied by the caller", async () => {
    session.mockResolvedValue(null);
    for (const response of [await GET(request("GET")), await POST(request("POST", {})), await checkPost(request("POST", {}), context)]) expect(response.status).toBe(401);
    session.mockResolvedValue({ subjectType: "poll_voter_access", userId: "", pollId: "poll-a", pollVoterAccessId: "access-a" });
    expect((await POST(request("POST", {}))).status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("uses session identity and bounded JSON, and marks all responses private/no-store", async () => {
    const body = { communityId: "community-a", requestKey: "purchase-request-001" };
    const response = await POST(request("POST", body));
    expect(response.status).toBe(201); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(create).toHaveBeenCalledWith("alice", body);
    const result = await GET(request("GET", undefined, undefined, "http://localhost/api/account/credits/purchases?communityId=community-a"));
    expect(list).toHaveBeenCalledWith("alice", "community-a");
    expect(result.headers.get("Vary")).toBe("Cookie");
  });

  it("blocks untrusted origins before any service or session lookup", async () => {
    expect((await POST(request("POST", {}, "https://foreign.example"))).status).toBe(403);
    expect((await checkPost(request("POST", {}, "https://foreign.example"), context)).status).toBe(403);
    expect(session).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled(); expect(check).not.toHaveBeenCalled();
  });

  it("accepts no caller-provided proof and checks only the owned invoice identifier", async () => {
    expect((await checkPost(request("POST", { txid: "claimed-proof", confirmations: 100 }), context)).status).toBe(400);
    expect(check).not.toHaveBeenCalled();
    const response = await checkPost(request("POST", {}), context);
    expect(check).toHaveBeenCalledWith("alice", "purchase-a");
    await expect(response.json()).resolves.toEqual({ purchase: { id: "purchase-a", status: "CONFIRMING" } });
  });

  it("rejects duplicate community filters, oversized/malformed JSON and hides internal provider errors", async () => {
    expect((await GET(request("GET", undefined, undefined, "http://localhost/api/account/credits/purchases?communityId=a&communityId=b"))).status).toBe(400);
    expect((await POST(request("POST", { data: "a".repeat(17_000) }))).status).toBe(400);
    const malformed = new Request("http://localhost/api/account/credits/purchases", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: "{" });
    expect((await POST(malformed)).status).toBe(400);
    create.mockRejectedValue(new Error("RPC credentials must not be returned"));
    const failed = await POST(request("POST", {}));
    await expect(failed.json()).resolves.toEqual({ error: "CREDIT_PURCHASE_REQUEST_FAILED" });
    check.mockRejectedValue(new CreditPurchaseError("Payment verification unavailable", 503, "CREDIT_PAYMENT_OBSERVER_UNAVAILABLE"));
    expect((await checkPost(request("POST", {}), context)).status).toBe(503);
  });
});

describe("server-owned reconciliation authorization", () => {
  function internal(body: unknown = {}, secret = process.env.CREDIT_RECONCILE_SECRET!) {
    return new Request("http://localhost/api/internal/credits/reconcile", { method: "POST", headers: { "content-type": "application/json", "x-credit-reconcile-secret": secret }, body: JSON.stringify(body) });
  }
  it("requires an explicit sufficiently long secret with no development fallback", async () => {
    vi.stubEnv("CREDIT_RECONCILE_SECRET", ""); expect((await internalPost(internal())) .status).toBe(503);
    vi.stubEnv("CREDIT_RECONCILE_SECRET", "short"); expect((await internalPost(internal())).status).toBe(503);
    vi.stubEnv("CREDIT_RECONCILE_SECRET", "server-owned-secret-at-least-32-characters");
    expect((await internalPost(internal({}, "invalid-secret"))).status).toBe(403);
    expect(reconcile).not.toHaveBeenCalled();
  });
  it("rejects caller payment evidence and invokes only the configured server observer path", async () => {
    expect((await internalPost(internal({ receipt: { confirmations: 1000 } }))).status).toBe(400);
    expect(reconcile).not.toHaveBeenCalled();
    const response = await internalPost(internal());
    expect(response.status).toBe(200); expect(reconcile).toHaveBeenCalledWith();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
