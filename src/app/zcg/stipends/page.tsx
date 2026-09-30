import { FeatureLink, SectionHeading } from "@/components/workspace";
import Link from "next/link";
import { Badge, Card, PageHeader, Stat } from "@/components/ui";
import { Synced } from "@/components/synced";
import { formatUsdCents } from "@/lib/zcg/format";
import { getStipendSummary, type MemberStipend } from "@/lib/zcg/stipends";
import { categoryTotals } from "@/lib/zcg/totals-repo";
import { spreadsheetSource } from "@/lib/zcg/source-links";
import { classifyLabel } from "@/lib/zcg/classification-tags";
import { cached, LEDGER_TTL_MS } from "@/lib/cache/memo";
import { COHORTS, MEMBERS } from "../current-committee-data";
import { pageMetadata } from "@/lib/seo/page-metadata";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-01-05" → "Jan 2026". */
function monthOf(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return m ? `${MONTHS[m - 1]} ${y}` : iso;
}
/** The seat behind a stipend line, when the seat's name is in it. */
function seatOf(m: MemberStipend) {
  const who = m.member.toLowerCase();
  return MEMBERS.find((seat) => who.includes(seat.name.toLowerCase()));
}
const isCurrent = (m: MemberStipend) => seatOf(m) !== undefined;

export const dynamic = "force-dynamic";
export const metadata = pageMetadata({
  title: "Committee stipends · OpenZcash",
  description:
    "Monthly stipends paid to each ZCG committee member. This is the committee's own compensation, not a grant. Mirrored from the ZCG monthly-payments sheet.",
  path: "/zcg/stipends",
});

