import Link from "next/link";
import { SectionHeading, SourceNote } from "@/components/workspace";
import { Card, PageHeader, Stat } from "@/components/ui";
import { getMayaPosition, ZCG_MAYA_MEMBER, ZCG_MAYA_ZEC_ADDRESS } from "@/lib/defi/maya-position";
import { latestSnapshot, mayaTransfers } from "@/lib/zcg/snapshots-repo";
import { currentZecUsdCents, zatToUsdCents } from "@/lib/pricing/live-price";
import { formatUsdCents } from "@/lib/zcg/format";
import { formatZec } from "@/lib/zcash/units";
import { spreadsheetSource } from "@/lib/zcg/source-links";
import { ZCG_GIDS } from "@/lib/zcg/sheets";

export const dynamic = "force-dynamic";
export const metadata = { title: "ZCG Investments · OpenZcash" };

/** The ZCG announcement of the Maya position: amount, custody, fee policy. */
const MAYA_ANNOUNCEMENT = "https://forum.zcashcommunity.com/t/zcg-maya-liquidity/51608";
const MAYA_SIGNERS = [
  { name: "Jason", org: "ZCG" },
  { name: "Aaluxx", org: "Maya Protocol" },
  { name: "Alex", org: "FPF" },
];

function usd0(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}


function signed(cents: bigint): string {
  const abs = cents < 0n ? -cents : cents;
  return `${cents < 0n ? "−" : "+"}${formatUsdCents(abs, { compact: true })}`;
}

