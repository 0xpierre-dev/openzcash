/**
 * The verify page's data as files: JSON for scripts (the Python recount's
 * --compare reads it) and CSV for spreadsheets. Both carry every question's
 * four options in ZEC, ZIP 1016 applied to them and the published outcome.
 */
import { tableCsv } from "@/lib/table-csv";
import { SITE_URL } from "@/lib/seo/page-metadata";
import { OUTCOME_LABEL } from "./derive";
import { PROGRAM } from "./program";
import type { Round } from "./types";
import {
  RULE_LABEL,
  ZIP_1016_RULE,
  type RoundCheck,
  type VerifyRow,
} from "./verify";
import {
  RECOUNTS,
  SCRIPT_PATH,
  VOTE_CHAIN_HOSTS,
  VOTE_CHAIN_ROUNDS,
  voteSummaryUrl,
} from "./verify-sources";
import type { ChainResult } from "./vote-chain";

const MAX_DIGITS = 3;

/** Decimals a round's source published (Q3 2026 in eighths of a ZEC: 3), so figures show neither more nor less. */
export function zecDigits(check: RoundCheck): number {
  const values = check.rows.flatMap((r) =>
    [r.accept, r.reject, r.lower, r.abstain].filter(
      (v): v is number => v !== null,
    ),
  );
  const exact = (d: number) =>
    values.every((v) => Math.abs(Math.round(v * 10 ** d) - v * 10 ** d) < 1e-6);
  for (let d = 0; d < MAX_DIGITS; d++) if (exact(d)) return d;
  return MAX_DIGITS;
}

export const exportFilename = (roundId: string, ext: "csv" | "json") =>
  `coinholder-${roundId}-verify.${ext}`;

export type ChainReport =
  | {
      status: "ok";
      chainRoundId: string;
      host: string;
      hostName: string;
      url: string;
      sha256: string;
      bytes: number;
      fetchedAt: string;
      servers: string[];
    }
  | {
      status: "unavailable";
      chainRoundId: string;
      error: string;
      checkedAt: string;
      servers: string[];
    };

/** What the live comparison used, for a round on the vote chain; null for any other round. */
export function chainReport(
  roundId: string,
  result: ChainResult | null,
): ChainReport | null {
  const chainRoundId = VOTE_CHAIN_ROUNDS[roundId];
  if (!chainRoundId) return null;
  const servers = VOTE_CHAIN_HOSTS.map((h) =>
    voteSummaryUrl(h.origin, chainRoundId),
  );
  if (result?.ok)
    return {
      status: "ok",
      chainRoundId,
      host: result.host.origin,
      hostName: result.host.name,
      url: result.url,
      sha256: result.sha256,
      bytes: result.bytes,
      fetchedAt: result.fetchedAt,
      servers,
    };
  return {
    status: "unavailable",
    chainRoundId,
    error: result?.error ?? "not fetched",
    checkedAt: result?.checkedAt ?? new Date().toISOString(),
    servers,
  };
}

const ruleLabel = (r: VerifyRow) => (r.rule ? RULE_LABEL[r.rule] : null);

function jsonRow(r: VerifyRow) {
  return {
    ballot: r.ballot,
    id: r.id,
    title: r.title,
    applicant: r.applicant,
    accept: r.accept,
    reject: r.reject,
    lower: r.lower,
    abstain: r.abstain,
    total: r.total,
    quorumMet: r.quorumMet,
    quorumMetWithoutAbstain: r.quorumMetWithoutAbstain,
    approveShare: r.approveShare,
    rule: ruleLabel(r),
    published: OUTCOME_LABEL[r.published],
    agrees: r.agrees,
    note: r.note?.text ?? null,
    noteUrl: r.note?.href ?? null,
    matchesChain: r.matchesChain,
    ...(r.matchesChain === false ? { chain: r.chain ?? null } : {}),
  };
}

export function verifyJson(
  round: Round,
  check: RoundCheck,
  chain: ChainReport | null,
) {
  const recount = RECOUNTS[round.id];
  return {
    program: PROGRAM.officialName,
    page: `${SITE_URL}/coinholders/verify?round=${round.id}`,
    round: {
      id: round.id,
      label: round.label,
      votingSystem: round.votingSystem,
      ballot: round.ballot,
      talliesSource: round.talliesSource,
    },
    rule: {
      text: ZIP_1016_RULE.text,
      quorumZec: ZIP_1016_RULE.quorumZec,
      quorumCountsAbstain: ZIP_1016_RULE.quorumCountsAbstain,
      href: ZIP_1016_RULE.href,
      confirmedBy: ZIP_1016_RULE.confirmedBy,
      participationConfirmedBy: ZIP_1016_RULE.participationConfirmedBy,
    },
    units:
      "ZEC. The vote chain's total_value counts units of 0.125 ZEC and is divided by 8; an option with no ZEC omits it. approveShare is Accept over Accept plus both Reject options. quorumMet counts every option toward the 420,000 ZEC minimum, Abstain included; quorumMetWithoutAbstain counts only the ZEC for or against.",
    summary: { ...check.counts, chainOnly: check.chainOnly },
    chain,
    recount: recount ? { system: recount.system, links: recount.links } : null,
    sources: round.sources,
    script: `${SITE_URL}${SCRIPT_PATH}`,
    rows: check.rows.map(jsonRow),
  };
}

const yesNo = (v: boolean | null) => (v === null ? "" : v ? "yes" : "no");

/** The CSV's columns, in order; the page's spreadsheet formulas take their column letters from it. */
export const VERIFY_CSV_HEADER = [
  "round",
  "ballot",
  "proposal",
  "applicant",
  "accept_zec",
  "reject_zec",
  "lower_zec",
  "abstain_zec",
  "total_zec",
  "quorum_met",
  "approve_share_pct",
  "rule_outcome",
  "published_outcome",
  "agrees",
  "matches_chain",
  "note",
] as const;

export type VerifyCsvColumn = (typeof VERIFY_CSV_HEADER)[number];

export function verifyCsv(round: Round, check: RoundCheck): string {
  const digits = zecDigits(check);
  const zec = (v: number | null) => (v === null ? "" : v.toFixed(digits));
  return tableCsv(
    [...VERIFY_CSV_HEADER],
    check.rows.map((r) => [
      round.label,
      r.ballot === null ? "" : String(r.ballot),
      r.title,
      r.applicant ?? "",
      zec(r.accept),
      zec(r.reject),
      zec(r.lower),
      zec(r.abstain),
      zec(r.total),
      yesNo(r.quorumMet),
      r.approveShare === null ? "" : (r.approveShare * 100).toFixed(2),
      ruleLabel(r) ?? "",
      OUTCOME_LABEL[r.published],
      yesNo(r.agrees),
      yesNo(r.matchesChain),
      r.note?.text ?? "",
    ]),
  );
}
