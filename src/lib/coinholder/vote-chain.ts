import "server-only";

/**
 * The finalized summary of a vote-chain round, fetched live: Valar Group's
 * primary server first, the Zcash Foundation's mirror as soon as Valar fails
 * or has not answered within 1.5 seconds, the first good answer winning. The
 * whole check takes at most five seconds, so a hung server never holds the
 * page for long. The SHA-256 of the raw body lets a reader check that the
 * bytes they download are the ones this site compared. Cached in-process for
 * an hour (the summary of a finalized round does not change); never throws.
 */
import { createHash } from "node:crypto";
import { parseVoteSummary, type VoteSummary } from "./verify";
import {
  VOTE_CHAIN_HOSTS,
  voteSummaryUrl,
  type VoteChainHost,
} from "./verify-sources";

const TTL_MS = 60 * 60_000;
/** After both servers fail, the next attempt waits this long. */
const RETRY_MS = 5 * 60_000;
/** The most the whole check waits, every server included. */
const TIMEOUT_MS = 5_000;
/** How long a server has before the next one is asked as well. */
const HEDGE_MS = 1_500;
/** The Q3 2026 summary is 27 KB; anything far larger is not a summary. */
const MAX_BYTES = 2_000_000;
const ROUND_ID = /^[0-9a-f]{64}$/;

export type LiveSummary = {
  ok: true;
  summary: VoteSummary;
  sha256: string;
  bytes: number;
  host: VoteChainHost;
  url: string;
  fetchedAt: string;
};

export type ChainUnavailable = {
  ok: false;
  /** The URLs asked, in order. */
  tried: string[];
  error: string;
  checkedAt: string;
};

export type ChainResult = LiveSummary | ChainUnavailable;

type Entry = { result: ChainResult; expires: number };
const cache = new Map<string, Entry>();
/** The last good copy per round, served when a refresh fails. */
const lastGood = new Map<string, LiveSummary>();
const pending = new Map<string, Promise<ChainResult>>();

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The body must describe the round that was asked for: its base64 round id decodes to the same 32 bytes. */
function sameRound(summary: VoteSummary, chainRoundId: string): boolean {
  if (summary.voteRoundId === null) return false;
  return (
    Buffer.from(summary.voteRoundId, "base64").toString("hex") === chainRoundId
  );
}

async function fromHost(
  host: VoteChainHost,
  chainRoundId: string,
  signal: AbortSignal,
): Promise<LiveSummary> {
  const url = voteSummaryUrl(host.origin, chainRoundId);
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "OpenZcash-verify" },
    signal,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  if (body.byteLength > MAX_BYTES) throw new Error("response too large");
  const summary = parseVoteSummary(JSON.parse(body.toString("utf8")));
  if (!sameRound(summary, chainRoundId))
    throw new Error("answered for another round");
  return {
    ok: true,
    summary,
    sha256: createHash("sha256").update(body).digest("hex"),
    bytes: body.byteLength,
    host,
    url,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Asks the servers in order, each one HEDGE_MS after the previous or as soon
 * as it fails, and takes the first good answer; the rest are cancelled. One
 * deadline covers them all.
 */
async function load(chainRoundId: string): Promise<ChainResult> {
  const stop = new AbortController();
  const deadline = setTimeout(
    () => stop.abort(new Error(`no answer within ${TIMEOUT_MS / 1000} s`)),
    TIMEOUT_MS,
  );
  const errors: string[] = [];
  // turns[i] opens when server i may be asked (Node 20 has no Promise.withResolvers).
  const opens: (() => void)[] = [];
  const turns = VOTE_CHAIN_HOSTS.map(
    (_, i) =>
      new Promise<void>((resolve) => {
        opens[i] = resolve;
      }),
  );
  const timers = opens
    .slice(1)
    .map((open, i) => setTimeout(open, HEDGE_MS * (i + 1)));
  const attempt = async (host: VoteChainHost, i: number) => {
    // The first server is asked at once, in the caller's tick.
    if (i > 0) await turns[i];
    try {
      if (stop.signal.aborted) throw stop.signal.reason;
      return await fromHost(host, chainRoundId, stop.signal);
    } catch (e) {
      errors[i] =
        `${host.name}: ${message(stop.signal.aborted ? stop.signal.reason : e)}`;
      opens[i + 1]?.();
      throw e;
    }
  };
  try {
    return await Promise.any(VOTE_CHAIN_HOSTS.map(attempt));
  } catch {
    return {
      ok: false,
      tried: VOTE_CHAIN_HOSTS.map((h) =>
        voteSummaryUrl(h.origin, chainRoundId),
      ),
      error: errors.filter(Boolean).join("; "),
      checkedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(deadline);
    timers.forEach(clearTimeout);
    // Cancels whichever request is still open once one has answered.
    stop.abort(new Error("answered by another server"));
  }
}

/** The finalized summary of a vote-chain round (64 hex characters), or why it is unavailable. */
export async function fetchVoteSummary(
  chainRoundId: string,
): Promise<ChainResult> {
  if (!ROUND_ID.test(chainRoundId))
    return {
      ok: false,
      tried: [],
      error: "not a vote-chain round id",
      checkedAt: new Date().toISOString(),
    };
  const hit = cache.get(chainRoundId);
  if (hit && Date.now() < hit.expires) return hit.result;
  const inflight = pending.get(chainRoundId);
  if (inflight) return inflight;
  const request = load(chainRoundId)
    .then((fresh) => {
      if (fresh.ok) lastGood.set(chainRoundId, fresh);
      // A failed refresh serves the last good copy (dated when it was fetched) and is retried sooner.
      const result = fresh.ok ? fresh : (lastGood.get(chainRoundId) ?? fresh);
      cache.set(chainRoundId, {
        result,
        expires: Date.now() + (fresh.ok ? TTL_MS : RETRY_MS),
      });
      return result;
    })
    .finally(() => pending.delete(chainRoundId));
  pending.set(chainRoundId, request);
  return request;
}