export default async function InvestmentsPage() {
  const [transfers, maya, liveCents, live] = await Promise.all([
    mayaTransfers(),
    latestSnapshot("maya_liquidity").catch(() => null),
    currentZecUsdCents().catch(() => null),
    getMayaPosition(),
  ]);
  const lpZec = transfers.reduce((s, t) => s + (t.zecTransferredZat ?? 0n), 0n);
  const lpUsd = transfers.reduce((s, t) => s + (t.amountUsdCents ?? 0n), 0n);
  const seededOn = transfers.map((t) => t.transferredAt).filter(Boolean).sort()[0] ?? null;
  // What the contributed ZEC would be worth today, at the live price.
  const zecTodayCents = liveCents != null ? zatToUsdCents(lpZec, liveCents) : null;
  // What the position is actually worth: live from Midgard when it answers,
  // otherwise the sheet's hand-updated KPIs.
  const sheetCents = maya?.usdCashBalanceCents ?? null;
  const kpiAsOf = maya?.status?.replace(/^kpis as of /i, "") ?? null;
  const positionCents = live?.totalCents != null ? BigInt(live.totalCents) : sheetCents;
  const vsCost = positionCents != null ? positionCents - lpUsd : null;
  const vsHolding = positionCents != null && zecTodayCents != null ? positionCents - zecTodayCents : null;
  const n2 = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const n0 = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const mayaTab = spreadsheetSource(ZCG_GIDS.maya, null).sourceUrl;

  return (
    <>
      <PageHeader
        title="Investments"
        subtitle="Positions ZCG holds with treasury funds outside grants. One today: the liquidity ZCG and FPF seeded in the ZEC pool on Maya Protocol, read live from the chain."
      />

      {transfers.length > 0 ? (
        <section className="mb-10">
          <SectionHeading
            title="Maya Protocol · ZEC pool"
            description={`ZCG and FPF seeded ${formatUsdCents(lpUsd, { compact: true })} of liquidity into the ZEC pool on Maya Protocol${seededOn ? ` on ${seededOn}` : ""}; the fees go to ZCG's treasury. The wallet figures are updated by hand in the ZCG spreadsheet${kpiAsOf ? ` (as of ${kpiAsOf})` : ""}.`}
          />
          <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label="Seeded"
              value={formatUsdCents(lpUsd, { compact: true })}
              sub={`${formatZec(lpZec, { symbol: false })} ZEC · ${transfers.length} transfers`}
            />
            <Stat
              label="Those ZEC today"
              value={zecTodayCents != null ? formatUsdCents(zecTodayCents, { compact: true }) : "n/a"}
              sub="at the live price, had they been held"
            />
            <Stat
              label="Position now"
              value={positionCents != null ? formatUsdCents(positionCents, { compact: true }) : "n/a"}
              sub={
                live
                  ? `${n2(live.zecNow)} ZEC + ${n0(live.cacaoNow)} CACAO · live`
                  : maya?.zecBalanceZat != null
                    ? `${formatZec(maya.zecBalanceZat, { symbol: false })} ZEC + CACAO · sheet`
                    : "position value"
              }
              tone={vsCost != null ? (vsCost >= 0n ? "in" : "out") : "default"}
            />
            <Stat
              label="Versus holding"
              value={vsHolding != null ? signed(vsHolding) : "n/a"}
              sub={vsCost != null ? `${signed(vsCost)} versus the cost` : "position minus the ZEC's value today"}
              tone={vsHolding != null ? (vsHolding >= 0n ? "in" : "out") : "default"}
            />
          </div>
          <Card className="p-0">
            <table className="w-full text-left text-sm">
              <thead className="tbl-head text-[11px] uppercase tracking-wider text-stone-600">
                <tr className="border-b border-stone-200">
                  <th className="px-4 py-3 font-medium">Transfer</th>
                  <th className="px-4 py-3 text-right font-medium">USD</th>
                  <th className="px-4 py-3 text-right font-medium">ZEC</th>
                  <th className="px-4 py-3 text-right font-medium">ZEC/USD</th>
                  <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => (
                  <tr key={t.id} className="tbl-row border-b border-stone-200 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-stone-900">{t.project ?? "·"}</td>
                    <td className="px-4 py-2.5 text-right text-stone-700 tnum">{formatUsdCents(t.amountUsdCents)}</td>
                    <td className="px-4 py-2.5 text-right text-stone-700 tnum">
                      {t.zecTransferredZat != null ? formatZec(t.zecTransferredZat, { symbol: false }) : "·"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-stone-700 tnum">
                      {t.zecUsdPriceCents != null ? formatUsdCents(t.zecUsdPriceCents) : "·"}
                    </td>
                    <td className="hidden px-4 py-2.5 text-right text-xs text-stone-600 sm:table-cell tnum">{t.transferredAt ?? "·"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {live ? (
            <div className="ws-position">
              <span className="ws-copilot-label">The position, live from Maya</span>
              <dl>
                <div>
                  <dt>Went in{live.firstAdded ? ` · ${live.firstAdded}` : ""}</dt>
                  <dd className="tnum">{n2(live.zecAdded)} ZEC + {n0(live.cacaoAdded)} CACAO</dd>
                </div>
                <div>
                  <dt>Withdrawn</dt>
                  <dd className="tnum">
                    {live.zecWithdrawn === 0 && live.cacaoWithdrawn === 0
                      ? "nothing"
                      : `${n2(live.zecWithdrawn)} ZEC + ${n0(live.cacaoWithdrawn)} CACAO`}
                  </dd>
                </div>
                <div>
                  <dt>Holds today · {(live.share * 100).toFixed(1)}% of the pool</dt>
                  <dd className="tnum">{n2(live.zecNow)} ZEC + {n0(live.cacaoNow)} CACAO</dd>
                </div>
                <div>
                  <dt>Valued at</dt>
                  <dd className="tnum">
                    {live.zecLegCents != null ? formatUsdCents(BigInt(live.zecLegCents), { compact: true }) : "n/a"} in ZEC
                    {live.zecUsd != null ? ` (${usd0(live.zecUsd)}/ZEC)` : ""} +{" "}
                    {live.cacaoLegCents != null ? formatUsdCents(BigInt(live.cacaoLegCents), { compact: true }) : "n/a"} in CACAO
                    {live.cacaoUsd != null ? ` ($${live.cacaoUsd.toFixed(4)}/CACAO, ${live.cacaoPriceSource === "coingecko" ? "CoinGecko" : "pool-implied"})` : ""}
                  </dd>
                </div>
                {live.midgardCents != null ? (
                  <div>
                    <dt>Midgard&rsquo;s own quote</dt>
                    <dd className="tnum">
                      {formatUsdCents(BigInt(live.midgardCents), { compact: true })}
                      {sheetCents != null ? ` · the sheet's KPI${kpiAsOf ? ` (${kpiAsOf})` : ""}: ${formatUsdCents(sheetCents, { compact: true })}` : ""}
                    </dd>
                  </div>
                ) : null}
              </dl>
              <p>
                Member{" "}
                <a href={`https://www.mayascan.org/address/${ZCG_MAYA_MEMBER}`} target="_blank" rel="noreferrer">
                  {ZCG_MAYA_MEMBER.slice(0, 12)}…{ZCG_MAYA_MEMBER.slice(-4)} ↗
                </a>
                {" · ZEC address "}
                <a href={`https://mainnet.zcashexplorer.app/address/${ZCG_MAYA_ZEC_ADDRESS}`} target="_blank" rel="noreferrer">
                  {ZCG_MAYA_ZEC_ADDRESS.slice(0, 10)}…{ZCG_MAYA_ZEC_ADDRESS.slice(-4)} ↗
                </a>
                . Midgard prices CACAO far below CoinGecko, which is why its
                quote and the sheet&rsquo;s KPI sit under the valuation above.
              </p>
            </div>
          ) : null}
          {live && live.earnings.length > 0 ? (
            <div className="ws-position">
              <span className="ws-copilot-label">Fees earned, ZCG&rsquo;s share</span>
              <dl>
                <div>
                  <dt>Net pool earnings since {live.earnings[0].month}</dt>
                  <dd className="tnum">
                    {n0(live.earningsCacao)} CACAO
                    {live.earningsCents != null ? ` ≈ ${formatUsdCents(BigInt(live.earningsCents), { compact: true })}` : ""}
                  </dd>
                </div>
                <div>
                  <dt>Gross swap fees, before the share the protocol keeps</dt>
                  <dd className="tnum">
                    {n0(live.feesCacao)} CACAO
                    {live.feesCents != null ? ` ≈ ${formatUsdCents(BigInt(live.feesCents), { compact: true })}` : ""}
                  </dd>
                </div>
              </dl>
              <div className="ws-earnings">
                {live.earnings.map((m) => (
                  <span key={m.month} title={`${m.month}: ${n0(m.zcgEarningsCacao)} CACAO, ${(m.share * 100).toFixed(1)}% of the pool`}>
                    <i style={{ height: `${Math.max(2, Math.round((m.zcgEarningsCacao / Math.max(...live.earnings.map((x) => x.zcgEarningsCacao), 1)) * 44))}px` }} />
                    <small>{m.month.slice(2).replace("-", "/")}</small>
                  </span>
                ))}
              </div>
              <p>
                Earnings accrue into the pool, so they are already inside the
                position above; nothing has been paid out to the treasury. The
                pool&rsquo;s monthly earnings come from Midgard, multiplied by
                ZCG&rsquo;s share of the pool units in that month. The sheet&rsquo;s
                &ldquo;Total Fee Revenue&rdquo; cell is empty.
              </p>
            </div>
          ) : null}
          <div className="ws-custody">
            <span className="ws-copilot-label">Custody</span>
            <p>
              A 2-of-3 multisig on Vultisig. Keys held by{" "}
              {MAYA_SIGNERS.map((s, i) => (
                <span key={s.name}>
                  {i > 0 ? (i === MAYA_SIGNERS.length - 1 ? " and " : ", ") : ""}
                  <strong>{s.name}</strong>{` (${s.org})`}
                </span>
              ))}
              . Any two of the three can move the position.{" "}
              <a href={MAYA_ANNOUNCEMENT} target="_blank" rel="noreferrer">
                ZCG announcement ↗
              </a>
              {mayaTab ? (
                <>
                  {" · "}
                  <a href={mayaTab} target="_blank" rel="noreferrer">
                    Liquidity tab ↗
                  </a>
                </>
              ) : null}
            </p>
          </div>
          <SourceNote>
            Half of the contributed ZEC was swapped into CACAO to form the pair,
            and as ZEC rose the pool kept selling ZEC for CACAO: nothing was
            withdrawn, but the position holds far fewer ZEC than went in.
            &ldquo;Versus holding&rdquo; compares the position with simply
            keeping the contributed ZEC. Fee revenue is not yet reported in the
            sheet.
          </SourceNote>
        </section>
      ) : null}

      <p className="ws-copilot-fine">
        Pool depth and yield across every venue that holds native ZEC are on{" "}
        <Link href="/defi">DeFi →</Link>.
      </p>
    </>
  );
}
