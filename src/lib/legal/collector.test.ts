import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createLegalCollector } from "./collector";
import { claimLegalArchive, completeLegalArchive, emptyLegalArchive, type LegalArchiveSource, type LegalSourceId } from "./archive";
import type { LegalItem } from "./types";

const at = "2026-10-05T12:00:00.000Z";
const input = { day: "2026-10-05", now: at, trigger: "scheduled" as const };
const item = (sourceId: LegalSourceId): LegalItem => ({ id: sourceId, title: "Public update", summary: "Public source", sourceId, url: `https://example.org/${sourceId}`, publishedAt: "2026-10-01", regions: [], jurisdictions: [], topics: ["Policy"], kind: "Official update", status: "Official update" });
function fixture() {
  const rows = new Map<LegalSourceId, LegalArchiveSource>();
  const store = {
    claim: vi.fn(async (sourceId: LegalSourceId, day: string, at: string, id: string) => {
      const claim = claimLegalArchive(rows.get(sourceId) ?? emptyLegalArchive(sourceId), day, at, id);
      rows.set(sourceId, claim.value); return { status: claim.status, row: claim.value };
    }),
    complete: vi.fn(async (sourceId: LegalSourceId, id: string, at: string, items: readonly LegalItem[] | null) => {
      const before = rows.get(sourceId)!;
      const row = completeLegalArchive(before, id, at, items);
      rows.set(sourceId, row); return { committed: row !== before, row };
    }),
  };
  const fetchSource = vi.fn(async (sourceId: LegalSourceId) => [item(sourceId)]);
  return { rows, store, fetchSource };
}
describe("Daily public policy collector", () => {
  it("persists each source once per day across collector recreation", async () => {
    const f = fixture(), deps = { ...f, now: () => Date.parse(at), enabled: () => true };
    expect(await createLegalCollector(deps)(input)).toMatchObject({ ok: true, outcome: "collected" });
    expect(await createLegalCollector(deps)(input)).toMatchObject({ ok: true, outcome: "already-collected" });
    expect(f.fetchSource).toHaveBeenCalledTimes(2);
  });
  it("commits one source despite failure of the other and retries only the failed source", async () => {
    const f = fixture(); let clock = Date.parse(at);
    f.fetchSource.mockImplementation(async sourceId => { if (sourceId === "bcb") throw new Error("timeout"); return [item(sourceId)]; });
    const run = createLegalCollector({ ...f, now: () => clock, enabled: () => true });
    const first = await run(input);
    expect(first).toMatchObject({ ok: false, outcome: "partial", nextRetryAt: "2026-10-05T13:00:00.000Z" });
    clock += 15 * 60_000;
    await run({ ...input, now: new Date(clock).toISOString() });
    expect(f.fetchSource).toHaveBeenCalledTimes(2);
    clock += 60 * 60_000;
    await run({ ...input, now: new Date(clock).toISOString() });
    expect(f.fetchSource).toHaveBeenCalledTimes(3);
    expect(f.rows.get("pgp")?.lastSuccessAt).toBe(at);
  });
  it("does not count a database write failure as durable collection success", async () => {
    const f = fixture(); f.store.complete.mockRejectedValue(new Error("DB unavailable"));
    const result = await createLegalCollector({ ...f, now: () => Date.parse(at), enabled: () => true })(input);
    expect(result).toMatchObject({ ok: false, outcome: "unavailable" });
    expect(f.rows.get("pgp")?.successfulDay).toBeNull();
  });
  it("coalesces concurrent collectors through durable source claims", async () => {
    const f = fixture(); let resolve!: () => void;
    const gate = new Promise<void>(r => { resolve = r; });
    f.fetchSource.mockImplementation(async sourceId => { await gate; return [item(sourceId)]; });
    const run = createLegalCollector({ ...f, now: () => Date.parse(at), enabled: () => true });
    const first = run(input), second = run(input);
    expect(await second).toMatchObject({ ok: false, outcome: "locked" });
    resolve(); expect((await first).ok).toBe(true);
    expect(f.fetchSource).toHaveBeenCalledTimes(2);
  });
  it("makes no fetches or writes when collection is disabled for a preview", async () => {
    const f = fixture();
    expect(await createLegalCollector({ ...f, now: () => Date.parse(at), enabled: () => false })(input)).toMatchObject({ ok: false, outcome: "unavailable" });
    expect(f.store.claim).not.toHaveBeenCalled(); expect(f.fetchSource).not.toHaveBeenCalled();
  });
});
