import "server-only";

/**
 * Live ZEC→USD price oracle.
 *
 * Single source of truth for the *current* market price, used to value the
 * treasury (Lockbox/Coinholder pool, viewing-key balances) in USD. Fetched from
 * CoinGecko (free, no API key) and cached in-process for ~10 min so page loads
 * don't hammer the endpoint. Callers should fall back to the spreadsheet's
 * recorded price when this returns null (cold cache + feed unavailable).
 */

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd&include_last_updated_at=true";
const TTL_MS = 10 * 60_000; // 10 minutes
const RETRY_MS = 30_000;
const ZATS_PER_ZEC = 100_000_000n;

export type ZecUsdQuote = {
  cents: number;
  source: "CoinGecko";
  sourceUrl: string;
  quotedAt: string | null;
  fetchedAt: string;
  stale: boolean;
};

let cache: { quote: Omit<ZecUsdQuote, "stale">; at: number } | null = null;
let pending: Promise<ZecUsdQuote | null> | null = null;
let retryAfter = 0;

function cachedQuote(now: number): ZecUsdQuote | null {
  if (!cache) return null;
  const quotedAt = cache.quote.quotedAt ? Date.parse(cache.quote.quotedAt) : cache.at;
  return { ...cache.quote, stale: now - Math.min(cache.at, quotedAt) >= TTL_MS };
}

/**
 * Current ZEC price in integer USD cents, or null if the feed is unavailable
 * and nothing has ever been cached. Cached ~10 min in-process.
 */
export async function currentZecUsdCents(): Promise<number | null> {
  return (await currentZecUsdQuote())?.cents ?? null;
}

/** Quote metadata stays attached to cached prices so an old quote is never dated as new. */
export async function currentZecUsdQuote(): Promise<ZecUsdQuote | null> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cachedQuote(now);
  if (pending) return pending;
  if (now < retryAfter) return cachedQuote(now);

  // Multiple page/API renders share one refresh, including after the TTL.
  pending = fetchQuote().finally(() => { pending = null; });
  return pending;
}

async function fetchQuote(): Promise<ZecUsdQuote | null> {
  try {
    const res = await fetch(COINGECKO_URL, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    if (res.ok) {
      const json = (await res.json()) as { zcash?: { usd?: number; last_updated_at?: number } };
      const usd = json?.zcash?.usd;
      const cents = typeof usd === "number" ? Math.round(usd * 100) : NaN;
      if (Number.isSafeInteger(cents) && cents > 0) {
        const at = Date.now();
        const sourceTime = json.zcash?.last_updated_at;
        const quotedAt = typeof sourceTime === "number" && Number.isFinite(sourceTime)
          && sourceTime > 0 && sourceTime * 1000 <= at + 60_000
          ? new Date(sourceTime * 1000).toISOString() : null;
        cache = {
          at,
          quote: {
            cents,
            source: "CoinGecko",
            sourceUrl: COINGECKO_URL,
            quotedAt,
            fetchedAt: new Date(at).toISOString(),
          },
        };
        retryAfter = 0;
        return cachedQuote(at);
      }
    }
  } catch {
    // network/timeout/parse — fall through to the last cached value (or null)
  }
  // A feed outage must not trigger another request for every page visitor.
  retryAfter = Date.now() + RETRY_MS;
  return cachedQuote(Date.now());
}

/** USD value (integer cents) of a zatoshi amount at a given price in cents/ZEC. */
export function zatToUsdCents(
  zat: bigint,
  priceCents: number | bigint,
): bigint {
  const cents =
    typeof priceCents === "bigint"
      ? priceCents
      : BigInt(Math.round(priceCents));
  // (zat * cents) / 1e8, rounded to nearest cent.
  return (zat * cents + ZATS_PER_ZEC / 2n) / ZATS_PER_ZEC;
}
