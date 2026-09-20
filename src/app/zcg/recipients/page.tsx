import { FeatureLink, SourceNote } from "@/components/workspace";
import { formatZecCompact } from "@/lib/zcash/units";
import { Card, PageHeader, Stat } from "@/components/ui";
import { recipientTotals } from "@/lib/zcg/disbursements-repo";
import { formatUsdCents } from "@/lib/zcg/format";
import { RecipientsTable, type RecipientRow } from "./recipients-table";
import { cached, LEDGER_TTL_MS } from "@/lib/cache/memo";
import { Synced } from "@/components/synced";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recipients ZCG · OpenZcash" };

export default async function RecebedoresPage() {
  const all = await cached("recipientTotals", LEDGER_TTL_MS, () =>
    recipientTotals(),
  );
  // Keep anyone with ecosystem lines, ranked by that money only. A recipient
  // whose ledger is PURELY internal (the ZCG bucket, discretionary budget)
  // stays out. Rank only recorded external payments; preserve unpaid budgets
  // in a separate column so a newly approved grantee is still discoverable.
  const external = all
    .filter((r) => r.externalUsdCents > 0n || r.externalZecZat > 0n)
    .sort((a, b) =>
      b.externalPaidUsdCents > a.externalPaidUsdCents
        ? 1
        : b.externalPaidUsdCents < a.externalPaidUsdCents
          ? -1
          : 0,
    );
  const grandTotal = external.reduce((s, r) => s + r.externalPaidUsdCents, 0n);
  const maxUsd = external.reduce(
    (m, r) => (r.externalPaidUsdCents > m ? r.externalPaidUsdCents : m),
    0n,
  );

  const rows: RecipientRow[] = external.map((r, i) => ({
    rank: i + 1,
    recipientKey: r.recipientKey,
    recipient: r.recipientName,
    grantCount: r.grantCount,
    paymentCount: r.externalPaymentCount,
    lastPaid: r.externalLastPaid ?? "",
    _usd: Number(r.externalPaidUsdCents),
    _zec: Number(r.externalPaidZecZat),
    _budgetedUsd: Number(r.externalUsdCents),
  }));

  return (
    <>
      <PageHeader
        title="Recipients"
        subtitle="Recorded payments to organizations and individuals across the ZCG and Coinholder ledgers. USD paid is the budgeted value of settled entries, not a current market valuation. Budgets are shown separately; committee stipends and internal operating costs are excluded."
      />

      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Recipients"
          value={String(external.length)}
          sub="orgs and individuals"
        />
        <Stat
          label="USD paid to date"
          value={formatUsdCents(grandTotal, { compact: true })}
          sub="recorded external payments"
          tone="warn"
        />
        <Stat
          label="Top recipient"
          value={formatUsdCents(maxUsd, { compact: true })}
          sub={external[0]?.recipientName ?? "n/a"}
        />
        <Stat
          label="ZEC paid"
          value={formatZecCompact(
            external.reduce((s, r) => s + r.externalPaidZecZat, 0n),
            { symbol: false },
          )}
          sub="recorded external payments"
          tone="in"
        />
      </section>

      <Card className="p-0 overflow-hidden">
        <RecipientsTable rows={rows} />
      </Card>

      <p className="mt-3 text-xs text-stone-600">
        Budgeted USD includes all recorded entries, including unpaid or
        cancelled milestones. It is not money received or an outstanding
        commitment. Paid amounts remain counted if a grant was later cancelled;
        delivery and impact are not independently verified here.
      </p>

      <SourceNote>
        USD paid is the budgeted value of settled entries, not a current market
        valuation. Committee stipends and internal operating costs are excluded
        from this ranking.
      </SourceNote>
      <FeatureLink
        title="Committee compensation"
        description="View the separate stipend ledger and follow each member's payment history."
        href="/zcg/stipends"
        label="View stipends"
      />
      <Synced className="mt-4" />
    </>
  );
}
