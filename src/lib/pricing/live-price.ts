import "server-only";

/**
 * Live ZEC→USD price oracle.
 *
 * Single source of truth for the *current* market price, used to value the
 * treasury (Lockbox/Coinholder pool, viewing-key balances) in USD. Fetched from
 * CoinGecko (free, no API key), then CoinPaprika and Coinbase when a provider
 * refuses or fails (CoinGecko answers 403 to the production host), and cached
 * in-process for ~10 min so page loads don't hammer the endpoints. Callers
 * should fall back to the spreadsheet's recorded price when this returns null
 * (cold cache + every feed unavailable).
 */

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd&include_last_updated_at=true";
const TTL_MS = 10 * 60_000; // 10 minutes
const RETRY_MS = 30_000;
const SOURCE_TIMEOUT_MS = 4_000;
const ZATS_PER_ZEC = 100_000_000n;

type Reading = { usd: unknown; quotedAtMs: number | null };
const ms = (value: unknown, scale = 1): number | null => {
  const n = typeof value === "number" ? value * scale : typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};
/** A nested field of an untrusted JSON body, or undefined. */
const field = (value: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined), value);
/** In order of preference: two market-wide aggregates, then one exchange's last trade. Each reports its own quote time. */
export const PRICE_SOURCES = [
  { name: "CoinGecko", url: COINGECKO_URL, read: (j: unknown): Reading => ({ usd: field(j, "zcash", "usd"), quotedAtMs: ms(field(j, "zcash", "last_updated_at"), 1000) }) },
  { name: "CoinPaprika", url: "https://api.coinpaprika.com/v1/tickers/zec-zcash?quotes=USD", read: (j: unknown): Reading => ({ usd: field(j, "quotes", "USD", "price"), quotedAtMs: ms(field(j, "last_updated")) }) },
  { name: "Coinbase", url: "https://api.exchange.coinbase.com/products/ZEC-USD/ticker", read: (j: unknown): Reading => {
    const price = field(j, "price");
    return { usd: typeof price === "string" && price.trim() ? Number(price) : price, quotedAtMs: ms(field(j, "time")) };
  } },
] as const;
export type PriceSource = typeof PRICE_SOURCES[number]["name"];

export type ZecUsdQuote = {
  cents: number;
  source: PriceSource;
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
  for (const source of PRICE_SOURCES) {
    try {
      const res = await fetch(source.url, {
        headers: { accept: "application/json", "user-agent": "OpenZcash-price-oracle" },
        signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const { usd, quotedAtMs } = source.read(await res.json());
      const cents = typeof usd === "number" ? Math.round(usd * 100) : NaN;
      if (!Number.isSafeInteger(cents) || cents <= 0) continue;
      const at = Date.now();
      // A provider time more than a minute in the future is not trusted as a quote time.
      const quotedAt = quotedAtMs !== null && quotedAtMs <= at + 60_000 ? new Date(quotedAtMs).toISOString() : null;
      cache = { at, quote: { cents, source: source.name, sourceUrl: source.url, quotedAt, fetchedAt: new Date(at).toISOString() } };
      retryAfter = 0;
      return cachedQuote(at);
    } catch {
      // network/timeout/parse: try the next provider
    }
  }
  // A full outage must not trigger another round of requests for every page visitor.
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
