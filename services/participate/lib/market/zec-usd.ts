import { z } from "zod";
import { assertFreshFundingQuote, parseUsdPerZecE8 } from "@/lib/domain/funding-quote";

const PRICE_URL = "https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd&include_last_updated_at=true&precision=8";
const responseSchema = z.object({ zcash: z.object({
  usd: z.number().finite().positive(), last_updated_at: z.number().int().positive()
}).strict() }).strict();

export class ZecPriceError extends Error {
  constructor() { super("A current ZEC price is unavailable. Try again shortly."); this.name = "ZecPriceError"; }
}

export type ZecUsdPrice = { rateUsdPerZecE8: bigint; quotedAt: Date; retrievedAt: Date };

export function parseZecUsdPrice(raw: string, now: Date): ZecUsdPrice {
  try {
    if (raw.length > 2048) throw new Error("Oversized response");
    const parsed = responseSchema.parse(JSON.parse(raw));
    // Retain the provider's decimal token exactly; JSON numbers are not used for money math.
    // The strict schema leaves no other string values in which this token could be hidden.
    const prices = [...raw.matchAll(/"usd"\s*:\s*((?:0|[1-9]\d*)(?:\.\d+)?)(?=\s*[,}])/g)];
    const times = [...raw.matchAll(/"last_updated_at"\s*:\s*(\d+)(?=\s*[,}])/g)];
    if (prices.length !== 1 || times.length !== 1 || Number(prices[0][1]) !== parsed.zcash.usd) throw new Error("Ambiguous price");
    const rateUsdPerZecE8 = parseUsdPerZecE8(prices[0][1]);
    const quotedAt = new Date(parsed.zcash.last_updated_at * 1000);
    assertFreshFundingQuote(quotedAt, now);
    return { rateUsdPerZecE8, quotedAt, retrievedAt: now };
  } catch { throw new ZecPriceError(); }
}

async function fetchPrice(): Promise<ZecUsdPrice> {
  try {
    const apiKey = process.env.COINGECKO_DEMO_API_KEY?.trim();
    const response = await fetch(PRICE_URL, {
      headers: { accept: "application/json", ...(apiKey ? { "x-cg-demo-api-key": apiKey } : {}) },
      signal: AbortSignal.timeout(8000), cache: "no-store", redirect: "error"
    });
    if (!response.ok || !response.body) throw new ZecPriceError();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let raw = "";
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2048) throw new ZecPriceError();
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    } finally { await reader.cancel().catch(() => undefined); }
    return parseZecUsdPrice(raw, new Date());
  } catch { throw new ZecPriceError(); }
}

let cached: ZecUsdPrice | null = null;
let pending: Promise<ZecUsdPrice> | null = null;

/** Share only public price data, for at most 60 seconds; never extend source validity. */
export async function getZecUsdPrice(): Promise<ZecUsdPrice> {
  if (cached && Date.now() - +cached.retrievedAt < 60_000) {
    try { assertFreshFundingQuote(cached.quotedAt, new Date()); return cached; } catch { cached = null; }
  }
  pending ??= fetchPrice().then((price) => { cached = price; return price; }).finally(() => { pending = null; });
  return pending;
}

const PUBLIC_RETRY_DELAY_MS = 15_000;
const PUBLIC_WARNING_INTERVAL_MS = 60_000;
let publicRetryAt = 0;
let publicWarningAt: number | null = null;

function freshPublicFallback(): ZecUsdPrice | null {
  if (!cached) return null;
  try {
    assertFreshFundingQuote(cached.quotedAt, new Date());
    return cached;
  } catch { return null; }
}

/** Display-only resilience: preserve a still-valid source quote during an outage.
 * Funding/payment quote callers retain the strict refresh behavior above.
 */
export async function getPublicZecUsdPrice(): Promise<ZecUsdPrice> {
  if (Date.now() < publicRetryAt) {
    const fallback = freshPublicFallback();
    if (fallback) return fallback;
    throw new ZecPriceError();
  }
  try {
    const price = await getZecUsdPrice();
    publicRetryAt = 0;
    return price;
  } catch {
    const now = Date.now();
    publicRetryAt = now + PUBLIC_RETRY_DELAY_MS;
    if (publicWarningAt === null || now - publicWarningAt >= PUBLIC_WARNING_INTERVAL_MS) {
      publicWarningAt = now;
      // Never log provider bodies, errors or credentials.
      console.warn("[participate-zec-price] provider_unavailable", { source: "COINGECKO", retryAfterSeconds: 15 });
    }
    const fallback = freshPublicFallback();
    if (fallback) return fallback;
    throw new ZecPriceError();
  }
}
