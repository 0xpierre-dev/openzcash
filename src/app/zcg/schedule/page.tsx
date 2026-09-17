import {
  SectionHeading,
  RecordLayout,
  RelatedLinks,
} from "@/components/workspace";
import Link from "next/link";
import { Card, PageHeader, Stat } from "@/components/ui";
import { SourceRecordLink } from "@/components/source-record-link";
import { getPaymentSchedule } from "@/lib/zcg/schedule-repo";
import { formatUsdCents } from "@/lib/zcg/format";
import { Synced } from "@/components/synced";
export const dynamic = "force-dynamic";
export const metadata = { title: "Scheduled payments · OpenZcash" };
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
        subtitle="Approved commitments with a future payment estimate. Plan by month, category and project."
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
      <form className="ws-filter-panel" method="get">
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
      <RecordLayout
        aside={
          <>
            {" "}
            <div className="ws-schedule-breakdowns">
              <Card>
                <h2>By category</h2>
                {s.byCategory.length ? (
                  s.byCategory.map((g) => (
                    <div className="rd-breakdown" key={g.label}>
                      <span>
                        {g.label}
                        <small>{g.count} payments</small>
                      </span>
                      <strong className="tnum">
                        {formatUsdCents(g.cents)}
                      </strong>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-stone-600">
                    No scheduled payments in this selection.
                  </p>
                )}
              </Card>
              <Card>
                <h2>By month</h2>
                {s.byMonth.map((g) => (
                  <div className="rd-breakdown" key={g.label}>
                    <span>
                      {g.label}
                      <small>{g.count} payments</small>
                    </span>
                    <strong className="tnum">{formatUsdCents(g.cents)}</strong>
                  </div>
                ))}
              </Card>
            </div>
            <RelatedLinks
              links={[
                { href: "/zcg/grants", label: "All grant commitments" },
                { href: "/zcg/disbursements", label: "Recorded payments" },
              ]}
            />
          </>
        }
      >
        <SectionHeading
          title="Upcoming payments"
          count={s.rows.length}
          description="Estimated dates, budgeted USD and the source of each approved milestone."
        />
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[780px] text-left">
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
      </RecordLayout>
      <Synced className="mt-4" />
    </>
  );
}
