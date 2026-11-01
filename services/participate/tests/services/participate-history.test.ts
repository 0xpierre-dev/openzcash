import { readParticipationHistory } from "@/lib/services/participate-history";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("reads only the configured public API without forwarding account state", async () => {
  vi.stubEnv("PARTICIPATE_PARENT_ORIGIN", "https://openzcash.org");
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: 1, rows: [] }) });
  vi.stubGlobal("fetch", fetcher);
  expect(await readParticipationHistory()).toEqual({ rows: [], origin: "https://openzcash.org" });
  expect(fetcher).toHaveBeenCalledWith("https://openzcash.org/api/participate/history", expect.objectContaining({ redirect: "error", headers: { Accept: "application/json" } }));
});
it("keeps unavailable, invalid and unconfigured sources distinct from empty history", async () => {
  vi.stubEnv("PARTICIPATE_PARENT_ORIGIN", "https://openzcash.org");
  const fetcher = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, json: async () => ({ version: 2, rows: [] }) });
  vi.stubGlobal("fetch", fetcher);
  expect(await readParticipationHistory()).toBeNull();
  expect(await readParticipationHistory()).toBeNull();
  expect(await readParticipationHistory()).toBeNull();
  vi.stubEnv("PARTICIPATE_PARENT_ORIGIN", "");
  expect(await readParticipationHistory()).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(3);
});
