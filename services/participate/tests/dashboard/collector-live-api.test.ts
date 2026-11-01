import { describe, expect, it, vi } from "vitest";

const { readCollectorTallyMock } = vi.hoisted(() => ({ readCollectorTallyMock: vi.fn() }));
vi.mock("@/lib/services/collector-tally", () => ({ readCollectorTally: readCollectorTallyMock }));
import { GET } from "@/app/api/collector/live-tally/route";

describe("collector live tally API", () => {
  it("disables unscoped whole-wallet data in every environment", async () => {
    const response = await GET();
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
    expect(readCollectorTallyMock).not.toHaveBeenCalled();
  });
});
