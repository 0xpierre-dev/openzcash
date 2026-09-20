import { SectionHeading, SourceNote } from "@/components/workspace";
import { Badge, Card, PageHeader, Stat } from "@/components/ui";
import { getDefiPools } from "@/lib/defi/pools";
import { latestSnapshot, mayaTransfers } from "@/lib/zcg/snapshots-repo";
import { currentZecUsdCents, zatToUsdCents } from "@/lib/pricing/live-price";
import { formatUsdCents } from "@/lib/zcg/format";
import { formatZec } from "@/lib/zcash/units";
import { spreadsheetSource } from "@/lib/zcg/source-links";
import { ZCG_GIDS } from "@/lib/zcg/sheets";

export const dynamic = "force-dynamic";
export const metadata = { title: "ZEC DeFi liquidity · OpenZcash" };

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

function zec(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function signed(cents: bigint): string {
  const abs = cents < 0n ? -cents : cents;
  return `${cents < 0n ? "−" : "+"}${formatUsdCents(abs, { compact: true })}`;
}

export default async function DefiPage() {
  const [pools, transfers, maya, liveCents] = await Promise.all([
    getDefiPools(),
    mayaTransfers(),
    latestSnapshot("maya_liquidity").catch(() => null),
    currentZecUsdCents().catch(() => null),
  ]);
  const totalZec = pools.reduce((s, p) => s + p.zecDepth, 0);
  const totalTvl = pools.reduce((s, p) => s + p.tvlUsd, 0);
  const lpZec = transfers.reduce((s, t) => s + (t.zecTransferredZat ?? 0n), 0n);
  const lpUsd = transfers.reduce((s, t) => s + (t.amountUsdCents ?? 0n), 0n);
  const seededOn = transfers.map((t) => t.transferredAt).filter(Boolean).sort()[0] ?? null;
  // What the contributed ZEC would be worth today, at the live price.
  const zecTodayCents = liveCents != null ? zatToUsdCents(lpZec, liveCents) : null;
  // What the position is actually worth, from the sheet's hand-updated KPIs.
  const walletCents = maya?.usdCashBalanceCents ?? null;
  const walletZec = maya?.zecBalanceZat ?? null;
  const kpiAsOf = maya?.status?.replace(/^kpis as of /i, "") ?? null;
  const vsCost = walletCents != null ? walletCents - lpUsd : null;
  const vsHolding = walletCents != null && zecTodayCents != null ? walletCents - zecTodayCents : null;
  const mayaTab = spreadsheetSource(ZCG_GIDS.maya, null).sourceUrl;

  return (
    <>
      <PageHeader
        title="ZEC DeFi liquidity"
        subtitle="Native ZEC pool depth, value locked and yield from public Midgard APIs (Maya Protocol, THORChain), refreshed every few minutes, and the position ZCG seeded on Maya."
      />

      {transfers.length > 0 ? (
        <section className="mb-10">
          <SectionHeading
            title="ZCG's position on Maya"
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
              value={walletCents != null ? formatUsdCents(walletCents, { compact: true }) : "n/a"}
              sub={
                walletZec != null
                  ? `${formatZec(walletZec, { symbol: false })} ZEC + CACAO in the wallet`
                  : "wallet value from the sheet"
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
          <div className="ws-custody">
            <span className="ws-copilot-label">Custody</span>
            <p>
              A 2-of-3 multisig on Vultisig. Keys held by{" "}
              {MAYA_SIGNERS.map((s, i) => (
                <span key={s.name}>
                  {i > 0 ? (i === MAYA_SIGNERS.length - 1 ? " and " : ", ") : ""}
                  <strong>{s.name}</strong> ({s.org})
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
            A liquidity position holds both sides of the pool, so as ZEC rose the
            pool sold ZEC for CACAO: the wallet now holds far fewer ZEC than were
            contributed. &ldquo;Versus holding&rdquo; compares the position with
            simply keeping the contributed ZEC. Fee revenue is not yet reported
            in the sheet.
          </SourceNote>
        </section>
      ) : null}

      <SectionHeading
        title="Native ZEC liquidity"
        description="Pool depth, value locked and yield across the venues that hold native ZEC, from their public APIs."
      />
      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat
          label="Pools live"
          value={String(pools.length)}
          sub="venues reporting"
        />
        <Stat
          label="ZEC in pools"
          value={zec(totalZec)}
          sub="native ZEC liquidity"
        />
        <Stat
          label="Total value locked"
          value={usd0(totalTvl)}
          sub="both sides · live"
        />
      </section>

      {pools.length === 0 ? (
        <Card>
          <p className="text-sm text-stone-600">
            No pool data right now. The venues&rsquo; APIs may be briefly
            unreachable. This refreshes automatically.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {pools.map((p) => (
            <a
              key={p.venue}
              href={p.url}
              target="_blank"
              rel="noreferrer"
              className="block"
            >
              <Card interactive>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-stone-600">
                      {p.venue}
                    </p>
                    <p className="mt-1 text-sm font-medium text-stone-900">
                      {p.asset} pool
                    </p>
                  </div>
                  <Badge tone="emerald">
                    {p.apyPct != null
                      ? `${p.apyPct.toFixed(2)}% APY`
                      : p.volume24hUsd != null
                        ? `${usd0(p.volume24hUsd)} · 24h`
                        : p.asset}
                  </Badge>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] text-stone-600">ZEC depth</p>
                    <p className="truncate text-sm font-semibold text-stone-900 tnum">
                      {zec(p.zecDepth)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-stone-600">TVL</p>
                    <p className="truncate text-sm font-semibold text-stone-900 tnum">
                      {usd0(p.tvlUsd)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-stone-600">ZEC price</p>
                    <p className="truncate text-sm font-semibold text-stone-900 tnum">
                      {usd0(p.priceUsd)}
                    </p>
                  </div>
                </div>
              </Card>
            </a>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-stone-600">
        Data: Maya &amp; THORChain (Midgard v2) and NEAR / Rhea Finance
        (GeckoTerminal). NEAR Intents holds further large cross-chain ZEC
        liquidity across many bridged pairs, not summed here to avoid
        double-counting their shared vault.
      </p>
    </>
  );
}
