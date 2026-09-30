import type { Outcome, Round, RoundProposal, Tally } from "./types";

/** ZIP 1016: at least this many ZEC must vote on a proposal for it to pass. */
export const QUORUM_ZEC = 420_000;
/** The eventual supply; ZIP 1016 states its minimum as 2% of it, so participation is shown on the same basis. */
export const SUPPLY_ZEC = 21_000_000;

export const OUTCOME_LABEL: Record<Outcome, string> = {
  passed: "Passed",
  funded: "Funded",
  rejected: "Rejected",
  rejected_lower: "Rejected · lower amount",
  abstain: "Abstain",
  vetoed: "Vetoed",
  discarded: "Discarded",
};

/** Order of the result groups on a round page. */
export const OUTCOME_ORDER: Outcome[] = [
  "passed",
  "funded",
  "vetoed",
  "rejected_lower",
  "rejected",
  "abstain",
  "discarded",
];

export const castZec = (t: Tally) =>
  t.approve + t.reject + (t.rejectLower ?? 0) + t.abstain;
/** Votes for or against, without abstentions. */
export const decidedZec = (t: Tally) =>
  t.approve + t.reject + (t.rejectLower ?? 0);
/** Approve share of the votes that took a side; null when nobody did. */
export function approvalShare(t: Tally): number | null {
  const decided = decidedZec(t);
  return decided > 0 ? t.approve / decided : null;
}

export type RoundSummary = {
  questions: number;
  counts: Partial<Record<Outcome, number>>;
  requestedUsdCents: number;
  fundedRequestedUsdCents: number;
  /** Largest and smallest ZEC cast on a single question, abstentions included. */
  maxCastZec: number | null;
  minCastZec: number | null;
  withTallies: number;
};

export function summarize(round: Round): RoundSummary {
  const counts: Partial<Record<Outcome, number>> = {};
  let requested = 0,
    funded = 0;
  const cast: number[] = [];
  for (const p of round.proposals) {
    counts[p.outcome] = (counts[p.outcome] ?? 0) + 1;
    requested += p.requestedUsdCents ?? 0;
    if (p.outcome === "funded") funded += p.requestedUsdCents ?? 0;
    if (p.tally && p.outcome !== "discarded") cast.push(castZec(p.tally));
  }
  return {
    questions: round.proposals.length,
    counts,
    requestedUsdCents: requested,
    fundedRequestedUsdCents: funded,
    maxCastZec: cast.length ? Math.max(...cast) : null,
    minCastZec: cast.length ? Math.min(...cast) : null,
    withTallies: cast.length,
  };
}

export function groupByOutcome(
  proposals: RoundProposal[],
): { outcome: Outcome; rows: RoundProposal[] }[] {
  return OUTCOME_ORDER.map((outcome) => ({
    outcome,
    rows: proposals.filter((p) => p.outcome === outcome),
  })).filter((g) => g.rows.length > 0);
}

export const formatZec = (zec: number, digits = 0) =>
  zec.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export const formatPct = (share: number, digits = 1) => `${(share * 100).toFixed(digits)}%`;

/** Participation: the most ZEC cast on one question, as a share of the eventual supply and a multiple of the minimum. */
export function participation(round: Round): { zec: number; supplyShare: number; ofMinimum: number } | null {
  const zec = summarize(round).maxCastZec;
  return zec === null ? null : { zec, supplyShare: zec / SUPPLY_ZEC, ofMinimum: zec / QUORUM_ZEC };
}

/** Where each round's closing price comes from. */
export const CLOSE_PRICE_SOURCE = {
  label: "Bitfinex ZEC/USD daily close (UTC)",
  href: "https://api-pub.bitfinex.com/v2/candles/trade:1D:tZECUSD/hist",
};

/** The ZEC that voted, valued at the day's close when voting ended and at today's price. */
export function voteValue(round: Round, todayUsd: number | null) {
  const part = participation(round);
  if (!part) return null;
  const s = summarize(round);
  const atClose = round.closePrice ? part.zec * round.closePrice.usd : null;
  return {
    zec: part.zec,
    closeUsd: round.closePrice?.usd ?? null,
    atCloseUsd: atClose,
    todayUsd: todayUsd === null ? null : part.zec * todayUsd,
    requestedUsd: s.requestedUsdCents / 100,
    fundedUsd: s.fundedRequestedUsdCents / 100,
    /** Requests as a share of the ZEC that voted, both valued at the close. */
    requestedShareOfStake: atClose && s.requestedUsdCents ? s.requestedUsdCents / 100 / atClose : null,
  };
}

/** Questions coinholders approved (vetoed grants included: the veto came later) and the share of the money they asked for. */
export function approvals(round: Round) {
  const counted = round.proposals.filter((p) => p.outcome !== "discarded");
  const approved = counted.filter((p) => p.outcome === "funded" || p.outcome === "vetoed" || p.outcome === "passed");
  const requested = counted.reduce((sum, p) => sum + (p.requestedUsdCents ?? 0), 0);
  const approvedUsd = approved.reduce((sum, p) => sum + (p.requestedUsdCents ?? 0), 0);
  return {
    questions: counted.length,
    approved: approved.length,
    approvedShare: counted.length ? approved.length / counted.length : null,
    valueShare: requested ? approvedUsd / requested : null,
  };
}

export const formatChange = (share: number) => `${share >= 0 ? "+" : "−"}${Math.abs(share * 100).toFixed(1)}%`;
