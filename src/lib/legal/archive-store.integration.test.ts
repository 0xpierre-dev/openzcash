import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { legalArchiveStore, readLegalArchiveSources } from "./archive-store";
import type { LegalItem } from "./types";

const testUrl = process.env.LEGAL_ARCHIVE_TEST_DB_URL;
// Never run destructive setup against a user/production database, even if the
// general DATABASE_URL is present. This explicitly named disposable DB is required.
if (testUrl) {
  const url = new URL(testUrl);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["127.0.0.1", "localhost"].includes(url.hostname) ||
      url.pathname !== "/openzcash_legal_test" || url.search) throw new Error("LEGAL_ARCHIVE_TEST_REQUIRES_DISPOSABLE_LOCAL_DB");
}
const at = "2026-10-05T12:00:00.000Z";
const item: LegalItem = { id: "pgp:a", title: "Public policy update", summary: "Public preview", url: "https://community.pgpz.org/updates/a", sourceId: "pgp", publishedAt: "2026-10-01", regions: [], jurisdictions: [], topics: ["Policy"], kind: "Policy memo", status: "Analysis" };

describe.skipIf(!testUrl)("Public legal archive PostgreSQL adapter (isolated database only)", () => {
  let admin: ReturnType<typeof postgres>;
  beforeAll(async () => {
    vi.stubEnv("DATABASE_URL", testUrl!);
    admin = postgres(testUrl!, { max: 1 });
    await migrate(drizzle(admin), { migrationsFolder: "./drizzle" });
  });
  beforeEach(async () => { await admin`delete from legal_public_archive`; });
  afterAll(async () => {
    await admin?.end();
    const state = globalThis as typeof globalThis & { __zecSql?: ReturnType<typeof postgres>; __zecDb?: unknown };
    await state.__zecSql?.end(); delete state.__zecSql; delete state.__zecDb;
    vi.unstubAllEnvs();
  });

  it("serializes simultaneous claims and persists one successful daily checkpoint", async () => {
    const claims = await Promise.all(Array.from({ length: 20 }, (_, i) => legalArchiveStore.claim("pgp", "2026-10-05", at, `claim-${i}`)));
    expect(claims.filter(claim => claim.status === "claimed")).toHaveLength(1);
    expect(claims.filter(claim => claim.status === "locked")).toHaveLength(19);
    const id = claims.find(claim => claim.status === "claimed")!.row.lease!.id;
    const completed = await legalArchiveStore.complete("pgp", id, at, [item]);
    expect(completed.committed).toBe(true);
    expect(await readLegalArchiveSources()).toMatchObject({ available: true, rows: [{ successfulDay: "2026-10-05", entries: [{ item: { id: "pgp:a" } }] }] });
    expect((await legalArchiveStore.claim("pgp", "2026-10-05", at, "retry")).status).toBe("already-collected");
  });
  it("prevents an old worker from overwriting a replacement lease's completion", async () => {
    await legalArchiveStore.claim("pgp", "2026-10-05", at, "old");
    const later = "2026-10-05T12:03:00.000Z";
    expect((await legalArchiveStore.claim("pgp", "2026-10-05", later, "new")).status).toBe("claimed");
    await legalArchiveStore.complete("pgp", "new", later, [{ ...item, title: "New content" }]);
    expect((await legalArchiveStore.complete("pgp", "old", "2026-10-05T12:04:00.000Z", [item])).committed).toBe(false);
    expect((await readLegalArchiveSources()).rows[0].entries[0].item.title).toBe("New content");
  });
  it("isolates source failures and rolls back invalid source content", async () => {
    await Promise.all([legalArchiveStore.claim("pgp", "2026-10-05", at, "pgp"), legalArchiveStore.claim("bcb", "2026-10-05", at, "bcb")]);
    await expect(legalArchiveStore.complete("bcb", "bcb", at, [item])).rejects.toThrow("LEGAL_ARCHIVE_ITEM_INVALID");
    await legalArchiveStore.complete("pgp", "pgp", at, [item]);
    await legalArchiveStore.complete("bcb", "bcb", at, null);
    const result = await readLegalArchiveSources();
    expect(result.rows.find(row => row.sourceId === "pgp")).toMatchObject({ successfulDay: "2026-10-05", lastSuccessAt: at });
    expect(result.rows.find(row => row.sourceId === "bcb")).toMatchObject({ successfulDay: null, lastSuccessAt: null, errorClass: "source-unavailable" });
  });
});
