import "server-only";
import { cachedPublic } from "./public-cache";
import { boundedRead } from "./timeout";

export const ANALYTICS_ENDPOINTS = {
  shieldedSupply: "https://api.shieldedscan.xyz/v1/supply",
  shieldedChain: "https://api.shieldedscan.xyz/v1/chain",
  shieldedMonthly: "https://api.shieldedscan.xyz/v1/analytics/monthly",
  zecblockSupply: "https://api.zecblock.com/v1/network/blockchain-info",
} as const;
type Endpoint = keyof typeof ANALYTICS_ENDPOINTS;
const cooldown = new Map<string, number>();
const MAX_BYTES = 128 * 1024;
export type AnalyticsResponse = { value: unknown; url: string; retrievedAt: string };

/** Fixed, public GETs only. Neither prompts nor visitor headers reach the explorers. */
export async function readAnalytics(endpoint: Endpoint, signal: AbortSignal, range?: { from: number; to: number }): Promise<AnalyticsResponse> {
  signal.throwIfAborted();
  const url = new URL(ANALYTICS_ENDPOINTS[endpoint]);
  if (range) {
    if (endpoint !== "shieldedMonthly" || !Number.isSafeInteger(range.from) || !Number.isSafeInteger(range.to) || range.from < 0 || range.to < range.from || range.to - range.from > 32 * 86400) throw new Error("ANALYTICS_RANGE");
    url.searchParams.set("from", String(range.from));
    url.searchParams.set("to", String(range.to));
  }
  // Shared work has its own deadline. Cancelling one subscriber does not cancel other readers.
  return boundedRead(() => cachedPublic("chain-analytics:" + url.href, 60_000, async () => {
    if ((cooldown.get(url.hostname) ?? 0) > Date.now()) throw new Error("ANALYTICS_RATE_LIMIT");
    const response = await fetch(url.href, {
      method: "GET", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5_000),
      headers: { Accept: "application/json", "User-Agent": "OpenZcash/1.0 (+https://openzcash.org)" },
    });
    if (response.status === 429) {
      const header = response.headers.get("retry-after");
      const seconds = header && /^\d+$/.test(header) ? Number(header) : NaN;
      const until = Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(header ?? "");
      cooldown.set(url.hostname, Math.max(Date.now() + 1000, Number.isFinite(until) ? until : Date.now() + 60_000));
      await response.body?.cancel();
      throw new Error("ANALYTICS_RATE_LIMIT");
    }
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json") || !response.body) {
      await response.body?.cancel();
      throw new Error("ANALYTICS_UNAVAILABLE");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BYTES) throw new Error("ANALYTICS_TOO_LARGE");
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    return { value: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown, url: url.href, retrievedAt: new Date().toISOString() };
  }), signal, 6_000);
}
