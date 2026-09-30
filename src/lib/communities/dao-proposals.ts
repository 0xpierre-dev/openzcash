/**
 * The ZecHub DAO proposals that funded communities in /communities.
 *
 * Curation rules:
 * - Only approved proposals (status "executed" on DAO DAO, Juno), each read
 *   from the public DAO DAO indexer and its on-chain text on
 *   DAO_PROPOSALS_VERIFIED_ON: title verbatim, creation date, the period and
 *   amount the proposal itself states. Rejected or closed proposals are never
 *   mapped (a community's `zechubDao.note` may name them), and neither is
 *   any pending application elsewhere.
 * - Paid and outstanding amounts are NOT curated as live data: they come
 *   from the ZecHub treasury sheet the site imports every 6 h
 *   (zechub_payouts), joined by `sheet.title`, the exact row title on the
 *   sheet (the curated join key, like `zcg.recipient` for the ZCG ledger).
 *   The `sheet` figures below are the dated fallback copied from the sheet
 *   "Last Updated" DAO_SHEET_FALLBACK_AS_OF, shown only (and always with that
 *   date) while the mirror is unreachable or no longer lists the row; never
 *   update them by hand to "refresh" the page.
 * - Older grants predate the current sheet: no `sheet`, so the page states
 *   the grant and its period and claims nothing about payment.
 */

/** The ZecHub DAO on DAO DAO (Juno); proposals live under /proposals/A…. */
export const ZECHUB_DAO_URL =
  "https://daodao.zone/dao/juno1nktrulhakwm0n3wlyajpwxyg54n39xx4y8hdaqlty7mymf85vweq7m6t0y";

/** Date of the DAO DAO indexer read behind ZECHUB_DAO_PROPOSALS. */
export const DAO_PROPOSALS_VERIFIED_ON = "2026-09-30";

/** "Last Updated" date of the treasury sheet the `sheet` fallback copies. */
export const DAO_SHEET_FALLBACK_AS_OF = "2026-09-21";

export interface ZechubDaoProposal {
  /** DAO DAO reference, e.g. "A178". */
  ref: string;
  /** On-chain title, verbatim. */
  title: string;
  /** ISO date the proposal was created (indexer). */
  created: string;
  /** Period the grant covers, as the proposal states it; a one-off grant
   *  whose text gives no date shows the month it was approved instead. */
  period: string;
  /** Amount as the proposal states it, in its own unit (USD or ZEC). */
  requested: string;
  /** The grant's row on the ZecHub treasury sheet, when the sheet lists it. */
  sheet?: {
    /** Exact row title: the join key for the imported figures. */
    title: string;
    /** Dated fallback (DAO_SHEET_FALLBACK_AS_OF); null = empty cell. */
    paidUsd: number | null;
    outstandingUsd: number | null;
  };
  /** Neutral nuance, e.g. where the sheet and the proposal text differ. */
  note?: string;
}

/** Where a grant's paid/outstanding figures come from. */
export type DaoPayoutSource = "sheet" | "fallback" | "unlisted";

/** A proposal resolved for display: its link and payout state. */
export interface DaoGrant extends ZechubDaoProposal {
  url: string;
  /** "sheet": read from the imported sheet now; "fallback": the curated
   *  copy dated `sheetAsOf`; "unlisted": not on the sheet, payment unknown. */
  payout: DaoPayoutSource;
  paidUsd?: number;
  outstandingUsd?: number;
  milestones?: string[];
  /** Date of the sheet the figures come from. */
  sheetAsOf?: string;
}

export const daoProposalUrl = (ref: string) =>
  `${ZECHUB_DAO_URL}/proposals/${ref}`;

