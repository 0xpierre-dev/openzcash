/**
 * How /communities words a community's funding: the badges, the quiet lines
 * under them, the badge tooltips, the funding filter and the directory total.
 *
 * Pure so the page's modes are unit-tested: ZCG figures from the "ledger"
 * (read from the mirror now) or the "fallback" (dated curated figures), and
 * ZecHub DAO payouts from the imported treasury sheet or its dated copy.
 */

import type { CommunityZcg } from "./data";
import { daoGrants } from "./dao-funding";
import type { DaoGrant } from "./dao-proposals";
import { ledgerDateLabel, type FundingSource } from "./ledger-funding";

export type FundingBadge = "zcg" | "dao" | "none";
/** The directory's funding filter. */
export type FundingFilter = "all" | "zcg" | "dao" | "none";

/** "$2.29M", "$20K", "$1.5K", "$950". */
export function compactUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `$${Math.round(n / 1_000)}K`;
  // One decimal below $10K, so $1,500 does not read as $2K.
  if (n >= 1_000) return `$${Number((n / 1_000).toFixed(1))}K`;
  return `$${n}`;
}

const fullUsd = (n: number) => `$${n.toLocaleString("en-US")}`;

/** True when at least one approved ZecHub DAO proposal is mapped. */
export const isDaoFunded = (z: CommunityZcg) =>
  (z.zechubDao?.proposals.length ?? 0) > 0;

/**
 * The funding badges in display order. ZCG and ZecHub DAO funding are
 * independent channels, so a community with both shows both: the DAO badge
 * never disappears because the ledger also has a grant.
 */
export function fundingBadges(z: CommunityZcg): FundingBadge[] {
  const badges: FundingBadge[] = [];
  if (z.funded) badges.push("zcg");
  if (isDaoFunded(z)) badges.push("dao");
  return badges.length ? badges : ["none"];
}

/** The funding filter: each channel on its own; "none" = neither. */
export function matchesFunding(z: CommunityZcg, filter: FundingFilter) {
  if (filter === "zcg") return z.funded;
  if (filter === "dao") return isDaoFunded(z);
  if (filter === "none") return !z.funded && !isDaoFunded(z);
  return true;
}

/** Quiet second line under the badge: when the ledger last paid them. */
export function paidLine(
  z: CommunityZcg,
  source: FundingSource,
): string | null {
  if (!z.funded || !z.recipient) return null;
  if (z.lastPaid) return `paid ${ledgerDateLabel(z.lastPaid)}`;
  // Only the live ledger can say a grant is unpaid; the fallback cannot.
  return source === "ledger" && z.budgetedUsd !== undefined
    ? "not yet paid"
    : null;
}

/** Tooltip of the quiet ZCG line: what its date (or its absence) means. */
export function paidLineTitle(z: CommunityZcg): string {
  return z.lastPaid
    ? "Latest settled payment in the ZCG ledger"
    : "No settled payment yet in the ZCG ledger";
}

/** Full ledger detail for the ZCG badge's tooltip. */
export function fundingTitle(
  z: CommunityZcg,
  source: FundingSource,
  fallbackAsOf: string,
): string | undefined {
  const where =
    source === "ledger"
      ? "in the ZCG ledger"
      : `in the ZCG ledger as of ${ledgerDateLabel(fallbackAsOf)}`;
  const ledger =
    z.recipient && z.budgetedUsd !== undefined
      ? `${z.recipient} ${where}: ${compactUsd(z.budgetedUsd)} budgeted` +
        (z.paidUsd ? `, ${compactUsd(z.paidUsd)} paid` : "") +
        (z.grants !== undefined
          ? ` across ${z.grants} grant${z.grants === 1 ? "" : "s"}`
          : "") +
        (z.lastPaid ? `; last paid ${z.lastPaid}` : "; no payment yet")
      : z.recipient;
  return [ledger, z.note].filter(Boolean).join(" · ") || undefined;
}

/** Tooltip of the "No funding" badge: what the absence means, then the note. */
export function noneTitle(z: CommunityZcg): string {
  return ["No ZCG ledger rows and no ZecHub DAO grant on record", z.note]
    .filter(Boolean)
    .join(" · ");
}

/** "$1.5K of $5.8K paid", "$8K outstanding", "$4.8K paid", or null. */
function payoutShort(g: DaoGrant): string | null {
  if (g.payout === "unlisted") return null;
  const paid = g.paidUsd ?? 0;
  const due = g.outstandingUsd ?? 0;
  if (paid > 0 && due > 0)
    return `${compactUsd(paid)} of ${compactUsd(paid + due)} paid`;
  if (due > 0) return `${compactUsd(due)} outstanding`;
  if (paid > 0) return `${compactUsd(paid)} paid`;
  return null;
}

export interface DaoLine {
  /** The latest grant, linked to its DAO DAO proposal; the line's tooltip
   *  (daoTitle) lists every earlier grant. */
  ref: string;
  url: string;
  /** Its payout state on the sheet, or its period when the sheet has none. */
  text: string;
  /** "as of 21 Sep 2026" when the figures are the curated fallback. */
  asOf: string | null;
}

/** Quiet line under the DAO badge: the latest grant and its payout state. */
export function daoLine(z: CommunityZcg): DaoLine | null {
  const grants = daoGrants(z);
  const latest = grants.at(-1);
  if (!latest) return null;
  const short = payoutShort(latest);
  return {
    ref: latest.ref,
    url: latest.url,
    text: short ?? latest.period,
    asOf:
      short && latest.payout === "fallback" && latest.sheetAsOf
        ? `as of ${ledgerDateLabel(latest.sheetAsOf)}`
        : null,
  };
}

/** "$1,500 paid, $4,300 outstanding" in full, for the tooltip. */
function payoutFull(g: DaoGrant): string | null {
  if (g.payout === "unlisted") return null;
  const parts = [
    g.paidUsd !== undefined ? `${fullUsd(g.paidUsd)} paid` : null,
    g.outstandingUsd ? `${fullUsd(g.outstandingUsd)} outstanding` : null,
  ].filter(Boolean);
  if (!parts.length) return null;
  const dated =
    g.payout === "fallback" && g.sheetAsOf
      ? ` (treasury sheet as of ${ledgerDateLabel(g.sheetAsOf)})`
      : "";
  return parts.join(", ") + dated;
}

/** Every DAO grant for the DAO badge's tooltip, one per line, then the note. */
export function daoTitle(z: CommunityZcg): string | undefined {
  const grants = daoGrants(z);
  if (!grants.length) return undefined;
  const live = grants.find((g) => g.payout === "sheet" && g.sheetAsOf);
  const head = live
    ? `ZecHub DAO grants (treasury sheet of ${ledgerDateLabel(live.sheetAsOf!)}):`
    : "ZecHub DAO grants:";
  const lines = grants.map((g) =>
    [g.ref, g.period, g.requested, payoutFull(g), g.note]
      .filter(Boolean)
      .join(" · "),
  );
  return [head, ...lines, z.zechubDao?.note].filter(Boolean).join("\n");
}

/** The directory total's second line, naming where the figures come from. */
export function fundingSummary(
  totalBudgetedUsd: number,
  source: FundingSource,
  fallbackAsOf: string,
): string {
  const total = `${compactUsd(totalBudgetedUsd)} budgeted`;
  return source === "ledger"
    ? `${total}, per the audited ledger`
    : `${total}, ledger as of ${ledgerDateLabel(fallbackAsOf)}`;
}
