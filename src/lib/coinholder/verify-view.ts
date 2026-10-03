/**
 * What the verify page says about a checked round, as pure functions: the
 * verdict and its three checks, the decision chart's rows, the expected
 * result of each rebuild step and the spreadsheet formulas. Every word and
 * figure follows from the check itself, so a new round needs no new copy.
 */
import { SITE_URL } from "@/lib/seo/page-metadata";
import { OUTCOME_LABEL, formatPct, formatZec } from "./derive";
import type { BallotOption, Round } from "./types";
import {
  RULE_LABEL,
  ZIP_1016_RULE,
  type RoundCheck,
  type RuleOutcome,
  type VerifyRow,
} from "./verify";
import {
  VERIFY_CSV_HEADER,
  type ChainReport,
  type VerifyCsvColumn,
} from "./verify-export";
import { RECOUNTS, SCRIPT_NAME, verifyApiPath } from "./verify-sources";

// ---------- Words ----------

const MINIMUM = `${formatZec(ZIP_1016_RULE.quorumZec)} ZEC`;
const OPTION_COUNT: Record<number, string> = {
  2: "both",
  3: "all three",
  4: "all four",
};

/** "proposal" or "question", singular or plural. */
export const nounOf = (check: RoundCheck, n = 2) =>
  `${check.kind === "poll" ? "question" : "proposal"}${n === 1 ? "" : "s"}`;

export const listOf = (items: string[]) =>
  items.length < 3
    ? items.join(" and ")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** A question's name without its subtitle ("ZChat: the first…" reads "ZChat"). */
