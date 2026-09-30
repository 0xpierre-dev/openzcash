import "server-only";
import { cached, LEDGER_TTL_MS } from "@/lib/cache/memo";
import { recipientTotals } from "@/lib/zcg/disbursements-repo";
import { treasuryPayouts } from "@/lib/zechub/treasury-repo";
import { COMMUNITIES } from "./data";
import { applyDaoFunding, type DaoPayoutRow } from "./dao-funding";
import {
  applyLedgerFunding,
  type CommunitiesFunding,
  type LedgerRecipientTotal,
} from "./ledger-funding";

/** Longest the directory waits on each read; the forum fetches use 5 s. */
export const LEDGER_TIMEOUT_MS = 4_000;
/** After a failed or slow read, serve the fallback this long before retrying. */
export const FALLBACK_RETRY_MS = 60_000;

/** Per-source retry gate: the ledger and the DAO sheet fail independently. */
const fallbackUntil = { ledger: 0, dao: 0 };

/** Test hook: forget a recent failure. */
export function resetCommunitiesFunding(): void {
  fallbackUntil.ledger = 0;
  fallbackUntil.dao = 0;
}

function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  what: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${what} read timed out after ${ms} ms`)),
      ms,
    );
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * One memoised, time-boxed read; null (logged) when the source is down or
 * slow, and for FALLBACK_RETRY_MS afterwards so later requests skip the
 * database instead of each waiting on a failed connection. A slow read that
 * finishes after the timeout still fills the memo for the next request.
 */
async function guardedRead<T>(
  gate: keyof typeof fallbackUntil,
  key: string,
  read: () => Promise<T>,
  failure: string,
): Promise<T | null> {
  if (Date.now() < fallbackUntil[gate]) return null;
  try {
    return await withTimeout(
      cached(key, LEDGER_TTL_MS, read),
      LEDGER_TIMEOUT_MS,
      gate,
    );
  } catch (err) {
    fallbackUntil[gate] = Date.now() + FALLBACK_RETRY_MS;
    console.error(failure, err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * The community directory with ZCG funding read from the ledger mirror and
 * ZecHub DAO payouts read from the treasury sheet mirror.
 *
 * Shares the `recipientTotals` memo with /zcg/recipients (same key, same
 * query), so the two pages show identical figures within one TTL window.
 * Either source may be unreachable without taking the page down: its dated
 * curated figures stand in (the view labels them with their date).
 */
export async function getCommunitiesFunding(): Promise<CommunitiesFunding> {
  const [totals, payouts] = await Promise.all([
    guardedRead<LedgerRecipientTotal[]>(
      "ledger",
      "recipientTotals",
      () => recipientTotals(),
      "[communities] ZCG ledger unavailable; showing fallback funding figures:",
    ),
    guardedRead<DaoPayoutRow[]>(
      "dao",
      "zechubPayouts",
      () => treasuryPayouts(),
      "[communities] ZecHub treasury sheet unavailable; showing dated DAO payout figures:",
    ),
  ]);
  const ledger = totals
    ? applyLedgerFunding(COMMUNITIES, totals)
    : { communities: COMMUNITIES, source: "fallback" as const };
  const { communities, dao } = applyDaoFunding(ledger.communities, payouts);
  return { communities, source: ledger.source, dao };
}
