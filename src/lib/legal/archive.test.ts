import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { claimLegalArchive, completeLegalArchive, emptyLegalArchive, legalContentHash, legalDay, LEGAL_LEASE_MS, type LegalArchiveSource } from "./archive";
import { createArchivedLegalFeedLoader } from "./feed";
import type { LegalItem } from "./types";

const at = "2026-10-05T12:00:00.000Z";
const item = (id: string, changes: Partial<LegalItem> = {}): LegalItem => ({
  id, title: `Public ${id}`, summary: "Public policy preview", url: `https://community.pgpz.org/updates/${id}`,
  sourceId: "pgp", publishedAt: "2026-09-28", regions: [], jurisdictions: [], topics: ["Policy"], kind: "Policy memo", status: "Analysis", ...changes,
});
const collect = (row: LegalArchiveSource, items: LegalItem[], day = "2026-10-05") => {
  const time = `${day}T12:00:00.000Z`;
  return completeLegalArchive(claimLegalArchive(row, day, time, day).value, day, time, items);
};

describe("Durable public policy archive", () => {
  it("uses São Paulo calendar days across the UTC boundary", () => {
    expect(legalDay("2026-10-06T02:30:00Z")).toBe("2026-10-05");
    expect(() => claimLegalArchive(emptyLegalArchive("pgp"), "2026-10-06", "2026-10-06T02:30:00Z", "run")).toThrow();
  });
  it("retains rolling-feed omissions and successful empty snapshots", () => {
    const one = collect(emptyLegalArchive("pgp"), [item("a"), item("b")]);
    const two = collect(one, [item("b"), item("c")], "2026-10-06");
    const three = collect(two, [], "2026-10-07");
    expect(three.entries.map(entry => entry.item.id)).toEqual(["a", "b", "c"]);
    expect(three.entries[0].lastSeenAt).toBe(at);
    expect(three.successfulDay).toBe("2026-10-07");
  });
  it("deduplicates tracking/fragments but preserves document query identities", () => {
    const row = collect(emptyLegalArchive("pgp"), [item("a", { url: "https://community.pgpz.org/updates/a?id=1&utm_source=x#one" }), item("a", { url: "https://community.pgpz.org/updates/a?id=1" }), item("b", { url: "https://community.pgpz.org/updates/a?id=2" })]);
    expect(row.entries).toHaveLength(2);
    expect(row.entries[0].revisions).toHaveLength(0);
  });
  it("updates observation only for identical content and retains prior revisions on change", () => {
    const one = collect(emptyLegalArchive("pgp"), [item("a")]);
    const two = collect(one, [item("a", { summary: " Public   policy preview " })], "2026-10-06");
    expect(two.entries[0].revisions).toEqual([]);
    expect(two.entries[0].lastSeenAt).not.toBe(one.entries[0].lastSeenAt);
    const three = collect(two, [item("a", { summary: "Changed public preview" })], "2026-10-07");
    expect(three.entries).toHaveLength(1);
    expect(three.entries[0].revisions[0]).toMatchObject({ contentHash: one.entries[0].contentHash, item: { summary: "Public policy preview" } });
    expect(three.entries[0].item.publishedAt).toBe("2026-09-28");
  });
  it("hashes publisher updates separately from observation or editorial dates", () => {
    expect(legalContentHash(item("a"))).toBe(legalContentHash(item("a", { reviewedAt: "2026-10-05" })));
    expect(legalContentHash(item("a", { sourceUpdatedAt: at }))).not.toBe(legalContentHash(item("a")));
  });
  it("persists a failure without deleting content or advancing success; then backs off", () => {
    const previous = collect(emptyLegalArchive("pgp"), [item("a")]);
    const claimed = claimLegalArchive(previous, "2026-10-06", "2026-10-06T12:00:00.000Z", "fail").value;
    const failed = completeLegalArchive(claimed, "fail", "2026-10-06T12:00:07.000Z", null);
    expect(failed.entries).toEqual(previous.entries);
    expect(failed.lastSuccessAt).toBe(at);
    expect(failed.successfulDay).toBe("2026-10-05");
    expect(claimLegalArchive(failed, "2026-10-06", "2026-10-06T12:15:00.000Z", "again").status).toBe("retry-later");
  });
  it("prevents duplicate daily claims and ignores an expired lease's late result", () => {
    const first = claimLegalArchive(emptyLegalArchive("pgp"), "2026-10-05", at, "first").value;
    expect(claimLegalArchive(first, "2026-10-05", at, "second").status).toBe("locked");
    const afterLease = new Date(Date.parse(at) + LEGAL_LEASE_MS + 1).toISOString();
    const second = claimLegalArchive(first, "2026-10-05", afterLease, "second").value;
    expect(completeLegalArchive(second, "first", afterLease, [item("old")])).toBe(second);
    const done = completeLegalArchive(second, "second", afterLease, [item("new")]);
    expect(claimLegalArchive(done, "2026-10-05", afterLease, "third").status).toBe("already-collected");
  });
  it("never promotes public previews to reviewed legal conclusions", () => {
    const row = collect(emptyLegalArchive("pgp"), [item("a", { status: "In force", reviewedAt: "2026-10-05", effectiveAt: "2026-10-01" })]);
    expect(row.entries[0].item.status).toBe("Analysis");
    expect(row.entries[0].item).not.toHaveProperty("reviewedAt");
    expect(row.entries[0].item).not.toHaveProperty("effectiveAt");
  });
});