export const shortTitle = (title: string) => title.split(/: | \(| · /)[0];

/** An option as the chart, its legend and screen readers name it. */
export function optionName(o: BallotOption): string {
  if (o.key === "rejectLower") return "Reject at a lower amount";
  if (o.key === "abstain") return "Abstain";
  return o.label.split(" · ")[0];
}

const approveName = (round: Round) =>
  optionName(
    round.ballot.find((o) => o.key === "approve") ?? {
      key: "approve",
      label: "Accept",
    },
  );
const hasAbstain = (round: Round) =>
  round.ballot.some((o) => o.key === "abstain");

/** One decimal, but never 100.0% or 0.0% while the other side has ZEC. */
export function formatShare(share: number): string {
  if (share > 0.999 && share < 1) return ">99.9%";
  if (share > 0 && share < 0.001) return "<0.1%";
  return formatPct(share);
}

/** The first and last hex digits of a hash, for a chip; the full hash goes in its title. */
export const abbreviateHash = (hash: string, head = 8, tail = 6) =>
  `${hash.slice(0, head)}…${hash.slice(-tail)}`;

export const hostOf = (origin: string) => new URL(origin).host;
export const utcTime = (iso: string) =>
  `${new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  })} UTC`;

// ---------- The verdict ----------

export type Failure = {
  ballot: number | null;
  title: string;
  reasons: string[];
};

export type Verdict = {
  /** Results that check out: the rule gives the published outcome and, where compared, the tally equals the chain's. */
  passed: number;
  /** Results that could be checked (a discarded question was never counted). */
  judged: number;
  /** Every result checks out and nothing that should have run was skipped. */
  positive: boolean;
  failures: Failure[];
  /** "37 of 37" and the rest of the sentence, so the count can be set apart. */
  count: string;
  rest: string;
  /** Which results do not check out, and why; null when all do. */
  failLine: string | null;
};

function failureOf(r: VerifyRow): Failure | null {
  const reasons: string[] = [];
  if (r.agrees === false && r.rule)
    reasons.push(
      `ZIP 1016 gives ${RULE_LABEL[r.rule]}, published ${OUTCOME_LABEL[r.published]}`,
    );
  if (r.matchesChain === false)
    reasons.push(
      r.chain
        ? "its tally differs from the vote chain"
        : "it is not on the vote chain",
    );
  return reasons.length ? { ballot: r.ballot, title: r.title, reasons } : null;
}

const named = (f: { ballot: number | null; title: string }) =>
  f.ballot === null ? f.title : `#${f.ballot} ${f.title}`;

export function verdictOf(
  check: RoundCheck,
  chain: ChainReport | null,
): Verdict {
  const judged = check.rows.filter((r) => r.agrees !== null);
  const failures = check.rows
    .map(failureOf)
    .filter((f): f is Failure => f !== null);
  const passed = judged.filter(
    (r) => r.agrees && r.matchesChain !== false,
  ).length;
  const lines: string[] = [];
  if (failures.length === 1) {
    const [f] = failures;
    lines.push(`${named(f)} does not: ${f.reasons.join("; ")}.`);
  } else if (failures.length > 1) {
    lines.push(
      `${failures.length} do not: ${listOf(failures.map((f) => `${named(f)} (${f.reasons.join("; ")})`))}.`,
    );
  }
  const extra = check.chainOnly;
  if (extra.length)
    lines.push(
      `${extra.length === 1 ? "Ballot" : "Ballots"} ${listOf(extra.map(String))} ${extra.length === 1 ? "is" : "are"} on the vote chain but not on this page.`,
    );
  return {
    passed,
    judged: judged.length,
    positive:
      passed === judged.length &&
      failures.length === 0 &&
      extra.length === 0 &&
      chain?.status !== "unavailable",
    failures,
    count: `${passed} of ${judged.length}`,
    rest: judged.length === 1 ? "result checks out" : "results check out",
    failLine: lines.length ? lines.join(" ") : null,
  };
}

export type CheckMark = "ok" | "bad" | "quiet" | "source";
export type VerdictCheck = {
  mark: CheckMark;
  text: string;
  sub: string;
  href?: string;
};

/** The quorum check's line: which reading of the minimum, and the other one when it differs. */
export function quorumSub(round: Round, check: RoundCheck) {
  const c = check.counts;
  if (!hasAbstain(round)) return `${MINIMUM} or more voted`;
  return c.quorumMetWithoutAbstain === c.quorumMet
    ? `${MINIMUM} or more, with or without Abstain`
    : `${MINIMUM} or more with Abstain · ${c.quorumMetWithoutAbstain} of ${c.withTally} without`;
}

function chainCheck(
  round: Round,
  check: RoundCheck,
  chain: ChainReport,
): VerdictCheck {
  if (chain.status === "unavailable")
    return {
      mark: "quiet",
      text: "vote chain unavailable just now",
      sub: "neither server answered; try again shortly",
    };
  const c = check.counts;
  const differ = (c.chainChecked ?? 0) - (c.chainMatches ?? 0);
  const sub = `${OPTION_COUNT[round.ballot.length] ?? "all"} options · ${chain.hostName}`;
  if (differ === 0 && check.chainOnly.length === 0)
    return { mark: "ok", text: "equals the vote chain", sub };
  const parts = [
    differ
      ? `differs from the vote chain on ${differ} of ${c.chainChecked}`
      : "",
    check.chainOnly.length
      ? `${check.chainOnly.length} on the vote chain only`
      : "",
  ].filter(Boolean);
  return { mark: "bad", text: parts.join(" · "), sub };
}

/** The verdict's row of three: the minimum, the rule, and the vote chain (or, for older rounds, where the tallies come from). */
export function verdictChecks(
  round: Round,
  check: RoundCheck,
  chain: ChainReport | null,
): VerdictCheck[] {
  const c = check.counts;
  const nouns = nounOf(check);
  const poll = check.kind === "poll" ? ", for comparison only" : "";
  const checks: VerdictCheck[] = [
    c.quorumMet === c.withTally
      ? { mark: "ok", text: "quorum met on all", sub: quorumSub(round, check) }
      : {
          mark: "quiet",
          text: `quorum met on ${c.quorumMet} of ${c.withTally}`,
          sub: quorumSub(round, check),
        },
    c.ruleAgrees === c.ruleChecked
      ? {
          mark: "ok",
          text: "ZIP 1016 gives the published outcome",
          sub: `all ${c.ruleChecked} ${nouns}${poll}`,
        }
      : {
          mark: "bad",
          text: `ZIP 1016 differs on ${c.ruleChecked - c.ruleAgrees} of ${c.ruleChecked}`,
          sub: `${c.ruleAgrees} of ${c.ruleChecked} ${nouns} agree${poll}`,
        },
  ];
  if (chain) return [...checks, chainCheck(round, check, chain)];
  const recount = RECOUNTS[round.id];
  return recount
    ? [
        ...checks,
        {
          mark: "source",
          text: `tallies from ${recount.source.from}`,
          sub: recount.source.sub,
          href: recount.links[0]?.href,
        },
      ]
    : checks;
}

/** Where the tallies come from, in one sentence. */
function sourceLine(
  round: Round,
  check: RoundCheck,
  chain: ChainReport | null,
) {
  const c = check.counts;
  if (!chain) return RECOUNTS[round.id]?.system ?? "";
  if (chain.status === "unavailable")
    return "The vote chain did not answer, so the tallies below are this site's stored copy, not compared this time.";
  const differ = (c.chainChecked ?? 0) - (c.chainMatches ?? 0);
  return differ === 0
    ? "Every tally below equals the vote chain's finalized summary, option by option, divided by 8."
    : `${differ} of ${c.chainChecked} tallies ${differ === 1 ? "differs" : "differ"} from the vote chain's finalized summary; each is marked below.`;
}

/**
 * FPF includes Abstain in participation. Retain the without-Abstain comparison
 * for older rounds without presenting it as the current counting rule.
 */
function abstainMinimumLine(check: RoundCheck) {
  const c = check.counts;
  const short = check.rows.filter(
    (r) => r.quorumMet && r.quorumMetWithoutAbstain === false,
  );
  if (!short.length) return "";
  const met =
    c.quorumMet === c.withTally
      ? `all ${c.withTally} met it`
      : `${c.quorumMet} of ${c.withTally} met it`;
  const turned = short.filter((r) => r.turnsOnAbstain);
  const either = turned.length
    ? `Leaving Abstain out would change the outcome of ${listOf(turned.map((r) => shortTitle(r.title)))}.`
    : `${short.length === 1 ? "It was" : short.length === 2 ? "Both were" : `All ${short.length} were`} ${RULE_LABEL[check.kind === "poll" ? "not_passed" : "rejected"].toLowerCase()} either way.`;
  return `Under FPF’s current counting rule, Abstain counts toward the ${MINIMUM} minimum: ${met}. For comparison, without Abstain, ${listOf(short.map((r) => shortTitle(r.title)))} did not. ${either}`;
}

/** What the figures below show, from the counts themselves. */
export function summaryLine(
  round: Round,
  check: RoundCheck,
  chain: ChainReport | null,
) {
  const c = check.counts;
  const agreed =
    c.ruleAgrees === c.ruleChecked
      ? `all ${c.ruleChecked}`
      : `${c.ruleAgrees} of ${c.ruleChecked}`;
  const corrected = round.proposals.filter((p) => p.correction).length;
  const vetoed = round.proposals.filter((p) => p.outcome === "vetoed").length;
  const discarded = c.proposals - c.withTally;
  return [
    sourceLine(round, check, chain),
    `ZIP 1016 applied to the tallies gives the published outcome for ${agreed} ${nounOf(check)}${corrected ? `, ${corrected === 1 ? "one" : corrected} of them after FPF corrected it` : ""}.`,
    abstainMinimumLine(check),
    vetoed
      ? `The vetoed ${vetoed === 1 ? "grant" : "grants"} passed the vote; the veto came afterwards.`
      : "",
    discarded
      ? `${discarded === 1 ? "The discarded question has" : `${discarded} discarded questions have`} no published votes and ${discarded === 1 ? "is" : "are"} not counted.`
      : "",
    check.kind === "poll"
      ? "The poll set the program's terms; the ZIP 1016 test is applied to it for comparison only."
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Said where a recount's outcomes are set beside the published ones: a vetoed grant passed the rule, so the rule counts it Funded. */
export function vetoNote(round: Round): string {
  const vetoed = round.proposals.filter((p) => p.outcome === "vetoed").length;
  if (!vetoed) return "";
  return vetoed === 1
    ? "The vetoed grant passed the rule, so the rule counts it Funded; the veto came afterwards."
    : `The ${vetoed} vetoed grants passed the rule, so the rule counts them Funded; the vetoes came afterwards.`;
}

// ---------- The decision chart ----------

type DecidingKey = "approve" | "reject" | "rejectLower";
type OptionField = "accept" | "reject" | "lower" | "abstain";
const ROW_KEY: Record<BallotOption["key"], OptionField> = {
  approve: "accept",
  reject: "reject",
  rejectLower: "lower",
  abstain: "abstain",
};

export type DecisionSegment = {
  key: DecidingKey;
  name: string;
  /** Share of the ZEC for or against, 0 to 1. */
  part: number;
};

export type DecisionFlag = {
  tag: string;
  text: string;
  href: string | null;
  tone: "note" | "bad";
};

export type DecisionRow = {
  id: string;
  ballot: number | null;
  title: string;
  /** Accept's share of the ZEC for or against; null without a tally. */
  share: number | null;
  shareText: string | null;
  segments: DecisionSegment[];
  outcome: string;
  /** The rule outcome's colour; "none" when the question was never counted. */
  tone: RuleOutcome | "none";
  flag: DecisionFlag | null;
  /** Everything the row shows and hides, for screen readers. */
  description: string;
  /** Every option, Abstain and the total, on hover. */
  tooltip: string;
};

function flagOf(
  r: VerifyRow,
  round: Round,
  zec: (v: number | null) => string,
): DecisionFlag | null {
  const bad: string[] = [];
  if (r.agrees === false && r.rule)
    bad.push(
      `ZIP 1016 gives ${RULE_LABEL[r.rule]}; published ${OUTCOME_LABEL[r.published]}.`,
    );
  if (r.matchesChain === false)
    bad.push(
      r.chain
        ? `Vote chain: ${round.ballot.map((o) => `${optionName(o)} ${zec(r.chain![ROW_KEY[o.key]])}`).join(" · ")}.`
        : "Not on the vote chain.",
    );
  if (bad.length)
    return {
      tag: r.agrees === false ? "differs" : "chain differs",
      text: bad.join(" "),
      href: r.note?.href ?? null,
      tone: "bad",
    };
  if (!r.note) return null;
  const tag =
    r.published === "vetoed"
      ? "vetoed"
      : r.published === "discarded"
        ? "discarded"
        : "corrected";
  return { tag, text: r.note.text, href: r.note.href, tone: "note" };
}

/** One row per question: the ZEC for or against as parts of a bar, the rule outcome, the Accept share and any note. */
export function decisionRows(
  round: Round,
  check: RoundCheck,
  digits: number,
): DecisionRow[] {
  const zec = (v: number | null) => (v === null ? "·" : formatZec(v, digits));
  const accept = approveName(round);
  const deciding = round.ballot.filter(
    (o): o is BallotOption & { key: DecidingKey } => o.key !== "abstain",
  );
  return check.rows.map((r) => {
    const value = (o: BallotOption) => r[ROW_KEY[o.key]] ?? 0;
    const decided = deciding.reduce((sum, o) => sum + value(o), 0);
    const counted = r.total !== null;
    const shareText =
      r.approveShare === null ? null : formatShare(r.approveShare);
    const figures = round.ballot
      .map((o) => `${optionName(o)} ${zec(value(o))} ZEC`)
      .join(", ");
    const name = r.ballot === null ? r.title : `#${r.ballot} ${r.title}`;
    const outcome = r.rule ? RULE_LABEL[r.rule] : OUTCOME_LABEL[r.published];
    return {
      id: r.id,
      ballot: r.ballot,
      title: r.title,
      share: r.approveShare,
      shareText,
      segments:
        counted && decided > 0
          ? deciding.map((o) => ({
              key: o.key,
              name: optionName(o),
              part: value(o) / decided,
            }))
          : [],
      outcome,
      tone: r.rule ?? "none",
      flag: flagOf(r, round, zec),
      description: counted
        ? `${name}. ${figures}; ${zec(r.total)} ZEC in all. ${accept} ${shareText ?? "has no share"} of the ZEC for or against. ZIP 1016 gives ${outcome}. Published: ${OUTCOME_LABEL[r.published]}.`
        : `${name}. No published tally. Published: ${OUTCOME_LABEL[r.published]}.`,
      tooltip: counted
        ? `${round.ballot.map((o) => `${optionName(o)} ${zec(value(o))}`).join(" · ")} · Total ${zec(r.total)} ZEC`
        : "No published tally",
    };
  });
}

/** The chart card's words: its title, what the bar shows, the sort choices and the legend. The measure is "Accept share" (or "Yes share") everywhere. */
export function chartText(round: Round, check: RoundCheck) {
  const accept = approveName(round);
  const reject = optionName(
    round.ballot.find((o) => o.key === "reject") ?? {
      key: "reject",
      label: "Reject",
    },
  );
  const poll = check.kind === "poll";
  return {
    title: `How each ${nounOf(check, 1)} was decided`,
    sub: [
      poll ? `ZEC for ${accept} or ${reject}` : "ZEC for or against",
      "the line is 50%",
      hasAbstain(round) ? "Abstain left out" : "",
    ]
      .filter(Boolean)
      .join(" · "),
    sortShare: `${accept} share`,
    sortBallot: "Ballot #",
    legend: round.ballot
      .filter((o) => o.key !== "abstain")
      .map((o) => ({ key: o.key as DecidingKey, name: optionName(o) })),
    right: `Outcome and ${accept} share on the right`,
  };
}

export type DecisionSort = "share" | "ballot";

/** Highest share first (ties by ballot), or ballot order; a question without a tally goes last. */
export function sortDecisions(
  rows: DecisionRow[],
  by: DecisionSort,
): DecisionRow[] {
  const ballot = (r: DecisionRow) => r.ballot ?? Number.MAX_SAFE_INTEGER;
  return [...rows].sort((a, b) => {
    if (by === "share") {
      if (a.share === null || b.share === null)
        return (
          (a.share === null ? 1 : 0) - (b.share === null ? 1 : 0) ||
          ballot(a) - ballot(b)
        );
      return b.share - a.share || ballot(a) - ballot(b);
    }
    return ballot(a) - ballot(b);
  });
}

// ---------- What each rebuild step should print ----------

/** "17 Funded · 20 Rejected": the rule outcomes of every counted question. */
export function outcomeCounts(check: RoundCheck): string {
  const order: RuleOutcome[] = ["funded", "passed", "rejected", "not_passed"];
  return order
    .map((o) => [o, check.rows.filter((r) => r.rule === o).length] as const)
    .filter(([, n]) => n > 0)
    .map(([o, n]) => `${n} ${RULE_LABEL[o]}`)
    .join(" · ");
}

export type Expectations = {
  /** The body's hash, when this visit fetched it. */
  hash: { text: string; full: string } | null;
  rows: string;
  outcomes: string;
  compare: string;
  tallies: string;
  script: string;
  run: string;
  sheetRows: string;
  totals: string;
};

export function expectations(
  round: Round,
  check: RoundCheck,
  chain: ChainReport | null,
): Expectations {
  const counted = check.counts.withTally;
  const onChain =
    chain?.status === "ok" ? counted + check.chainOnly.length : counted;
  const hash =
    chain?.status === "ok"
      ? {
          text: `sha256 ${abbreviateHash(chain.sha256)}`,
          full: chain.sha256,
        }
      : null;
  return {
    hash,
    rows: `${onChain} rows × ${round.ballot.length} options`,
    outcomes: outcomeCounts(check),
    compare: `compare: ${onChain} of ${onChain} agree`,
    tallies: `${counted} ${counted === 1 ? "tally" : "tallies"}`,
    script: SCRIPT_NAME,
    run: hash ? `${onChain} rows · ${hash.text}` : `${onChain} rows · sha256`,
    sheetRows: `${check.rows.length} rows + header`,
    totals: `TRUE on ${counted} rows`,
  };
}

// ---------- The spreadsheet path ----------

/** A spreadsheet column's letters: 0 is A, 25 is Z, 26 is AA. */
export function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * Formulas for Google Sheets on this page's CSV, with the column letters of
 * the CSV itself: import it, check each total, apply ZIP 1016 to the options.
 */
export function sheetFormulas(round: Round, check: RoundCheck) {
  const col = (c: VerifyCsvColumn) =>
    columnLetter(VERIFY_CSV_HEADER.indexOf(c));
  const [a, r, l, x, total] = (
    [
      "accept_zec",
      "reject_zec",
      "lower_zec",
      "abstain_zec",
      "total_zec",
    ] as const
  ).map(col);
  const totalCell = columnLetter(VERIFY_CSV_HEADER.length);
  const ruleCell = columnLetter(VERIFY_CSV_HEADER.length + 1);
  const [yes, no] =
    check.kind === "poll"
      ? [RULE_LABEL.passed, RULE_LABEL.not_passed]
      : [RULE_LABEL.funded, RULE_LABEL.rejected];
  const url = `${SITE_URL}${verifyApiPath(round.id, "csv")}`;
  const sum = `${a}2+${r}2+${l}2+${x}2`;
  return {
    url,
    importFormula: `=IMPORTDATA("${url}")`,
    columns: {
      options: `${a} to ${x}`,
      total,
      rule: col("rule_outcome"),
      published: col("published_outcome"),
    },
    totalCell,
    totalFormula: `=${sum}=${total}2`,
    ruleCell,
    ruleFormula: `=IF(AND(${sum}>=${ZIP_1016_RULE.quorumZec}, ${a}2>${r}2+${l}2), "${yes}", "${no}")`,
  };
}
