/**
 * Shapes for the Coinholder-Directed Retroactive Grants Program pages.
 * Every figure is curated from a primary source named beside it; nothing here
 * is computed from market data or estimated.
 */

/** What the official results say happened to a question. `passed` is for program polls, not grants. */
export type Outcome =
  | "passed"
  | "funded"
  | "rejected"
  | "rejected_lower"
  | "abstain"
  | "vetoed"
  | "discarded";

/** ZEC cast for each ballot option on one question. `rejectLower` exists from Q3 2026 on. */
export type Tally = {
  approve: number;
  reject: number;
  rejectLower?: number;
  abstain: number;
};

export type Link = { label: string; href: string };

export type RoundProposal = {
  /** Stable key within the round: the FPF GitHub issue number when there is one. */
  id: string;
  /** Question number on the ballot, when the round numbered them. */
  question?: number;
  title: string;
  applicant: string | null;
  /** Requested amount in integer US cents; null when the question asked for no money. */
  requestedUsdCents: number | null;
  requestedNote?: string;
  summary?: string;
  outcome: Outcome;
  /** Short factual notes shown under the title (veto, discard, carry-over, payment). */
  notes?: string[];
  /** A public objection to the published outcome, stated without judgement. */
  dispute?: { by: string; text: string; href: string };
  /** The published outcome was changed after a public objection. */
  correction?: { text: string; href: string };
  tally: Tally | null;
  links: Link[];
};

export type RoundStatus = "results" | "postponed" | "ratified";

/** A ballot option, keyed to the tally field that counts it, with the wording the round used. */
export type BallotOption = {
  key: "approve" | "reject" | "rejectLower" | "abstain";
  label: string;
};

export type Round = {
  /** URL segment: q3-2026, q2-2026, q1-2026, q4-2025, ratification-2025. */
  id: string;
  label: string;
  /** The name the round was announced under. */
  announcedAs: string;
  status: RoundStatus;
  /** One line under the tab. */
  tagline: string;
  /** Plain-language summary under the page title. */
  summary: string;
  /** The round's calendar in date order; `missed` marks a planned date that never happened. */
  /** `start`/`end` (UTC dates, inclusive) give each phase its length in days on the calendar stepper. */
  windows: {
    label: string;
    value: string;
    start?: string;
    end?: string;
    missed?: boolean;
  }[];
  ballot: BallotOption[];
  votingSystem: string | null;
  /** Round-wide participation statement. */
  turnout: string | null;
  /** Who published the per-question tallies. */
  talliesSource: Link | null;
  /** ZEC/USD daily close (Bitfinex, UTC) on the day voting closed; null when no vote was held. */
  closePrice: { usd: number; date: string } | null;
  proposals: RoundProposal[];
  /** Facts specific to this round (veto, discarded question, postponement, transparent voter). */
  notes: string[];
  /** What this round did differently from the one before: voting system, ballot, counting rules. */
  changes: string[];
  /** Postponed round: the submissions that moved to a later round. */
  carriedOver?: { title: string; href: string }[];
  sources: Link[];
};