describe("Archive-backed feed reads", () => {
  it("survives loader restart, retains reviewed facts and flags later source revisions", async () => {
    const original = collect(emptyLegalArchive("pgp"), [item("a")]);
    const changed = collect(original, [item("a", { summary: "Changed source" })], "2026-10-06");
    const seed = item("a", { title: "Reviewed title", status: "Adopted", publishedAt: "2026-09-27", reviewedAt: "2026-10-05" });
    const read = vi.fn().mockResolvedValue({ available: true, rows: [changed] });
    const result = await createArchivedLegalFeedLoader({ read, items: [seed], sources: [], now: () => Date.parse("2026-10-06T13:00:00Z") })();
    expect(result.items[0]).toMatchObject({ ...seed, sourceChangedAt: "2026-10-06T12:00:00.000Z" });
    expect(result.archive).toMatchObject({ status: "available", itemCount: 1, cadence: "daily" });
  });
  it("serves the last persisted read on DB outage but reports archive unavailable", async () => {
    const row = collect(emptyLegalArchive("pgp"), [item("a")]);
    let clock = Date.parse(at);
    const read = vi.fn().mockResolvedValueOnce({ available: true, rows: [row] }).mockRejectedValueOnce(new Error("offline"));
    const load = createArchivedLegalFeedLoader({ read, items: [], sources: [], now: () => clock });
    const first = await load(); clock += 1000;
    const second = await load();
    expect(second.items).toEqual(first.items);
    expect(second.archive).toMatchObject({ status: "unavailable", lastReadAt: at, lastCollectedAt: at });
    expect(second.pgpStatus).toBe("cached");
  });
  it("flags source changes on the review date because within-day chronology is unknown", async () => {
    const original = collect(emptyLegalArchive("pgp"), [item("a")]);
    const changed = collect(original, [item("a", { summary: "Changed source" })], "2026-10-06");
    const seed = item("a", { reviewedAt: "2026-10-06", status: "Adopted" });
    const result = await createArchivedLegalFeedLoader({ read: async () => ({ available: true, rows: [changed] }), items: [seed], sources: [], now: () => Date.parse("2026-10-06T13:00:00Z") })();
    expect(result.items[0]).toMatchObject({ reviewedAt: "2026-10-06", status: "Adopted", sourceChangedAt: "2026-10-06T12:00:00.000Z" });
  });
  it("keeps fresh successful empty archive distinct from an uncollected source", async () => {
    const row = collect(emptyLegalArchive("pgp"), []);
    const load = createArchivedLegalFeedLoader({ read: async () => ({ available: true, rows: [row] }), items: [], sources: [], now: () => Date.parse(at) });
    const result = await load();
    expect(result.pgpStatus).toBe("live");
    expect(result.sourceHealth?.find(source => source.sourceId === "bcb")?.status).toBe("unavailable");
  });
});