const PROPOSALS: ZechubDaoProposal[] = [
  {
    ref: "A44",
    title: "Zcash Nigeria: Privacy Empowerment on Campus",
    created: "2024-08-31",
    period: "Approved Sep 2024",
    requested: "$1,240 in ZEC",
    note: "One campus event at Moshood Abiola Polytechnic; the proposal gives no event date.",
  },
  {
    ref: "A45",
    title: "Marketing <> Zcash Brazil",
    created: "2024-09-05",
    period: "Sep–Oct 2024",
    requested: "$1,200",
  },
  {
    ref: "A48",
    title: "Zcash Turkish Ambassador",
    created: "2024-10-24",
    period: "Nov 2024",
    requested: "24 ZEC",
    note: "One month of work, approved 30 Oct 2024; A50, filed 30 Nov, reports it complete.",
  },
  {
    ref: "A50",
    title: "Zcash Turkish Ambassador / 2",
    created: "2024-11-30",
    period: "Dec 2024",
    requested: "14 ZEC",
    note: "One more month of work, approved 8 Dec 2024.",
  },
  {
    ref: "A60",
    title: "Zcash Korea Ambassador Proposal",
    created: "2025-02-07",
    period: "Feb–Apr 2025",
    requested: "$1,200",
  },
  {
    ref: "A72",
    title: "ZcashArabia (Ambassador Program)",
    created: "2025-03-23",
    period: "Two months, 2025",
    requested: "50 ZEC",
  },
  {
    ref: "A84",
    title: "Zcash Korea Ambassador Proposal (May to July)",
    created: "2025-04-18",
    period: "May–Jul 2025",
    requested: "$1,200",
  },
  {
    ref: "A90",
    title: "Zcash Ukraine Regional Community Initiative by Beyond",
    created: "2025-05-27",
    period: "Jun–Aug 2025",
    requested: "30–36 ZEC",
  },
  {
    ref: "A94",
    title: "ZcashAraba (June to August)",
    created: "2025-06-14",
    period: "Jun–Aug 2025",
    requested: "$2,850",
  },
  {
    ref: "A97",
    title:
      "Proposal: Zcash Ukraine Regional Community Initiative (September–November 2025)",
    created: "2025-07-24",
    period: "Sep–Nov 2025",
    requested: "65 ZEC",
  },
  {
    ref: "A105",
    title: "Zcash Ghana Community (October 2025 – December 2025)",
    created: "2025-09-09",
    period: "Oct–Dec 2025",
    requested: "$4,500",
  },
  {
    ref: "A106",
    title: "Zcash Korea Ambassador Proposal (September to December)",
    created: "2025-09-13",
    period: "Sep–Dec 2025",
    requested: "$2,000",
  },
  {
    ref: "A113",
    title: "Zcash Global Ambassador",
    created: "2025-10-19",
    period: "Nov 2025 – Jan 2026",
    requested: "$3,000",
    sheet: {
      title: "Zcash Global Ambassador Elzz - $3000 (Nov-Jan)",
      paidUsd: 1000,
      outstandingUsd: null,
    },
    note: "The treasury sheet records $1,000 paid and leaves the outstanding amount blank, with all milestones marked complete.",
  },
  {
    ref: "A128",
    title: "Retroactive Grant Proposal",
    created: "2026-01-06",
    period: "Dec 2025",
    requested: "1 ZEC, retroactive",
  },
  {
    ref: "A132",
    title: "Zcash Global Ambassador Elzz (February - April 2026)",
    created: "2026-02-02",
    period: "Feb–Apr 2026",
    requested: "$3,000",
    sheet: {
      title: "Zcash Global Ambassador Elzz - $3000 (Feb-Apr)",
      paidUsd: 3000,
      outstandingUsd: 0,
    },
  },
  {
    ref: "A140",
    title: "Zcash India (March to May 2026)",
    created: "2026-03-11",
    period: "Mar–May 2026",
    requested: "$2,500",
    sheet: {
      title: "Zcash India - $3750 (Mar-May)",
      paidUsd: 3750,
      outstandingUsd: 0,
    },
    note: "The proposal text budgets $2,500 for two months; the treasury sheet lists $3,750 for March–May.",
  },
  {
    ref: "A146",
    title: "Zcash Global Ambassador Elzz (May - December 2026)",
    created: "2026-05-04",
    period: "May–Dec 2026",
    requested: "$1,000 a month",
    sheet: {
      title: "Zcash Global Ambassador Elzz (May - December 2026)",
      paidUsd: 4000,
      outstandingUsd: 4000,
    },
  },
  {
    ref: "A147",
    title:
      "Zcash East Africa Community Presence at Kenya Blockchain and Cryptocurrency Conference(KBCC) 2026",
    created: "2026-05-09",
    period: "May 2026, KBCC Nairobi (event)",
    requested: "$1,000",
    sheet: {
      title: "Zcash East Africa at (KBCC) 2026 - $1000",
      paidUsd: 1000,
      outstandingUsd: 0,
    },
  },
  {
    ref: "A151",
    title: "Zcash India — Proposal | June to August 2026",
    created: "2026-05-25",
    period: "Jun–Aug 2026",
    requested: "$4,800",
    sheet: {
      title: "Zcash India June-August 2026 - $4800",
      paidUsd: 4800,
      outstandingUsd: 0,
    },
  },
  {
    ref: "A153",
    title: "Zcash East Africa (June -July 2026)",
    created: "2026-05-29",
    period: "Jun–Jul 2026",
    requested: "$2,960",
    sheet: {
      title: "Zcash East Africa June - July 2026 - $2960",
      paidUsd: 2960,
      outstandingUsd: 0,
    },
  },
  {
    ref: "A154",
    title: "[Proposal] Zcash Korean Global Ambassador - Q3 2026 Expansion",
    created: "2026-05-29",
    period: "Jun–Aug 2026",
    requested: "$3,000",
    sheet: {
      title: "Zcash Korean Global Ambassador - Q3 Jun-Aug 2026 - $3000",
      paidUsd: 3000,
      outstandingUsd: 0,
    },
  },
  {
    ref: "A172",
    title:
      "Zcash East Africa Operations: From Awareness to Adoption ( August – October 2026)",
    created: "2026-08-07",
    period: "Aug–Oct 2026",
    requested: "$5,000",
    sheet: {
      title: "Zcash East Africa August – October 2026 - $5000",
      paidUsd: null,
      outstandingUsd: 5000,
    },
  },
  {
    ref: "A175",
    title: "Zcash India — Proposal | September to December 2026",
    created: "2026-08-27",
    period: "Sep–Dec 2026",
    requested: "$8,000",
    sheet: {
      title: "Zcash India September-December 2026 - $8000",
      paidUsd: null,
      outstandingUsd: 8000,
    },
  },
  {
    ref: "A176",
    title:
      "[Proposal] Zcash Korean Global Ambassador - Q4 2026 Expansion (Sept – Dec 2026)",
    created: "2026-09-09",
    period: "Sep–Dec 2026",
    requested: "$4,000",
    sheet: {
      title: "Zcash Korea September – December 2026 - $4000",
      paidUsd: null,
      outstandingUsd: 4000,
    },
  },
  {
    ref: "A178",
    title: "Club Zcash Querétaro - Zcash México (October-November 2026)",
    created: "2026-09-12",
    period: "Oct–Nov 2026",
    requested: "$5,800",
    sheet: {
      title:
        "Club Zcash Querétaro - Zcash México (October-November 2026) - $5800",
      paidUsd: 1500,
      outstandingUsd: 4300,
    },
  },
];

/** Every mapped proposal, by reference. */
export const ZECHUB_DAO_PROPOSALS: Readonly<Record<string, ZechubDaoProposal>> =
  Object.fromEntries(PROPOSALS.map((p) => [p.ref, p]));
