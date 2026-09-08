/** A source's own reference date, deliberately separate from collection time. */
export function SourceDateNotice({ date, now }: { date: string | null; now: number }) {
  const timestamp = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : NaN;
  const valid = Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date;
  const days = valid ? Math.floor(now / 86_400_000) - Math.floor(timestamp / 86_400_000) : null;
  return (
    <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
      <span className="font-semibold">Source reference date: </span>
      {valid ? <time dateTime={date!}>{date}</time> : "not provided"}
      {days != null ? (days < 0 ? " (future date reported by source)" : ` (${days} ${days === 1 ? "day" : "days"} ago)`) : null}
      . Treasury figures are a spreadsheet snapshot, not live balances. Automatic checks do not change the source reference date.
    </p>
  );
}
