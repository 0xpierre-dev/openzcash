/**
 * "Verify it yourself": each round's published tallies, ZIP 1016 applied to
 * them, and the outcome FPF published, side by side. For a round held on the
 * shielded vote chain, the curated tallies are also compared, option by
 * option, with the chain's finalized vote summary.
 *
 * Pure functions only: the live fetch lives in vote-chain.ts, exports in
 * verify-export.ts, and how each round can be recounted in verify-sources.ts.
 */
import { QUORUM_ZEC, OUTCOME_LABEL } from "./derive";
import { ROUNDS } from "./rounds";
import type { Outcome, Round, Tally } from "./types";

/**
 * ZIP 1016 as this page applies it. FPF confirmed the majority test on
 * September 30, 2026 (abstentions are left out of it); ZIP 1016 does not say
 * whether Abstain counts toward the 420,000 ZEC minimum, and no published
 * source settles it, so the page counts it and keeps the other reading beside.
 */
export const ZIP_1016_RULE = {
  quorumZec: QUORUM_ZEC,
  /** The reading applied to the minimum: every option, Abstain included. */
  quorumCountsAbstain: true,
  text: "A question passes when at least 420,000 ZEC voted on it and more ZEC chose Accept than both Reject options together; Abstain is left out of that majority, as FPF confirmed on September 30, 2026. ZIP 1016 does not say whether Abstain counts toward the 420,000 ZEC minimum: this page counts it, and says where leaving it out would matter.",
  href: "https://zips.z.cash/zip-1016",
  /** FPF's reply covers the majority test only. */
  confirmedBy: {
    label: "FPF on abstentions, September 30, 2026",
    covers: "Abstentions are left out of the majority.",
    href: "https://forum.zcashcommunity.com/t/q3-coinholder-directed-retroactive-grants-program-results/57909/4",
  },
} as const;

export type RuleCheck = {
  /** ZEC voted on the question, Abstain included. */
  total: number;
  /** ZEC for or against: Accept plus both Reject options. */
  decided: number;
  quorumMet: boolean;
  /** The other reading of the minimum: ZEC for or against only. */
  quorumMetWithoutAbstain: boolean;
  /** Accept's share of the ZEC for or against; null when nobody took a side. */
  approveShare: number | null;
  passes: boolean;
  /** Whether it would pass if Abstain did not count toward the minimum. */
  passesWithoutAbstain: boolean;
};

export function applyZip1016(t: Tally): RuleCheck {
  const against = t.reject + (t.rejectLower ?? 0);
  const decided = t.approve + against;
  const total = decided + t.abstain;
  const quorumMet = total >= QUORUM_ZEC;
  const quorumMetWithoutAbstain = decided >= QUORUM_ZEC;
  const majority = t.approve > against;
  return {
    total,
    decided,
    quorumMet,
    quorumMetWithoutAbstain,
    approveShare: decided > 0 ? t.approve / decided : null,
    passes: quorumMet && majority,
    passesWithoutAbstain: quorumMetWithoutAbstain && majority,
  };
}

// ---------- The vote chain's finalized summary ----------

/** One question of a finalized vote-chain round, in ZEC. */
export type ChainProposal = {
  ballot: number;
  title: string;
  accept: number;
  reject: number;
  lower: number;
  abstain: number;
};

export type VoteSummary = {
  voteRoundId: string | null;
  description: string | null;
  voteEndTime: number | null;
  proposals: ChainProposal[];
};

/** On-chain values count units of 0.125 ZEC. */
export const UNITS_PER_ZEC = 8;

type OptionKey = "accept" | "reject" | "lower" | "abstain";

