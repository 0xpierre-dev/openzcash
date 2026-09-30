/**
 * ZecHub DAO funding per community: the curated proposal refs in data.ts
 * joined to the ZecHub treasury sheet the site already imports every 6 h
 * (zechub_payouts, the same rows /zechub and /api/zechub/treasury show).
 *
 * The join is the exact sheet row title curated per proposal
 * (dao-proposals.ts), compared after folding case, accents, dash variants
 * and spacing — never fuzzy, so a grant is never credited with another
 * grant's payments. When the mirror is unavailable, or no longer lists a
 * row, the curated copy of the sheet stands in and is always dated.
 *
 * Pure and synchronous so it is unit-tested without a database; funding.ts
 * reads the rows and handles an unreachable mirror.
 */

import type { Community, CommunityZcg } from "./data";
import {
  DAO_SHEET_FALLBACK_AS_OF,
  ZECHUB_DAO_PROPOSALS,
  daoProposalUrl,
  type DaoGrant,
  type ZechubDaoProposal,
} from "./dao-proposals";

/** The slice of an imported treasury-sheet payout row this needs. */
export interface DaoPayoutRow {
  title: string;
  paidUsdCents: bigint | null;
  pendingUsdCents: bigint | null;
  m1: string | null;
  m2: string | null;
  m3: string | null;
  /** "Last Updated" date of the sheet the row was imported from. */
  capturedOn: string | null;
}

/** "sheet": payouts read from the mirror now; "fallback": the dated copy. */
export type DaoSource = "sheet" | "fallback";

export interface DaoFundingMeta {
  source: DaoSource;
  /** Sheet date behind the figures (the mirror's, or the fallback's). */
  sheetAsOf: string;
}

/** Sheet-title join key: case, accents, dashes and spacing folded. */
export function sheetKey(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const toUsd = (cents: bigint | null) =>
  cents === null ? undefined : Number(cents) / 100;

/** Figure fields present only when known: an empty cell stays unknown. */
function figures(paidUsd?: number | null, outstandingUsd?: number | null) {
  return {
    ...(paidUsd != null ? { paidUsd } : {}),
    ...(outstandingUsd != null ? { outstandingUsd } : {}),
  };
}

function resolveOne(
  p: ZechubDaoProposal,
  sheet: ReadonlyMap<string, DaoPayoutRow> | null,
): DaoGrant {
  const base = { ...p, url: daoProposalUrl(p.ref) };
  if (!p.sheet) return { ...base, payout: "unlisted" };
  const row = sheet?.get(sheetKey(p.sheet.title));
  if (!row) {
    return {
      ...base,
      payout: "fallback",
      ...figures(p.sheet.paidUsd, p.sheet.outstandingUsd),
      sheetAsOf: DAO_SHEET_FALLBACK_AS_OF,
    };
  }
  const milestones = [row.m1, row.m2, row.m3].filter(
    (m): m is string => m !== null && m !== "",
  );
  return {
    ...base,
    payout: "sheet",
    ...figures(toUsd(row.paidUsdCents), toUsd(row.pendingUsdCents)),
    ...(milestones.length ? { milestones } : {}),
    ...(row.capturedOn ? { sheetAsOf: row.capturedOn } : {}),
  };
}

/**
 * The grants behind a community's proposal refs, in curated order. `sheet`
 * is the imported sheet keyed by sheetKey, or null when it is unavailable.
 * An unknown ref is skipped (the data test keeps the mapping complete).
 */
export function resolveDaoGrants(
  refs: readonly string[],
  sheet: ReadonlyMap<string, DaoPayoutRow> | null,
  catalog: Readonly<Record<string, ZechubDaoProposal>> = ZECHUB_DAO_PROPOSALS,
): DaoGrant[] {
  return refs.flatMap((ref) => {
    const p = catalog[ref];
    return p ? [resolveOne(p, sheet)] : [];
  });
}

/** A community's DAO grants: the request-time overlay, or the dated
 *  curated fallback when no overlay ran (e.g. Zarvis without a read). */
export function daoGrants(z: CommunityZcg): DaoGrant[] {
  const dao = z.zechubDao;
  if (!dao) return [];
  return dao.grants ?? resolveDaoGrants(dao.proposals, null);
}

/**
 * Overlay the imported sheet on the curated communities. An empty sheet is
 * treated as unavailable (a fresh or failed mirror), never as "nothing
 * paid", so the dated curated figures stand in.
 */
export function applyDaoFunding(
  communities: readonly Community[],
  payouts: readonly DaoPayoutRow[] | null,
): { communities: Community[]; dao: DaoFundingMeta } {
  const live = payouts && payouts.length > 0 ? payouts : null;
  const sheet = live ? new Map(live.map((r) => [sheetKey(r.title), r])) : null;
  const newest = live
    ?.map((r) => r.capturedOn ?? "")
    .reduce((a, b) => (b > a ? b : a), "");
  return {
    communities: communities.map((c) => {
      const dao = c.zcg.zechubDao;
      if (!dao) return c;
      return {
        ...c,
        zcg: {
          ...c.zcg,
          zechubDao: { ...dao, grants: resolveDaoGrants(dao.proposals, sheet) },
        },
      };
    }),
    dao: live
      ? { source: "sheet", sheetAsOf: newest || DAO_SHEET_FALLBACK_AS_OF }
      : { source: "fallback", sheetAsOf: DAO_SHEET_FALLBACK_AS_OF },
  };
}
