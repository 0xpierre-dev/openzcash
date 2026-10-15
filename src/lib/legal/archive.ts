import { createHash } from "node:crypto";
import { legalSourceUrl, validLegalDate } from "./pgp-parser";
import type { LegalItem } from "./types";

export const LEGAL_SOURCE_IDS = ["pgp", "bcb", "aaip", "urcdp"] as const;
export type LegalSourceId = (typeof LEGAL_SOURCE_IDS)[number];
export const LEGAL_LEASE_MS = 120_000;
export const LEGAL_RETRY_MS = 60 * 60_000;
export type LegalArchiveEntry = {
  item: LegalItem;
  contentHash: string;
  firstSeenAt: string;
  lastSeenAt: string;
  changedAt: string | null;
  revisions: Array<{ item: LegalItem; contentHash: string; observedAt: string; replacedAt: string }>;
};
/** Only public publisher metadata belongs here; reviewed editorial seeds stay separate. */
export type LegalArchiveSource = {
  schemaVersion: 1;
  sourceId: LegalSourceId;
  entries: LegalArchiveEntry[];
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  successfulDay: string | null;
  errorClass: "source-unavailable" | null;
  nextRetryAt: string | null;
  lease: { id: string; day: string; startedAt: string; expiresAt: string } | null;
};
export type LegalClaimStatus = "claimed" | "already-collected" | "retry-later" | "locked";

export function legalDay(at: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
}
export function validInstant(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}
export function emptyLegalArchive(sourceId: LegalSourceId): LegalArchiveSource {
  return { schemaVersion: 1, sourceId, entries: [], lastAttemptAt: null, lastSuccessAt: null, successfulDay: null, errorClass: null, nextRetryAt: null, lease: null };
}
export function readLegalArchive(value: unknown, sourceId: LegalSourceId): LegalArchiveSource {
  if (!value || typeof value !== "object") throw new Error("LEGAL_ARCHIVE_INVALID");
  const row = value as LegalArchiveSource;
  if (row.schemaVersion !== 1 || row.sourceId !== sourceId || !Array.isArray(row.entries) ||
      row.entries.some(entry => !entry.item || entry.item.sourceId !== sourceId || !legalSourceUrl(entry.item.url) ||
        !validLegalDate(entry.item.publishedAt) || !validInstant(entry.firstSeenAt) || !validInstant(entry.lastSeenAt) ||
        !/^[a-f0-9]{64}$/.test(entry.contentHash) || !Array.isArray(entry.revisions)) ||
      [row.lastAttemptAt, row.lastSuccessAt, row.nextRetryAt].some(at => at !== null && !validInstant(at)) ||
      (row.successfulDay !== null && !validLegalDate(row.successfulDay)) ||
      (row.lease && (!row.lease.id || !validLegalDate(row.lease.day) || !validInstant(row.lease.startedAt) || !validInstant(row.lease.expiresAt)))) {
    throw new Error("LEGAL_ARCHIVE_INVALID");
  }
  return row;
}

/** Acquiring a lease is durable and brief; no transaction waits on an external feed. */
export function claimLegalArchive(row: LegalArchiveSource, day: string, at: string, id: string): { status: LegalClaimStatus; value: LegalArchiveSource } {
  if (!validLegalDate(day) || !validInstant(at) || day !== legalDay(at) || !id) throw new Error("LEGAL_COLLECTION_DATE_INVALID");
  if (row.successfulDay && row.successfulDay >= day) return { status: "already-collected", value: row };
  if (row.lease && Date.parse(row.lease.expiresAt) > Date.parse(at)) return { status: "locked", value: row };
  if (row.nextRetryAt && Date.parse(row.nextRetryAt) > Date.parse(at)) return { status: "retry-later", value: row };
  return { status: "claimed", value: { ...row, lastAttemptAt: at, lease: { id, day, startedAt: at, expiresAt: new Date(Date.parse(at) + LEGAL_LEASE_MS).toISOString() } } };
}

function publicItem(item: LegalItem, sourceId: LegalSourceId, asOf: string): LegalItem {
  const url = legalSourceUrl(item.url);
  if (!url || item.sourceId !== sourceId || !validLegalDate(item.publishedAt) || item.publishedAt > asOf) throw new Error("LEGAL_ARCHIVE_ITEM_INVALID");
  // Source collectors cannot promote analysis into legal advice or overwrite a review.
  const { reviewedAt: _review, effectiveAt: _effective, sourceChangedAt: _changed, ...content } = item;
  void _review; void _effective; void _changed;
  return { ...content, url, status: sourceId === "pgp" ? "Analysis" : "Official update" };
}
export function legalContentHash(item: LegalItem): string {
  return createHash("sha256").update(JSON.stringify({
    sourceId: item.sourceId, url: legalSourceUrl(item.url), title: item.title.trim().replace(/\s+/g, " "),
    summary: item.summary.trim().replace(/\s+/g, " "), publishedAt: item.publishedAt,
    dateBasis: item.dateBasis ?? "published", sourceUpdatedAt: item.sourceUpdatedAt ?? null,
  })).digest("hex");
}

/** Rolling feed omissions are never deletions. Stale lease completions are ignored. */
export function completeLegalArchive(row: LegalArchiveSource, id: string, completedAt: string, items: readonly LegalItem[] | null): LegalArchiveSource {
  if (!validInstant(completedAt)) throw new Error("LEGAL_COLLECTION_DATE_INVALID");
  const lease = row.lease;
  if (!lease || lease.id !== id || Date.parse(completedAt) < Date.parse(lease.startedAt)) return row;
  if (items === null) return { ...row, lease: null, errorClass: "source-unavailable", nextRetryAt: new Date(Date.parse(completedAt) + LEGAL_RETRY_MS).toISOString() };
  const entries = new Map(row.entries.map(entry => [legalSourceUrl(entry.item.url)!, entry]));
  for (const candidate of items) {
    const item = publicItem(candidate, row.sourceId, completedAt.slice(0, 10));
    const hash = legalContentHash(item), previous = entries.get(item.url);
    if (!previous) entries.set(item.url, { item, contentHash: hash, firstSeenAt: completedAt, lastSeenAt: completedAt, changedAt: null, revisions: [] });
    else if (previous.contentHash === hash) entries.set(item.url, { ...previous, lastSeenAt: completedAt });
    else entries.set(item.url, { ...previous, item, contentHash: hash, lastSeenAt: completedAt, changedAt: completedAt,
      revisions: [...previous.revisions, { item: previous.item, contentHash: previous.contentHash, observedAt: previous.lastSeenAt, replacedAt: completedAt }] });
  }
  return { ...row, entries: [...entries.values()].sort((a, b) => a.item.url.localeCompare(b.item.url)),
    lastSuccessAt: completedAt, successfulDay: lease.day, lease: null, errorClass: null, nextRetryAt: null };
}
