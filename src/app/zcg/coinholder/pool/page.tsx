import { SectionHeading, SourceNote } from "@/components/workspace";
import { PageHeader, Stat } from "@/components/ui";
import { currentLockboxZec } from "@/lib/zcash/lockbox-live";
import { currentZecUsdCents, zatToUsdCents } from "@/lib/pricing/live-price";
import {
  categoryTotals,
  grandTotal,
  recipientTotalsFromSheet,
} from "@/lib/zcg/totals-repo";
import { formatUsdCents } from "@/lib/zcg/format";
import { Synced } from "@/components/synced";
import { formatZec } from "@/lib/zcash/units";
import {
  TotalsTables,
  type CategoryRow,
  type RecipientRow,
} from "../../totals/totals-tables";

export const dynamic = "force-dynamic";
export const metadata = { title: "Coinholder pool · OpenZcash" };

export default async function CoinholderPoolPage() {
  const [lock, cats, recips, grand, liveCents] = await Promise.all([
    currentLockboxZec(),
    categoryTotals("coinholder"),
    recipientTotalsFromSheet("coinholder"),
    grandTotal("coinholder"),
    currentZecUsdCents(),
  ]);

  const total = grand[0]?.usdPaidToDateCents ?? 0n;
  const external = recips.filter((r) => !r.isInternalBucket);
  const totalNum = Number(total);
  const share = (cents: bigint) =>
    totalNum > 0 ? (Number(cents) / totalNum) * 100 : 0;

  const categoryRows: CategoryRow[] = cats.map((c) => ({
    key: `${c.pool}:${c.label}`,
    category: c.label,
    _usd: Number(c.usdPaidToDateCents),
    _pct: share(c.usdPaidToDateCents),
    href: `/zcg/disbursements?sheet=coinholder_grants&category=${encodeURIComponent(c.label)}`,
  }));

  const recipientRows: RecipientRow[] = external.map((r, i) => ({
    key: `${r.pool}:${r.label}`,
    rank: i + 1,
    recipient: r.label,
    _usd: Number(r.usdPaidToDateCents),
    _future: Number(r.usdFuturePipelineCents ?? 0n),
    _pct: share(r.usdPaidToDateCents),
    href: `/zcg/recipient?r=${encodeURIComponent(r.label)}`,
  }));

  const zec = lock?.zat ?? 0n;
  const priceCents = liveCents ?? lock?.snap?.zecusdPriceCents ?? null;
  const holdings =
    priceCents != null
      ? zatToUsdCents(zec, priceCents)
      : (lock?.snap?.usdTotalHoldingsCents ?? 0n);
  const receivables = lock?.snap?.zecReceivablesZat ?? 0n;

  return (
    <>
      <PageHeader
        title="Coinholder pool"
        subtitle="The ZIP-1016 Lockbox pool that funds Coinholder Grants: live balance, its value, what has been paid out and what is still owed to the pool. Balances and totals mirror the ZCG public spreadsheet; the ZCG committee pool is accounted separately."
      />

      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Current ZEC balance"
          value={formatZec(zec, { symbol: false })}
          sub="Lockbox · ZIP-1016 pool"
        />
        <Stat
          label="USD value of holdings"
          value={formatUsdCents(holdings, { compact: true })}
          sub={liveCents != null ? "at live price" : "at the day's price"}
        />
        <Stat
          label="USD paid out to date"
          value={formatUsdCents(total, { compact: true })}
          sub="to recipients"
        />
        <Stat
          label="ZEC receivables"
          value={formatZec(receivables, { symbol: false })}
          sub="pending to the pool"
        />
      </section>

      <>
        <SectionHeading
          title="Funding history"
          description="Official paid amounts by classification and recipient, from the Coinholder Grants sheet."
        />
        <TotalsTables categoryRows={categoryRows} recipientRows={recipientRows} />
        <SourceNote>
          {total > 0n
            ? `Coinholder Grants grand total: ${formatUsdCents(total)} paid out to date, imported from the sheet. `
            : ""}
          Paid values are the ledger&apos;s budgeted USD amounts. Recorded payment
          does not independently verify delivery.
        </SourceNote>
        <Synced className="mt-6" />
      </>
    </>
  );
}
