import { beforeEach, describe, expect, it, vi } from "vitest";

const { session, community, publicCommunity, dashboard } = vi.hoisted(() => ({ session: vi.fn(), community: vi.fn(), publicCommunity: vi.fn(), dashboard: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { community: { findFirst: publicCommunity } } }));
vi.mock("@/lib/auth/session", () => ({ readSession: session }));
vi.mock("@/lib/services/communities", () => ({ findManagedCommunity: community }));
vi.mock("@/lib/services/coinholder", () => ({ readCoinholderDashboard: dashboard }));
import { GET } from "@/app/api/communities/[communityId]/coinholder/route";

const call = () => GET(new Request("http://localhost/api/communities/dao_1/coinholder"), { params: Promise.resolve({ communityId: "dao_1" }) });
beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({ subjectType: "user", userId: "user_1", role: "USER" });
  community.mockResolvedValue({ id: "dao_1" });
  publicCommunity.mockResolvedValue(null);
  dashboard.mockResolvedValue({ round: { id: "q3-2026" } });
});

describe("scoped Coinholder API", () => {
  it("returns the dashboard without a wrapper after current community authorization", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(community).toHaveBeenCalledWith("dao_1", "user_1");
    expect(await response.json()).toEqual({ round: { id: "q3-2026" } });
  });

  it("omits immutable history only when requested and explicitly marks the omission", async () => {
    dashboard.mockResolvedValue({ round: { id: "q3-2026" }, source: { state: "verified" }, activity: { transactions: [{ txHash: "A".repeat(64) }] }, revealHistory: { days: [{ total: 282 }] } });
    const response = await GET(new Request("http://localhost/api/communities/dao_1/coinholder?history=omit"), { params: Promise.resolve({ communityId: "dao_1" }) });
    expect(response.status).toBe(200);
    expect(community).toHaveBeenCalledWith("dao_1", "user_1");
    expect(await response.json()).toEqual({ round: { id: "q3-2026" }, source: { state: "verified" }, activityOmitted: true });
    const full = await (await call()).json();
    expect(full).toHaveProperty("activity.transactions");
    expect(full).toHaveProperty("revealHistory.days");
  });

  it.each([null, { subjectType: "poll_voter_access", userId: "", role: "VOTER_TEMP" }])("keeps communities without published proposals private", async (value) => {
    session.mockResolvedValue(value);
    const response = await call();
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(community).not.toHaveBeenCalled();
    expect(dashboard).not.toHaveBeenCalled();
  });

  it("allows anonymous refreshes only for a community with published proposals", async () => {
    session.mockResolvedValue(null);
    publicCommunity.mockResolvedValue({ id: "dao_1" });
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ round: { id: "q3-2026" } });
    expect(community).not.toHaveBeenCalled();
    expect(publicCommunity).toHaveBeenCalledWith({ where: {
      id: "dao_1", kind: "DAO", OR: [{ polls: { some: { OR: [
        { status: "OPEN", closesAt: { gt: expect.any(Date) } },
        { status: { in: ["CLOSED", "FINALIZED", "ARCHIVED"] } }
      ] } } }, { proposalArchives: { some: { revisions: { some: {} } } } }]
    }, select: { id: true } });
  });

  it("allows a former manager only the same public result as a guest", async () => {
    community.mockResolvedValue(null);
    publicCommunity.mockResolvedValue({ id: "dao_1" });
    expect((await call()).status).toBe(200);
    expect(community).toHaveBeenCalledWith("dao_1", "user_1");
    expect(publicCommunity).toHaveBeenCalledTimes(1);
  });

  it("does not fetch results for another DAO or a revoked manager", async () => {
    community.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(dashboard).not.toHaveBeenCalled();
  });

  it("hides provider and database internals on failure", async () => {
    dashboard.mockRejectedValue(new Error("provider credential details"));
    const response = await call();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "COINHOLDER_READ_FAILED" });
  });
});
