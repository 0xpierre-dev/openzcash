/**
 * ZCG funding per community, computed from the audited ledger instead of
 * hand-copied numbers.
 *
 * Input is the per-recipient ledger aggregate the /zcg/recipients page already
 * shows (`recipientTotals` in disbursements-repo), so both pages always agree:
 * ecosystem lines only (committee stipends and internal ops excluded),
 * budgeted USD of every recorded entry, USD paid of settled entries, distinct
 * grants, and the most recent settled payment. Matching is by the curated
 * `zcg.recipient` name in data.ts, never fuzzy: the same normalisation and
 * alias folding the ledger uses, nothing more.
 *
 * Pure and synchronous so it is unit-tested without a database; the server
 * wrapper (funding.ts) memoises the query and handles an unreachable ledger.
 */

import { normalizeKey } from "@/lib/zcg/normalize";
import { canonicalRecipient } from "@/lib/zcg/recipient-aliases";
import type { Community, CommunityZcg } from "./data";
import type { DaoFundingMeta } from "./dao-funding";

/** The slice of a ledger recipient total that community funding needs. */
export interface LedgerRecipientTotal {
  recipientName: string;
  /** Budgeted USD of every ecosystem entry (paid, open or cancelled). */
  externalUsdCents: bigint;
  /** Budgeted USD of settled ecosystem entries. */
  externalPaidUsdCents: bigint;
  /** Distinct grants (projects) on the grant sheets. */
  grantCount: number;
  externalPaymentCount: number;
  /** ISO date of the latest settled ecosystem payment. */
  externalLastPaid: string | null;
}

/** "ledger": figures read from the mirror now; "fallback": the curated
 *  figures in data.ts, used only while the ledger is unavailable. */
export type FundingSource = "ledger" | "fallback";

export interface CommunitiesFunding {
  communities: Community[];
  source: FundingSource;
  /** Where the ZecHub DAO payouts come from (funding.ts sets it); absent
   *  means no sheet read: the dated curated figures. */
  dao?: DaoFundingMeta;
}

interface Aggregate {
  budgetedCents: bigint;
  paidCents: bigint;
  grants: number;
  payments: number;
  lastPaid: string | null;
}

const recipientKey = (name: string) => normalizeKey(canonicalRecipient(name));

const later = (a: string | null, b: string | null) =>
  (a ?? "") >= (b ?? "") ? a : b;

/** Sum every ledger total per recipient key (aliases fold together). */
function aggregateByRecipient(
  totals: readonly LedgerRecipientTotal[],
): Map<string, Aggregate> {
  const byKey = new Map<string, Aggregate>();
  for (const t of totals) {
    const key = recipientKey(t.recipientName);
    const prev = byKey.get(key);
    byKey.set(key, {
      budgetedCents: (prev?.budgetedCents ?? 0n) + t.externalUsdCents,
      paidCents: (prev?.paidCents ?? 0n) + t.externalPaidUsdCents,
      grants: (prev?.grants ?? 0) + t.grantCount,
      payments: (prev?.payments ?? 0) + t.externalPaymentCount,
      lastPaid: later(prev?.lastPaid ?? null, t.externalLastPaid),
    });
  }
  return byKey;
}

const hasEcosystemRows = (a: Aggregate | undefined): a is Aggregate =>
  !!a && (a.budgetedCents !== 0n || a.grants > 0 || a.payments > 0);

const toUsd = (cents: bigint) => Number(cents) / 100;

/** The curated part of a community's funding (no figures). */
function curated(zcg: CommunityZcg): CommunityZcg {
  const { funded, recipient, zechubDao, note } = zcg;
  return {
    funded,
    ...(recipient !== undefined ? { recipient } : {}),
    ...(zechubDao !== undefined ? { zechubDao } : {}),
    ...(note !== undefined ? { note } : {}),
  };
}

function fundingFor(
  zcg: CommunityZcg,
  byKey: Map<string, Aggregate>,
): CommunityZcg {
  // No ledger recipient of its own (e.g. funded through an umbrella grant):
  // the curated status stands.
  if (!zcg.recipient) return zcg;
  const agg = byKey.get(recipientKey(zcg.recipient));
  if (!hasEcosystemRows(agg)) return { ...curated(zcg), funded: false };
  return {
    ...curated(zcg),
    funded: true,
    budgetedUsd: toUsd(agg.budgetedCents),
    paidUsd: toUsd(agg.paidCents),
    grants: agg.grants,
    ...(agg.lastPaid ? { lastPaid: agg.lastPaid } : {}),
  };
}

/**
 * Overlay live ledger funding on the curated communities. An empty ledger is
 * treated as unavailable (a fresh or failed mirror), never as "nobody is
 * funded", so the curated fallback figures are kept.
 */
export function applyLedgerFunding(
  communities: readonly Community[],
  totals: readonly LedgerRecipientTotal[],
): CommunitiesFunding {
  if (totals.length === 0)
    return { communities: [...communities], source: "fallback" };
  const byKey = aggregateByRecipient(totals);
  return {
    communities: communities.map((c) => ({
      ...c,
      zcg: fundingFor(c.zcg, byKey),
    })),
    source: "ledger",
  };
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-09-03" → "3 Sep 2026", string-only so server and browser agree
 *  whatever their timezone. Anything else is returned unchanged. */
export function ledgerDateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  if (!m || !month) return iso;
  return `${Number(m[3])} ${month} ${m[1]}`;
}
