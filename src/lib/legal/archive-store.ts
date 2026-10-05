import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { legalPublicArchive } from "@/lib/db/schema";
import { claimLegalArchive, completeLegalArchive, emptyLegalArchive, LEGAL_SOURCE_IDS, readLegalArchive, type LegalArchiveSource, type LegalSourceId } from "./archive";
import type { LegalItem } from "./types";

/** One public-only row per source; financial and private tables are never read or changed. */
async function changeSource<T>(sourceId: LegalSourceId, change: (row: LegalArchiveSource) => { row: LegalArchiveSource; value: T }): Promise<T> {
  return getDb().transaction(async tx => {
    await tx.execute(sql`set local statement_timeout = '3000ms'`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'legal-public-archive:' + sourceId}))`);
    const rows = await tx.select().from(legalPublicArchive).where(eq(legalPublicArchive.sourceId, sourceId));
    const before = rows.length ? readLegalArchive(rows[0].payload, sourceId) : emptyLegalArchive(sourceId);
    const changed = change(before);
    if (changed.row !== before) await tx.insert(legalPublicArchive).values({ sourceId, payload: changed.row, updatedAt: new Date() })
      .onConflictDoUpdate({ target: legalPublicArchive.sourceId, set: { payload: changed.row, updatedAt: new Date() } });
    return changed.value;
  });
}

export async function readLegalArchiveSources(): Promise<{ available: boolean; rows: LegalArchiveSource[] }> {
  try {
    const rows = await getDb().transaction(async tx => {
      await tx.execute(sql`set local statement_timeout = '3000ms'`);
      return tx.select().from(legalPublicArchive);
    });
    return { available: true, rows: rows.flatMap(row => LEGAL_SOURCE_IDS.includes(row.sourceId as LegalSourceId)
      ? [readLegalArchive(row.payload, row.sourceId as LegalSourceId)] : []) };
  } catch { return { available: false, rows: [] }; }
}

export const legalArchiveStore = {
  claim: (sourceId: LegalSourceId, day: string, at: string, id: string) => changeSource(sourceId, row => {
    const claim = claimLegalArchive(row, day, at, id);
    return { row: claim.value, value: { status: claim.status, row: claim.value } };
  }),
  complete: (sourceId: LegalSourceId, id: string, at: string, items: readonly LegalItem[] | null) => changeSource(sourceId, row => {
    const completed = completeLegalArchive(row, id, at, items);
    return { row: completed, value: { committed: completed !== row, row: completed } };
  }),
};
