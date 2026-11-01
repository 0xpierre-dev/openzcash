// @vitest-environment node
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: mocks.query } }));
import { GET } from "@/app/api/health/route";
it("checks the database and never caches a healthy response", async () => {
  mocks.query.mockResolvedValue([{ result: 1 }]);
  const response = await GET();
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true });
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("reports an outage without disclosing database details", async () => {
  mocks.query.mockRejectedValue(new Error("private database connection details"));
  const response = await GET();
  expect(response.status).toBe(503); expect(await response.json()).toEqual({ ok: false });
  expect(response.headers.get("cache-control")).toBe("no-store");
});
