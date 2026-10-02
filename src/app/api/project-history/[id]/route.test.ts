import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/project-history/data", () => ({ readProjectHistory: mocks.read }));
import { GET } from "./route";
const params = { params: Promise.resolve({ id: "alpha" }) };
beforeEach(() => vi.resetAllMocks());
describe("public project history API", () => {
  it("keeps full grant records while explicitly filtering only timeline event dates", async () => {
    mocks.read.mockResolvedValue({ grants: [{ id: "all-time-grant", milestones: [] }], coverage: { paymentsAvailable: true, proposalsAvailable: true }, timeline: [{ id: "a", date: "2026-09-01" }, { id: "b", date: "2026-08-31" }, { id: "c", date: null }] });
    const response = await GET(new Request("https://openzcash.org/api/project-history/alpha?month=2026-09"), params);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ grants: [{ id: "all-time-grant" }], timeline: [{ id: "a" }], timelineFilter: { grantsAreAllTime: true, undatedEventsExcluded: 1, basis: "event-date-UTC" } });
  });
  it("rejects invalid filters before any source access and returns 404 for an unknown identity", async () => {
    expect((await GET(new Request("https://openzcash.org/api/project-history/alpha?month=2026-99"), params)).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
    mocks.read.mockResolvedValue(null);
    expect((await GET(new Request("https://openzcash.org/api/project-history/unknown"), params)).status).toBe(404);
  });
});
