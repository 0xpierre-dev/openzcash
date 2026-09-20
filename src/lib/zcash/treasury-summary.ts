import "server-only";
import { latestSnapshot } from "@/lib/zcg/snapshots-repo";
import { currentLockboxZec } from "@/lib/zcash/lockbox-live";
import { currentZecUsdCents, zatToUsdCents } from "@/lib/pricing/live-price";
import { formatUsdCents } from "@/lib/zcg/format";
import { formatZec } from "@/lib/zcash/units";
import { cached } from "@/lib/cache/memo";

/**
 * The two pools the ZCG spreadsheet tracks, valued at the live price: the
 * operating (Coinbase) balance and the ZIP-1016 Lockbox / Coinholder pool.
 * One cached projection feeds the home page cards and the shell's treasury
 * bar, so both always show the same figures.
 */
export type TreasuryPool = {
  name: string;
  tag: string;
  href: string;
  /** Formatted ZEC balance, no symbol. */
  zec: string;
  /** Formatted USD valuation (compact). */
  usd: string;
  /** Extra line, e.g. USD cash held alongside the ZEC. */
  sub?: string;
  /** The same figures unabridged, for the bar's tooltip. */
  exact: string;
};

export type TreasurySummary = {
  operating: TreasuryPool | null;
  lockbox: TreasuryPool | null;
  /** Chain height the figures refer to, formatted with separators. */
  height: string | null;
  /** ZEC/USD price used for the valuation, formatted. */
  price: string | null;
};

const TTL_MS = 60_000;

async function compute(): Promise<TreasurySummary> {
  const [op, lock, liveCents] = await Promise.all([
    latestSnapshot("zcg_operating").catch(() => null),
    currentLockboxZec().catch(() => null),
    currentZecUsdCents().catch(() => null),
  ]);

  const height =
    lock?.height ?? (op?.blockHeight != null ? Number(op.blockHeight) : null);
  // Live market price preferred; fall back to the spreadsheet's recorded price.
  const priceCents =
    liveCents ?? op?.zecusdPriceCents ?? lock?.snap?.zecusdPriceCents ?? null;

  // Value each pool at the current price (ZEC × live price, + any USD cash).
  const opUsdCents =
    priceCents != null && op?.zecBalanceZat != null
      ? zatToUsdCents(op.zecBalanceZat, priceCents) +
        (op.usdCashBalanceCents ?? 0n)
      : (op?.usdTotalHoldingsCents ?? 0n);
  const lockUsdCents =
    priceCents != null && lock
      ? zatToUsdCents(lock.zat, priceCents)
      : (lock?.snap?.usdTotalHoldingsCents ?? 0n);

  return {
    operating: op
      ? {
          name: "ZCG operating",
          tag: "Coinbase address",
          href: "/zcg/reconciliation",
          zec: formatZec(op.zecBalanceZat ?? 0n, { symbol: false }),
          usd: formatUsdCents(opUsdCents, { compact: true }),
          sub:
            op.usdCashBalanceCents != null
              ? `${formatUsdCents(op.usdCashBalanceCents, { compact: true })} cash`
              : undefined,
          exact: `${formatZec(op.zecBalanceZat ?? 0n, { symbol: false })} ZEC ≈ ${formatUsdCents(opUsdCents)}${
            op.usdCashBalanceCents != null
              ? ` · ${formatUsdCents(op.usdCashBalanceCents)} cash`
              : ""
          }`,
        }
      : null,
    lockbox: lock
      ? {
          name: "Lockbox · Coinholder",
          tag: "ZIP-1016 pool · live",
          href: "/lockbox",
          zec: formatZec(lock.zat, { symbol: false }),
          usd: formatUsdCents(lockUsdCents, { compact: true }),
          exact: `${formatZec(lock.zat, { symbol: false })} ZEC ≈ ${formatUsdCents(lockUsdCents)}`,
        }
      : null,
    height: height != null ? Number(height).toLocaleString("en-US") : null,
    price: priceCents != null ? formatUsdCents(priceCents) : null,
  };
}

/** Never throws: a failed source hides the figure, not the page. */
export function getTreasurySummary(): Promise<TreasurySummary | null> {
  return cached("treasury:summary", TTL_MS, compute).catch(() => null);
}
