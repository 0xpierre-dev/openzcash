import "server-only";
import {
  parseMayaHealth,
  parseMayaPool,
  parseSwapSummary,
  parseVolumeHistory,
} from "./maya-activity-model";

export const MAYA_MIDGARD = "https://midgard.mayachain.info";
export const MAYA_POOL_URL = "https://www.mayascan.org/pool/ZEC.ZEC";
export const MAYA_VOLUME_URL = `${MAYA_MIDGARD}/v2/history/swaps?pool=ZEC.ZEC`;
const TTL_MS = 5 * 60_000;

export type MayaFeed<T> = { data: T; fetchedAt: string; stale: boolean };

function feed<T>(path: () => string, parse: (raw: unknown) => T | null) {
  let cached: MayaFeed<T> | null = null;
  let attemptedAt = -Infinity;
  let pending: Promise<MayaFeed<T> | null> | null = null;
  return async (): Promise<MayaFeed<T> | null> => {
    if (pending) return pending;
    if (Date.now() - attemptedAt < TTL_MS) return cached;
    attemptedAt = Date.now();
    pending = (async () => {
      try {
        const res = await fetch(`${MAYA_MIDGARD}/v2/${path()}`, {
          headers: { accept: "application/json", "x-client-id": "openzcash" },
          signal: AbortSignal.timeout(6_000),
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Maya feed unavailable");
        const data = parse(await res.json());
        if (data === null) throw new Error("Invalid Maya feed");
        cached = { data, fetchedAt: new Date().toISOString(), stale: false };
      } catch {
        // Retain the original date. A failed refresh is never a fresh zero.
        if (cached) cached = { ...cached, stale: true };
      }
      return cached;
    })();
    try {
      return await pending;
    } finally {
      pending = null;
    }
  };
}

const lifetime = feed(() => "history/swaps?pool=ZEC.ZEC", parseSwapSummary);
// Start at MAYAChain's launch month. This includes the entire ZEC history,
// rather than letting a rolling window silently drop early volume.
const history = feed(
  () => "history/swaps?pool=ZEC.ZEC&interval=month&from=1677628800&count=400",
  parseVolumeHistory,
);
const recent = feed(() => {
  const to = Math.floor(Date.now() / 1000);
  return `history/swaps?pool=ZEC.ZEC&from=${to - 30 * 86400}&to=${to}`;
}, parseSwapSummary);
const pool = feed(() => "pool/ZEC.ZEC", parseMayaPool);
const health = feed(() => "health", parseMayaHealth);

export async function getMayaActivity() {
  const [allTime, monthly, last30d, liquidity, sync] = await Promise.all([
    lifetime(),
    history(),
    recent(),
    pool(),
    health(),
  ]);
  return { allTime, monthly, last30d, liquidity, sync };
}
export type MayaActivity = Awaited<ReturnType<typeof getMayaActivity>>;
