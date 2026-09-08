import { cn, nowMs } from "@/lib/utils";
import { latestImportAt } from "@/lib/zcg/freshness";
import { cached } from "@/lib/cache/memo";

/** Relative collection age; this does not describe when the source was edited. */
export function syncedAgo(at: Date | null): string {
  if (!at || !Number.isFinite(at.getTime())) return "not recorded yet";
  const mins = Math.floor((Date.now() - at.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/**
 * Per-page data-freshness stamp. A public transparency dashboard should say how
 * fresh every number is, not just the home page. Cached briefly so dropping it
 * on many pages doesn't add a DB round-trip each.
 */
export async function Synced({ className }: { className?: string }) {
  const at = await cached("latestImportAt", 60_000, () => latestImportAt());
  const validAt = at && Number.isFinite(at.getTime()) ? at : null;
  // Allow one hour of collection/cache grace beyond the six-hour schedule.
  const overdue = validAt && nowMs() - validAt.getTime() > 7 * 60 * 60_000;
  return (
    <p className={cn("text-xs text-stone-600", className)}>
      Last spreadsheet collection:{" "}
      {validAt ? (
        <time dateTime={validAt.toISOString()} title={validAt.toISOString()}>
          {syncedAgo(validAt)} ({validAt.toISOString().slice(0, 16).replace("T", " ")} UTC)
        </time>
      ) : "not recorded yet"}
      {overdue ? <span className="font-medium text-amber-800"> · Collection overdue</span> : null}
      {" · "}scheduled every 6h. This is retrieval time, not the source publication date.
    </p>
  );
}