export default async function StipendsPage() {
  const [{ members, totalUsd: total, totalPayments }, cats] = await Promise.all([
    getStipendSummary(),
    // The all-time "stipends" classification of the totals sheet, the broader
    // scope the monthly tab does not reach back to.
    cached("totals:cats:zcg_grants", LEDGER_TTL_MS, () =>
      categoryTotals("zcg_grants"),
    ).catch(() => []),
  ]);
  const stipendCats = cats.filter((c) => classifyLabel(c.label).kind === "stipends");
  const allTimeUsd = stipendCats.reduce((s, c) => s + Number(c.usdPaidToDateCents), 0);
  const pivotSource = spreadsheetSource(stipendCats[0]?.sourceSheetGid ?? null, null).sourceUrl;
  const beforeTabUsd = Math.max(allTimeUsd - total, 0);
  const dates = members.flatMap((m) => [m.firstPaid, m.lastPaid]).filter(Boolean).sort();
  const scope =
    dates.length > 0 ? `${monthOf(dates[0])} → ${monthOf(dates[dates.length - 1])}` : "monthly tab";
  const current = members.filter(isCurrent);
  const former = members.filter((m) => !isCurrent(m));

  return (
    <>
      <PageHeader
        title="Committee stipends"
        subtitle="Monthly stipends paid to each ZCG committee member. This is the committee's own compensation, not a grant. Mirrored from the ZCG monthly-payments sheet."
      />

      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Paid in this tab"
          value={formatUsdCents(total, { compact: true })}
          sub={`monthly-payments tab · ${scope}`}
          tone="warn"
        />
        <Stat
          label="All-time stipends"
          value={allTimeUsd > 0 ? formatUsdCents(allTimeUsd, { compact: true }) : "n/a"}
          sub="cumulative classification, every cohort"
        />
        <Stat
          label="Members paid"
          value={String(members.length)}
          sub={`${current.length} seated · ${former.length} former, in this tab`}
        />
        <Stat
          label="Payments"
          value={String(totalPayments)}
          sub="monthly transfers"
        />
      </section>

      {allTimeUsd > 0 ? (
        <section className="ws-reconcile" aria-label="Where the two stipend figures differ">
          <h2>Where the difference is</h2>
          <div className="ws-reconcile-row">
            <span>Cumulative classification, every cohort</span>
            <strong className="tnum">{formatUsdCents(allTimeUsd)}</strong>
            {pivotSource ? (
              <a href={pivotSource} target="_blank" rel="noreferrer">
                totals tab ↗
              </a>
            ) : (
              <span />
            )}
          </div>
          <div className="ws-reconcile-row">
            <span>
              Itemised in the monthly-payments tab · {scope} · {totalPayments}{" "}
              payments
            </span>
            <strong className="tnum">− {formatUsdCents(total)}</strong>
            <Link href="/zcg/disbursements?sheet=monthly">every payment →</Link>
          </div>
          <div className="ws-reconcile-row ws-reconcile-sum">
            <span>
              Paid before the tab begins. The spreadsheet only carries this
              part as a total, so it cannot be opened payment by payment or by
              member.
            </span>
            <strong className="tnum">{formatUsdCents(beforeTabUsd)}</strong>
            <span />
          </div>
        </section>
      ) : null}

      {members.length > 0 ? (
        [
          { title: "Current committee", list: current, description: "Seated members, summed from the monthly-payments tab. Open a line to inspect every dated payment and its source." },
          { title: "Former members", list: former, description: "Members whose seat ended within the tab's range. Earlier cohorts are not in this tab; their stipends only exist in the all-time classification above." },
        ]
          .filter((g) => g.list.length > 0)
          .map(({ title, list, description }) => (
            <section key={title} className="mb-8">
              <SectionHeading title={title} count={list.length} description={description} />
              <div className="ws-stipend-list">
                <div className="ws-stipend-head" aria-hidden>
                  <span>Member</span>
                  <span>Paid</span>
                  <span>Payments</span>
                  <span>Period</span>
                  <span />
                </div>
                {list.map((m) => {
                  const seat = seatOf(m);
                  return (
                    <Link
                      key={m.member}
                      href={`/zcg/recipient?r=${encodeURIComponent(m.member)}`}
                      className="ws-stipend-row"
                    >
                      <span className="ws-stipend-who">
                        {seat ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={seat.img} alt="" width={32} height={32} />
                        ) : (
                          <i aria-hidden>{m.member.slice(0, 1)}</i>
                        )}
                        <span>
                          <strong>{seat?.name ?? m.member}</strong>
                          <small>
                            {seat
                              ? `${COHORTS[seat.cohort].label} · ${seat.term}`
                              : "seat ended"}
                          </small>
                        </span>
                      </span>
                      <strong className="ws-stipend-amount tnum">
                        {formatUsdCents(m.totalUsd)}
                      </strong>
                      <span className="tnum">{m.payments}</span>
                      <span className="ws-stipend-period tnum">
                        {m.firstPaid && m.lastPaid
                          ? `${monthOf(m.firstPaid)} → ${monthOf(m.lastPaid)}`
                          : "Unknown"}
                      </span>
                      <span aria-hidden>→</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))
      ) : (
        <Card>
          <p className="text-sm text-stone-600">
            No monthly stipend rows are present in the ledger yet.
          </p>
        </Card>
      )}

      <div className="mt-4 flex items-start gap-2">
        <Badge tone="violet">Committee salaries</Badge>
        <p className="text-xs leading-relaxed text-stone-600">
          These are internal ZCG payments, excluded from the external recipient
          tables. The per-member figures sum the monthly-payments tab, which
          starts in {dates.length > 0 ? monthOf(dates[0]) : "its first month"}; the{" "}
          <Link href="/zcg/totals" className="text-amber-700 hover:underline">
            &ldquo;Committee stipends&rdquo;
          </Link>{" "}
          classification on the totals page is the cumulative figure for every
          cohort since the programme began. Two scopes of the same programme (see{" "}
          <Link
            href="/zcg/methodology"
            className="text-amber-700 hover:underline"
          >
            methodology
          </Link>
          ).
        </p>
      </div>

      <FeatureLink
        title="The people behind ZCG"
        description="See current terms, source-linked roles and the committee's election history."
        href="/zcg/committee"
        label="Meet the committee"
      />
      <Synced className="mt-6" />
    </>
  );
}