/** The chain names options in words; classify them by wording, not by position. */
function optionKey(label: string): OptionKey | null {
  const l = label.trim().toLowerCase();
  if (l.startsWith("accept")) return "accept";
  if (l.startsWith("abstain")) return "abstain";
  if (l.startsWith("reject"))
    return l.includes("lower amount") ? "lower" : "reject";
  return null;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

function malformed(where: string, what: string): never {
  throw new Error(`Malformed vote summary: ${where} ${what}`);
}

function parseProposal(p: unknown, i: number): ChainProposal {
  const where = `proposals[${i}]`;
  if (!isRecord(p)) malformed(where, "is not an object");
  if (!isCount(p.id) || p.id < 1)
    malformed(where, "has no positive ballot number");
  if (typeof p.title !== "string") malformed(where, "has no title");
  if (!Array.isArray(p.options) || p.options.length === 0)
    malformed(where, "has no options");
  const zec: Partial<Record<OptionKey, number>> = {};
  p.options.forEach((o: unknown, j: number) => {
    const at = `${where}.options[${j}]`;
    if (!isRecord(o) || typeof o.label !== "string")
      malformed(at, "has no label");
    // A zero is omitted from the chain's JSON: index 0, a count of 0, a value of 0.
    for (const field of ["total_value", "ballot_count", "index"] as const)
      if (o[field] !== undefined && !isCount(o[field]))
        malformed(at, `has an invalid ${field}`);
    const key = optionKey(o.label);
    if (!key) malformed(at, `has an unknown option "${o.label}"`);
    if (zec[key] !== undefined) malformed(where, `repeats the ${key} option`);
    zec[key] = ((o.total_value as number | undefined) ?? 0) / UNITS_PER_ZEC;
  });
  for (const key of ["accept", "reject", "abstain"] as const)
    if (zec[key] === undefined) malformed(where, `has no ${key} option`);
  return {
    ballot: p.id,
    title: p.title,
    accept: zec.accept!,
    reject: zec.reject!,
    lower: zec.lower ?? 0,
    abstain: zec.abstain!,
  };
}

/**
 * Normalises the chain's `/shielded-vote/v1/vote-summary/<round>` JSON into
 * ZEC per option and ballot number. Throws on anything malformed. The chain's
 * `ballot_count` is left out on purpose: it counts revealed encrypted shares,
 * not voters.
 */
export function parseVoteSummary(json: unknown): VoteSummary {
  if (!isRecord(json)) malformed("the body", "is not an object");
  if (!Array.isArray(json.proposals) || json.proposals.length === 0)
    malformed("the body", "has no proposals");
  const proposals = json.proposals.map(parseProposal);
  const seen = new Set<number>();
  for (const p of proposals) {
    if (seen.has(p.ballot)) malformed(`ballot ${p.ballot}`, "appears twice");
    seen.add(p.ballot);
  }
  return {
    voteRoundId:
      typeof json.vote_round_id === "string" ? json.vote_round_id : null,
    description: typeof json.description === "string" ? json.description : null,
    voteEndTime: isCount(json.vote_end_time) ? json.vote_end_time : null,
    proposals: [...proposals].sort((a, b) => a.ballot - b.ballot),
  };
}

// ---------- One round, checked ----------

export type RuleOutcome = "funded" | "rejected" | "passed" | "not_passed";

export const RULE_LABEL: Record<RuleOutcome, string> = {
  funded: "Funded",
  rejected: "Rejected",
  passed: "Passed",
  not_passed: "Not passed",
};

/** Whether a published outcome means the question passed the vote; null when it was never counted. */
const PASSED_VOTE: Record<Outcome, boolean | null> = {
  passed: true,
  funded: true,
  vetoed: true,
  rejected: false,
  rejected_lower: false,
  abstain: false,
  discarded: null,
};

/** Why a row reads as it does: a correction, a veto or a discarded question. */
export type VerifyNote = { text: string; href: string | null };

export type VerifyRow = {
  ballot: number | null;
  id: string;
  title: string;
  applicant: string | null;
  /** ZEC per option; null when the round's ballot had no such option or no tally was published. */
  accept: number | null;
  reject: number | null;
  lower: number | null;
  abstain: number | null;
  total: number | null;
  quorumMet: boolean | null;
  /** The minimum met by the ZEC for or against alone. */
  quorumMetWithoutAbstain: boolean | null;
  approveShare: number | null;
  rule: RuleOutcome | null;
  /** The rule outcome would differ if Abstain did not count toward the minimum. */
  turnsOnAbstain: boolean;
  published: Outcome;
  /** Rule against the published outcome; null when the question was never counted. */
  agrees: boolean | null;
  note: VerifyNote | null;
  /** Null when no vote-chain summary was compared. */
  matchesChain: boolean | null;
  /** The chain's figures for this ballot when compared; null when the chain has no such ballot. */
  chain?: Omit<ChainProposal, "ballot" | "title"> | null;
};

export type RoundCheck = {
  roundId: string;
  kind: "grants" | "poll";
  rows: VerifyRow[];
  counts: {
    proposals: number;
    withTally: number;
    quorumMet: number;
    quorumMetWithoutAbstain: number;
    /** Questions whose rule outcome depends on whether Abstain counts toward the minimum. */
    turnsOnAbstain: number;
    ruleChecked: number;
    ruleAgrees: number;
    chainChecked: number | null;
    chainMatches: number | null;
  };
  /** Ballots on the vote chain with no curated row. */
  chainOnly: number[];
};

/** Rounds with at least one published tally, newest first. */
export const VERIFIABLE_ROUNDS: Round[] = ROUNDS.filter((r) =>
  r.proposals.some((p) => p.tally),
);

/** The round an id names (case-insensitive), the newest when none is given, null when it held no vote. */
export function findVerifiableRound(
  id: string | null | undefined,
): Round | null {
  const key = id?.trim().toLowerCase();
  if (!key) return VERIFIABLE_ROUNDS[0] ?? null;
  return VERIFIABLE_ROUNDS.find((r) => r.id === key) ?? null;
}

function noteFor(p: Round["proposals"][number]): VerifyNote | null {
  if (p.outcome === "discarded")
    return {
      text: "Discarded by FPF for skipping the 30-day review; its votes were never published.",
      href: p.links[0]?.href ?? null,
    };
  if (p.outcome === "vetoed")
    return {
      text: "Passed the vote; the key-holders vetoed it afterwards, so it was never paid.",
      href: p.links.find((l) => /veto/i.test(l.label))?.href ?? null,
    };
  if (p.correction)
    return {
      text: p.correction.from
        ? `Published first as ${OUTCOME_LABEL[p.correction.from]}, then corrected to ${OUTCOME_LABEL[p.outcome]}.`
        : "The published result was corrected.",
      href: p.correction.href,
    };
  return null;
}

function ruleOutcome(kind: RoundCheck["kind"], passes: boolean): RuleOutcome {
  if (kind === "poll") return passes ? "passed" : "not_passed";
  return passes ? "funded" : "rejected";
}

type ChainTally = NonNullable<VerifyRow["chain"]>;
const chainTally = (p: ChainProposal): ChainTally => ({
  accept: p.accept,
  reject: p.reject,
  lower: p.lower,
  abstain: p.abstain,
});
/** Exact equality: both sides are multiples of 0.125 ZEC, which binary floats hold exactly. */
const sameTally = (a: ChainTally, t: Tally) =>
  a.accept === t.approve &&
  a.reject === t.reject &&
  a.lower === (t.rejectLower ?? 0) &&
  a.abstain === t.abstain;

/**
 * Every question of a round with its tally, ZIP 1016 applied to it and the
 * published outcome. With `live`, each tally is also compared with the vote
 * chain's finalized summary, matched by ballot number (never by title).
 */
export function verifyRound(
  round: Round,
  live?: VoteSummary | null,
): RoundCheck {
  const options = new Set(round.ballot.map((o) => o.key));
  const kind = round.proposals.every((p) => p.requestedUsdCents === null)
    ? "poll"
    : "grants";
  const chain = new Map(live?.proposals.map((p) => [p.ballot, p]) ?? []);
  const rows = [...round.proposals]
    .sort((a, b) => (a.question ?? 0) - (b.question ?? 0))
    .map((p): VerifyRow => {
      const t = p.outcome === "discarded" ? null : p.tally;
      const counted = t ? applyZip1016(t) : null;
      const passedVote = PASSED_VOTE[p.outcome];
      const onChain = p.question === undefined ? undefined : chain.get(p.question);
      const option = (key: "approve" | "reject" | "rejectLower" | "abstain") =>
        t && options.has(key) ? (t[key] ?? 0) : null;
      const compared = live && t;
      return {
        ballot: p.question ?? null,
        id: p.id,
        title: p.title,
        applicant: p.applicant,
        accept: option("approve"),
        reject: option("reject"),
        lower: option("rejectLower"),
        abstain: option("abstain"),
        total: counted?.total ?? null,
        quorumMet: counted?.quorumMet ?? null,
        quorumMetWithoutAbstain: counted?.quorumMetWithoutAbstain ?? null,
        approveShare: counted?.approveShare ?? null,
        rule: counted ? ruleOutcome(kind, counted.passes) : null,
        turnsOnAbstain: counted
          ? counted.passes !== counted.passesWithoutAbstain
          : false,
        published: p.outcome,
        agrees:
          counted && passedVote !== null ? passedVote === counted.passes : null,
        note: noteFor(p),
        matchesChain: compared ? Boolean(onChain && sameTally(onChain, t)) : null,
        ...(compared ? { chain: onChain ? chainTally(onChain) : null } : {}),
      };
    });
  const ballots = new Set(round.proposals.map((p) => p.question));
  const withTally = rows.filter((r) => r.total !== null);
  const judged = rows.filter((r) => r.agrees !== null);
  return {
    roundId: round.id,
    kind,
    rows,
    counts: {
      proposals: rows.length,
      withTally: withTally.length,
      quorumMet: withTally.filter((r) => r.quorumMet).length,
      quorumMetWithoutAbstain: withTally.filter(
        (r) => r.quorumMetWithoutAbstain,
      ).length,
      turnsOnAbstain: rows.filter((r) => r.turnsOnAbstain).length,
      ruleChecked: judged.length,
      ruleAgrees: judged.filter((r) => r.agrees).length,
      chainChecked: live ? withTally.length : null,
      chainMatches: live
        ? withTally.filter((r) => r.matchesChain).length
        : null,
    },
    chainOnly: live
      ? live.proposals.map((p) => p.ballot).filter((b) => !ballots.has(b))
      : [],
  };
}
