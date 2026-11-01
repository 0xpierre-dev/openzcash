// @vitest-environment node
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ list: vi.fn(), receipt: vi.fn() }));
vi.mock("@/lib/services/activity-anchors", () => ({ readArchiveActivity: mocks.list, readActivityReceipt: mocks.receipt }));
import { GET as list } from "@/app/api/communities/[communityId]/archives/[recordId]/activity/route";
import { GET as receipt } from "@/app/api/communities/[communityId]/archives/[recordId]/activity/[eventId]/route";
const eventId = "48256158-f238-4007-840f-d9fdf88e8b5b";
const context = { params: Promise.resolve({ communityId: "community-a", recordId: "record-a", eventId }) };
const request = (query = "") => new NextRequest(`http://localhost:4411/activity${query}`);
beforeEach(() => vi.resetAllMocks());
it("allows public, uncached, scoped reads and a bounded cursor", async () => {
  mocks.list.mockResolvedValue({ items: [], nextBefore: null });
  const result = await list(request("?before=51"), context);
  expect(mocks.list).toHaveBeenCalledWith("community-a", "record-a", 51);
  expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("no-store");
  for (const cursor of ["-1", "0", "1.2", "2147483648", "abc"]) expect((await list(request(`?before=${cursor}`), context)).status).toBe(400);
});
it("does not expose database errors and respects cross-record misses", async () => {
  mocks.receipt.mockResolvedValue(null);
  expect((await receipt(request(), context)).status).toBe(404);
  mocks.list.mockRejectedValue(new Error("private connection string"));
  const result = await list(request(), context);
  expect(result.status).toBe(503); expect(await result.json()).toEqual({ error: "ACTIVITY_UNAVAILABLE" });
});
it("serves only the public receipt as a JSON attachment with a safe filename", async () => {
  mocks.receipt.mockResolvedValue({ bundle: { schema: "test-receipt" }, proof: { state: "RECORDED" }, event: { id: eventId } });
  const result = await receipt(request("?download=1"), context);
  expect(result.headers.get("content-disposition")).toBe(`attachment; filename="activity-${eventId}.json"`);
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(await result.json()).toEqual({ schema: "test-receipt" });
  const invalid = await receipt(request(), { params: Promise.resolve({ communityId: "x", recordId: "x", eventId: "bad\r\nname" }) });
  expect(invalid.status).toBe(404);
});
it("scopes a completed decision lookup to its exact round and rejects malformed ids", async () => {
  mocks.list.mockResolvedValue({ items: [], nextBefore: null });
  const response = await list(request(`?round=${eventId}`), context);
  expect(response.status).toBe(200);
  expect(mocks.list).toHaveBeenCalledWith("community-a", "record-a", undefined, eventId);
  for (const round of ["", "not-a-round", "../../other", "1"]) expect((await list(request(`?round=${encodeURIComponent(round)}`), context)).status).toBe(400);
});
