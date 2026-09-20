import "server-only";
import { currentZecUsdCents } from "@/lib/pricing/live-price";

/**
 * ZCG's liquidity position on Maya Protocol, read live from Midgard: the
 * member record of the multisig (units, what was added, what was withdrawn)
 * and the pool depths that turn units into today's ZEC and CACAO. Two
 * valuations are offered because the pool's own USD quote depegs: the ZEC
 * leg at the site's oracle price, the CACAO leg at CoinGecko's price.
 */

/** The 2-of-3 Vultisig multisig that holds ZCG's position (ZCG announcement,
 *  forum topic 51608; matched on Midgard by the 1,300 ZEC added on 2025-07-01). */
export const ZCG_MAYA_MEMBER = "maya14n4r0uwpp96435llrum2mevsevk5ph0lq0rjem";
export const ZCG_MAYA_ZEC_ADDRESS = "t1PMkzDM94MbmFZBzfeuKHq8JA2PN6U8Wrm";

const MIDGARD = "https://midgard.mayachain.info";
const TTL_MS = 5 * 60_000;

export type MayaPosition = {
  /** Share of the pool held by the member, 0..1. */
  share: number;
  /** Today's composition, from the share of the pool depths. */
  zecNow: number;
  cacaoNow: number;
  /** What went in and what came out, from the member record. */
  zecAdded: number;
  cacaoAdded: number;
  zecWithdrawn: number;
  cacaoWithdrawn: number;
  firstAdded: string | null;
  lastAdded: string | null;
  /** Pool-implied CACAO per ZEC. */
  cacaoPerZec: number;
  /** Prices used for the valuation. */
  zecUsd: number | null;
  cacaoUsd: number | null;
  cacaoPriceSource: "coingecko" | "pool" | null;
  /** Valuation in USD cents, null when a price is missing. */
  zecLegCents: number | null;
  cacaoLegCents: number | null;
  totalCents: number | null;
  /** Midgard's own USD figure for the position, for reference. */
  midgardCents: number | null;
};

let cache: { at: number; value: MayaPosition | null } | null = null;

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", "x-client-id": "openzcash" },
      signal: AbortSignal.timeout(6_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function cacaoPriceUsd(): Promise<number | null> {
  const j = await getJson<{ cacao?: { usd?: number } }>(
    "https://api.coingecko.com/api/v3/simple/price?ids=cacao&vs_currencies=usd",
  );
  const p = j?.cacao?.usd;
  return typeof p === "number" && p > 0 ? p : null;
}

const day = (unix: string | undefined) =>
  unix ? new Date(Number(unix) * 1000).toISOString().slice(0, 10) : null;

async function compute(): Promise<MayaPosition | null> {
  type Pool = { assetDepth: string; runeDepth: string; liquidityUnits: string; assetPriceUSD: string };
  type Member = {
    pools: {
      pool: string;
      liquidityUnits: string;
      assetAdded: string;
      runeAdded: string;
      assetWithdrawn: string;
      runeWithdrawn: string;
      dateFirstAdded?: string;
      dateLastAdded?: string;
    }[];
  };
  const [pool, member, oracleCents, cacao] = await Promise.all([
    getJson<Pool>(`${MIDGARD}/v2/pool/ZEC.ZEC`),
    getJson<Member>(`${MIDGARD}/v2/member/${ZCG_MAYA_MEMBER}`),
    currentZecUsdCents().catch(() => null),
    cacaoPriceUsd(),
  ]);
  const p = member?.pools.find((x) => x.pool === "ZEC.ZEC");
  if (!pool || !p) return null;
  const poolUnits = Number(pool.liquidityUnits);
  const units = Number(p.liquidityUnits);
  if (!(poolUnits > 0) || !(units >= 0)) return null;
  const share = units / poolUnits;
  const assetDepth = Number(pool.assetDepth) / 1e8;
  const runeDepth = Number(pool.runeDepth) / 1e10;
  const zecNow = share * assetDepth;
  const cacaoNow = share * runeDepth;
  const cacaoPerZec = assetDepth > 0 ? runeDepth / assetDepth : 0;
  const zecUsd = oracleCents != null ? oracleCents / 100 : null;
  // CACAO: CoinGecko first; otherwise the pool-implied rate against the oracle.
  const cacaoUsd = cacao ?? (zecUsd != null && cacaoPerZec > 0 ? zecUsd / cacaoPerZec : null);
  const cacaoPriceSource = cacao ? "coingecko" : cacaoUsd != null ? "pool" : null;
  const zecLegCents = zecUsd != null ? Math.round(zecNow * zecUsd * 100) : null;
  const cacaoLegCents = cacaoUsd != null ? Math.round(cacaoNow * cacaoUsd * 100) : null;
  const midgardZec = Number(pool.assetPriceUSD);
  const midgardCents =
    midgardZec > 0 && cacaoPerZec > 0
      ? Math.round((zecNow * midgardZec + cacaoNow * (midgardZec / cacaoPerZec)) * 100)
      : null;
  return {
    share,
    zecNow,
    cacaoNow,
    zecAdded: Number(p.assetAdded) / 1e8,
    cacaoAdded: Number(p.runeAdded) / 1e10,
    zecWithdrawn: Number(p.assetWithdrawn) / 1e8,
    cacaoWithdrawn: Number(p.runeWithdrawn) / 1e10,
    firstAdded: day(p.dateFirstAdded),
    lastAdded: day(p.dateLastAdded),
    cacaoPerZec,
    zecUsd,
    cacaoUsd,
    cacaoPriceSource,
    zecLegCents,
    cacaoLegCents,
    totalCents: zecLegCents != null && cacaoLegCents != null ? zecLegCents + cacaoLegCents : null,
    midgardCents,
  };
}

/** Never throws: a Midgard hiccup hides the live block, not the page. */
export async function getMayaPosition(): Promise<MayaPosition | null> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.value;
  const value = await compute().catch(() => null);
  if (value) cache = { at: now, value };
  return value ?? cache?.value ?? null;
}
