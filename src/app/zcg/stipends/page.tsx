import { FeatureLink, SectionHeading } from "@/components/workspace";
import Link from "next/link";
import { Badge, Card, PageHeader, Stat } from "@/components/ui";
import { Synced } from "@/components/synced";
import { formatUsdCents } from "@/lib/zcg/format";
import { cached, LEDGER_TTL_MS } from "@/lib/cache/memo";
import { listDisbursements } from "@/lib/zcg/disbursements-repo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Committee stipends · OpenZcash" };

type MemberStipend = {
  member: string;
  totalUsd: number;
  payments: number;
  firstPaid: string;
  lastPaid: string;
};

export default async function StipendsPage() {
  const rows = await cached("stipends:monthly", LEDGER_TTL_MS, () =>
    listDisbursements({ sheet: "monthly", limit: 1000 }),
  );

  const byMember = new Map<string, MemberStipend>();
  for (const d of rows) {
    const member = d.recipientNameRaw || "Unknown";
    const usd = d.amountUsdCents != null ? Number(d.amountUsdCents) : 0;
    const date = d.paidOutDate ?? "";
    const cur = byMember.get(member);
    if (!cur) {
      byMember.set(member, {
        member,
        totalUsd: usd,
        payments: 1,
        firstPaid: date,
        lastPaid: date,
      });
    } else {
      cur.totalUsd += usd;
      cur.payments += 1;
      if (date && (!cur.firstPaid || date < cur.firstPaid))
        cur.firstPaid = date;
      if (date && date > cur.lastPaid) cur.lastPaid = date;
    }
  }
  const members = [...byMember.values()].sort(
    (a, b) => b.totalUsd - a.totalUsd,
  );
  const total = members.reduce((s, m) => s + m.totalUsd, 0);
  const totalPayments = members.reduce((s, m) => s + m.payments, 0);

  return (
    <>
      <PageHeader
        title="Committee stipends"
        subtitle="Monthly stipends paid to each ZCG committee member. This is the committee's own compensation, not a grant. Mirrored from the ZCG monthly-payments sheet."
        actions={
          <Link
            href="/zcg/totals"
            className="text-xs text-stone-600 hover:text-stone-800"
          >
            ‹ Totals
          </Link>
        }
      />

      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat
          label="Total stipends"
          value={formatUsdCents(total, { compact: true })}
          sub="paid to date"
          tone="warn"
        />
        <Stat
          label="Members paid"
          value={String(members.length)}
          sub="recipients"
        />
        <Stat
          label="Payments"
          value={String(totalPayments)}
          sub="monthly transfers"
        />
      </section>

      {members.length > 0 ? (
        <section>
          <SectionHeading
            title="Compensation by member"
            count={members.length}
            description="Open a profile to inspect every dated payment and its source."
          />
          <div className="ws-member-payments">
            {members.map((m) => (
              <Link
                key={m.member}
                href={`/zcg/recipient?r=${encodeURIComponent(m.member)}`}
              >
                <div className="ws-member-initial" aria-hidden>
                  {m.member.slice(0, 1)}
                </div>
                <h2>{m.member}</h2>
                <strong className="ws-amount-large">
                  {formatUsdCents(m.totalUsd)}
                </strong>
                <dl>
                  <div>
                    <dt>Payments</dt>
                    <dd>{m.payments}</dd>
                  </div>
                  <div>
                    <dt>First payment</dt>
                    <dd>{m.firstPaid || "Unknown"}</dd>
                  </div>
                  <div>
                    <dt>Last payment</dt>
                    <dd>{m.lastPaid || "Unknown"}</dd>
                  </div>
                </dl>
                <span>Open payment history →</span>
              </Link>
            ))}
          </div>
        </section>
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
          tables. This page sums the monthly-payments tab; the cumulative{" "}
          <Link href="/zcg/totals" className="text-amber-700 hover:underline">
            &ldquo;Committee stipends&rdquo;
          </Link>{" "}
          classification on the totals page is a broader, all-time figure. Two
          scopes of the same programme (see{" "}
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
