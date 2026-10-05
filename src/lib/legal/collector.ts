import "server-only";
import { randomUUID } from "node:crypto";
import { legalDay, LEGAL_SOURCE_IDS, validInstant, type LegalSourceId } from "./archive";
import { legalArchiveStore } from "./archive-store";
import { fetchLegalSource } from "./feed";
import type { LegalItem } from "./types";

export type LegalCollectionInput = { day: string; now: string; trigger: "scheduled" | "cron" };
export type LegalCollectionSource = {
  sourceId: LegalSourceId; status: "collected" | "already-collected" | "retry-later" | "locked" | "unavailable";
  itemCount: number; lastSuccessAt: string | null; nextRetryAt?: string | null;
};
export type LegalCollectionResult = {
  ok: boolean; outcome: "collected" | "already-collected" | "retry-later" | "locked" | "partial" | "unavailable";
  day: string; nextRetryAt: string | null; sources: LegalCollectionSource[];
};
type Dependencies = {
  store: typeof legalArchiveStore;
  fetchSource: (sourceId: LegalSourceId, asOf: string) => Promise<LegalItem[]>;
  now: () => number;
  enabled: () => boolean;
};

export function createLegalCollector({ store, fetchSource, now, enabled }: Dependencies) {
  return async (input: LegalCollectionInput): Promise<LegalCollectionResult> => {
    if (!validInstant(input.now) || legalDay(input.now) !== input.day) throw new Error("LEGAL_COLLECTION_DATE_INVALID");
    if (!enabled()) return { ok: false, outcome: "unavailable", day: input.day, nextRetryAt: null, sources: [] };
    const sources = await Promise.all(LEGAL_SOURCE_IDS.map(async (sourceId): Promise<LegalCollectionSource> => {
      try {
        const id = randomUUID(), claim = await store.claim(sourceId, input.day, input.now, id);
        const summary = { sourceId, itemCount: claim.row.entries.length, lastSuccessAt: claim.row.lastSuccessAt, nextRetryAt: claim.row.nextRetryAt };
        if (claim.status !== "claimed") return { ...summary, status: claim.status };
        let items: LegalItem[] | null = null;
        try { items = await fetchSource(sourceId, input.now.slice(0, 10)); } catch { /* Failure is persisted independently below. */ }
        const saved = await store.complete(sourceId, id, new Date(now()).toISOString(), items);
        return { sourceId, status: saved.committed ? items === null ? "unavailable" : "collected" : "locked",
          itemCount: saved.row.entries.length, lastSuccessAt: saved.row.lastSuccessAt, nextRetryAt: saved.row.nextRetryAt };
      } catch { return { sourceId, status: "unavailable", itemCount: 0, lastSuccessAt: null }; }
    }));
    const completed = sources.filter(source => source.status === "collected" || source.status === "already-collected");
    const ok = completed.length === sources.length;
    const outcome = ok ? sources.some(source => source.status === "collected") ? "collected" : "already-collected"
      : completed.length ? "partial" : sources.some(source => source.status === "unavailable") ? "unavailable"
        : sources.some(source => source.status === "locked") ? "locked" : "retry-later";
    return { ok, outcome, day: input.day, sources,
      nextRetryAt: sources.map(source => source.nextRetryAt).filter((at): at is string => !!at).sort()[0] ?? null };
  };
}

export const collectLegalDaily = createLegalCollector({ store: legalArchiveStore, fetchSource: fetchLegalSource,
  now: Date.now, enabled: () => process.env.DISABLE_AUTO_REFRESH !== "true",
});
