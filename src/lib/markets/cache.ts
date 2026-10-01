export type Feed<T> = {
  data: T | null;
  fetchedAt: string | null;
  checkedAt: string;
  stale: boolean;
  error: string | null;
  refreshing?: boolean;
  refreshAfter?: string;
};

type ReadOptions = { waitForRefresh?: boolean };
type Reader<T> = (options?: ReadOptions) => Promise<Feed<T>>;
type CacheOptions = {
  /** Versioned identity shared by Next's separate page, API and startup bundles. */
  key?: string;
  staleWhileRevalidate?: boolean;
};

const processCache = globalThis as typeof globalThis & {
  __openZcashMarketFeedsV1?: Map<string, Reader<unknown>>;
};
const shared = (processCache.__openZcashMarketFeedsV1 ??= new Map());

const FIRST_RETRY_MS = 60_000;
const MAX_RETRY_MS = 3_600_000;
type Outcome = "ok" | "partial" | "failed";

/**
 * When to collect again. A live source keeps its TTL. Consecutive failures
 * (the streak, counting this one) double from one minute to one hour, so a
 * permanently blocked source is not requested every minute; partial coverage
 * backs off the same way but never waits past the normal TTL.
 */
export function nextRefreshDelay(ttl: number, outcome: Outcome, streak: number) {
  if (outcome === "ok") return ttl;
  const backoff = Math.min(
    MAX_RETRY_MS,
    FIRST_RETRY_MS * 2 ** Math.min(Math.max(0, streak - 1), 16),
  );
  return outcome === "partial" ? Math.min(ttl, backoff) : backoff;
}

/** Bounded retries, shared in-flight work, and truthful dates on saved data. */
export function cachedFeed<T>(
  loader: () => Promise<T>,
  ttl = 5 * 60_000,
  retryPartial?: (data: T) => boolean,
  options: CacheOptions = {},
): Reader<T> {
  // Share the reader, including its collector and source caches. Sharing only
  // the final value would still alternate collectors when another bundle wins.
  const existing = options.key ? shared.get(options.key) : undefined;
  if (existing) return existing as Reader<T>;

  let cache: Feed<T> | null = null;
  let retryAt = 0;
  // Consecutive partial or failed collections; any complete success resets it.
  let streak = 0;
  let pending: Promise<Feed<T>> | null = null;
  const present = (value: Feed<T>): Feed<T> =>
    options.staleWhileRevalidate
      ? {
          ...value,
          stale:
            value.stale ||
            (value.fetchedAt !== null &&
              Date.now() - Date.parse(value.fetchedAt) >= ttl),
          refreshing: pending !== null,
          refreshAfter: new Date(retryAt).toISOString(),
        }
      : value;

  const read: Reader<T> = async ({ waitForRefresh = false } = {}) => {
    if (!pending && cache && Date.now() < retryAt) return present(cache);
    if (!pending) {
      pending = (async () => {
        const checkedAt = new Date().toISOString();
        try {
          const data = await loader();
          cache = {
            data,
            checkedAt,
            fetchedAt: new Date().toISOString(),
            stale: false,
            error: null,
          };
          const outcome = retryPartial?.(data) ? "partial" : "ok";
          streak = outcome === "ok" ? 0 : streak + 1;
          retryAt = Date.now() + nextRefreshDelay(ttl, outcome, streak);
        } catch {
          cache = {
            data: cache?.data ?? null,
            fetchedAt: cache?.fetchedAt ?? null,
            checkedAt,
            stale: true,
            error: "Source could not be refreshed",
          };
          streak += 1;
          retryAt = Date.now() + nextRefreshDelay(ttl, "failed", streak);
        }
        return cache;
      })().finally(() => {
        pending = null;
      });
    }
    // Page navigation stays fast after the first collection. Explicit API
    // refreshes join the same work and wait for its atomic publication.
    if (options.staleWhileRevalidate && cache?.data != null && !waitForRefresh)
      return present(cache);
    return present(await pending);
  };
  if (options.key) shared.set(options.key, read as Reader<unknown>);
  return read;
}
