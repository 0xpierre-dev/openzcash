import { SectionHeading } from "@/components/workspace";
import Link from "next/link";
import { Card, PageHeader, Stat } from "@/components/ui";
import { SourceRecordLink } from "@/components/source-record-link";
import { getPaymentSchedule } from "@/lib/zcg/schedule-repo";
import { formatUsdCents } from "@/lib/zcg/format";
import { Synced } from "@/components/synced";
export const dynamic = "force-dynamic";
export const metadata = { title: "Scheduled payments · OpenZcash" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10" → "Oct 2026". */
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${y}`;
}
/** "2026-10" → "2026-10-31", the month's last day. */
function monthEnd(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(last).padStart(2, "0")}`;
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; category?: string }>;
}) {
  const params = await searchParams;
  const s = await getPaymentSchedule(params);
  return (
    <>
      <PageHeader
        title="Scheduled payments"
        subtitle="Approved commitments with a future payment estimate. Plan by month and project."
      />
      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Scheduled value"
          value={
            <span className="ws-exact-amount">
              {formatUsdCents(s.totalCents)}
            </span>
          }
          sub="sum of the payments below"
        />
        <Stat
          label="Payments"
          value={String(s.rows.length)}
          sub="dated, unpaid milestones"
        />
        <Stat
          label="Without a date"
          value={String(s.undated)}
          sub="approved entries, outside this total"
        />
        <Stat
          label="Past estimate"
          value={String(s.overdue)}
          sub="unpaid entries with an earlier date"
        />
      </section>
      <form
        key={JSON.stringify([s.from, s.to, params.category ?? ""])}
        className="ws-filter-panel"
        method="get"
      >
        <label className="text-xs text-stone-600">
          From
          <input
            className="mt-2 block rounded-lg border bg-white px-3 py-2"
            type="date"
            name="from"
            defaultValue={s.from}
          />
        </label>
        <label className="text-xs text-stone-600">
          To
          <input
            className="mt-2 block rounded-lg border bg-white px-3 py-2"
            type="date"
            name="to"
            defaultValue={s.to ?? ""}
          />
        </label>
        <label className="text-xs text-stone-600">
          Category
          <select
            className="mt-2 block rounded-lg border bg-white px-3 py-2"
            name="category"
            defaultValue={params.category ?? ""}
          >
            <option value="">All categories</option>
            {s.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <button className="rounded-lg bg-amber-700 px-5 py-2.5 text-xs font-medium text-white">
          Apply filters
        </button>
        <Link href="/zcg/schedule" className="py-3 text-xs text-stone-600">
          Reset
        </Link>
      </form>
      {s.byMonth.length ? (
        <nav className="ws-month-strip" aria-label="Scheduled value by month">
          {s.byMonth.map((g) => {
            const from = `${g.label}-01`;
            const to = monthEnd(g.label);
            const category = params.category
              ? `&category=${encodeURIComponent(params.category)}`
              : "";
            return (
              <Link
                key={g.label}
                href={`/zcg/schedule?from=${from}&to=${to}${category}`}
                aria-current={s.from === from && s.to === to ? "page" : undefined}
              >
                <span>{monthLabel(g.label)}</span>
                <strong className="tnum">
                  {formatUsdCents(g.cents, { compact: true })}
                </strong>
                <small>
                  {g.count} {g.count === 1 ? "payment" : "payments"}
                </small>
              </Link>
            );
          })}
        </nav>
      ) : null}
      <SectionHeading
        title="Upcoming payments"
        count={s.rows.length}
        description="Estimated dates, budgeted USD and the source of each approved milestone."
      />
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left">
          <thead>
            <tr>
              {[
                "Estimated date",
                "Grant / milestone",
                "Recipient",
                "Category",
                "Budgeted USD",
                "Source",
              ].map((h) => (
                <th className="px-4" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {s.rows.map((r) => (
              <tr key={r.id} className="tbl-row border-b">
                <td className="whitespace-nowrap px-4 tnum">
                  {r.estimatedPayoutDate}
                </td>
                <td className="px-4">
                  <Link
                    href={`/zcg/grant?g=${encodeURIComponent(r.project!)}`}
                    className="font-medium text-stone-900 hover:text-amber-700"
                  >
                    {r.project}
                  </Link>
                  <span className="mt-1 block text-[11px] text-stone-500">
                    {r.milestoneLabel ?? r.deliverable ?? "Milestone"}
                  </span>
                </td>
                <td className="px-4">
                  <Link
                    href={`/zcg/recipient?r=${encodeURIComponent(r.recipientNameRaw ?? "")}`}
                  >
                    {r.recipientNameRaw}
                  </Link>
                </td>
                <td className="px-4">{r.category ?? "Uncategorized"}</td>
                <td className="whitespace-nowrap px-4 font-medium text-amber-800 tnum">
                  {formatUsdCents(r.amountUsdCents)}
                </td>
                <td className="px-4">
                  <SourceRecordLink
                    gid={r.sourceSheetGid}
                    rowIndex={r.sourceRowIndex}
                    importedAt={r.importedAt}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!s.rows.length && (
          <p className="p-8 text-center text-sm text-stone-600">
            No approved future payments match these filters.
          </p>
        )}
      </Card>
      <p className="mt-5 text-xs leading-relaxed text-stone-600">
        Dates are estimates, not payment confirmations. Cancelled, vetoed,
        returned, test and internal entries are excluded. {s.unknownAmount}{" "}
        dated entries have an unknown amount; {s.nonpositive} have a
        non-positive amount. Neither is counted as a future payment. Undated
        and past estimates remain available in each grant’s original milestone
        table. Day boundary: Brasília time.
      </p>
      <Synced className="mt-4" />
    </>
  );
}
