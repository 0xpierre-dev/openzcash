import { ZCG_GIDS, ZCG_SHEET_ID } from "../../lib/zcg/sheets";

export type FactTone = "current" | "past" | "identity";

export interface PublicFact {
  label: string;
  source: string;
  sourceLabel: string;
  tone: FactTone;
}

export interface LedgerFact {
  label: string;
  href?: string;
  source: string;
  sourceLabel: string;
  tone: "open" | "history";
}

export interface Member {
  name: string;
  img: string;
  url: string;
  cohort: "june-2026" | "dec-2025";
  term: string;
  facts: PublicFact[];
  ledger: {
    recipient: string;
    relation: "direct" | "organization";
    relationLabel?: string;
  };
  ledgerFacts?: LedgerFact[];
}

/** Month the current composition took office (June 2026 election results). */
export const SEATED_FROM = "July 2026";

export type Cohort = Member["cohort"];

/** The two half-yearly cohorts that make up the committee. Term ends come
 *  from each member's public record (`term`); the election that filled the
 *  seats is listed on the committee page's election history. */
export const COHORTS: Record<
  Cohort,
  { label: string; elected: string; termEnds: string }
> = {
  "dec-2025": {
    label: "December 2025 cohort",
    elected: "December 2025 election",
    termEnds: "December 2026",
  },
  "june-2026": {
    label: "June 2026 cohort",
    elected: "June 2026 election",
    termEnds: "June 2027",
  },
};

export const OFFICIAL_LEDGER_URL = `https://docs.google.com/spreadsheets/d/${ZCG_SHEET_ID}/edit`;
const ledgerRangeUrl = (gid: string, range: string) =>
  `${OFFICIAL_LEDGER_URL}#gid=${gid}&range=${range}`;
const grantRecordUrl = (grant: string) =>
  `/zcg/grant?g=${encodeURIComponent(grant)}`;

export const MEMBERS: Member[] = [
  {
    name: "GGuy",
    img: "/committee/gguy.png",
    url: "https://forum.zcashcommunity.com/u/gguy",
    cohort: "june-2026",
    term: "to Jun 2027",
    facts: [
      {
        label: "ZCG · re-elected Jun 2026",
        source: "https://zfnd.org/zcg-election-results-june-2026/",
        sourceLabel: "June 2026 election result",
        tone: "current",
      },
      {
        label: "ZCG · fourth term",
        source:
          "https://forum.zcashcommunity.com/t/gguy-for-zcg-june-2026/56086",
        sourceLabel: "June 2026 nomination",
        tone: "current",
      },
      {
        label: "ZCG · since Jul 2023",
        source: "https://zfnd.org/results-of-the-zcg-election-june-2023/",
        sourceLabel: "June 2023 election result, published July 1, 2023",
        tone: "current",
      },
    ],
    ledger: { recipient: "GGuy", relation: "direct" },
  },
  {
    name: "Paul Brigner",
    img: "/committee/paulbrigner.png",
    url: "https://forum.zcashcommunity.com/u/paulbrigner",
    cohort: "june-2026",
    term: "to Jun 2027",
    facts: [
      {
        label: "ZODL · policy officer",
        source:
          "https://forum.zcashcommunity.com/t/paul-brigner-for-zcg-june-2026/55738",
        sourceLabel: "June 2026 nomination",
        tone: "current",
      },
      {
        label: "PGP · founder",
        source:
          "https://forum.zcashcommunity.com/t/paul-brigner-for-zcg-june-2026/55738",
        sourceLabel: "June 2026 nomination",
        tone: "current",
      },
    ],
    ledger: {
      recipient: "PGP for Crypto, LLC",
      relation: "organization",
      relationLabel: "PGP for Crypto",
    },
  },
  {
    name: "hanh",
    img: "/committee/hanh.png",
    url: "https://forum.zcashcommunity.com/u/hanh",
    cohort: "dec-2025",
    term: "to Dec 2026",
    facts: [
      {
        label: "YWallet · creator (legacy)",
        source: "https://github.com/hhanh00/zwallet",
        sourceLabel: "YWallet repository and deprecation notice",
        tone: "past",
      },
      {
        label: "Zkool · creator (current)",
        source: "https://github.com/hhanh00/zkool2",
        sourceLabel: "Zkool repository",
        tone: "current",
      },
      {
        label: "Coin Voting · builder",
        source:
          "https://forum.zcashcommunity.com/t/hanh-for-zcg-december-2025/53373",
        sourceLabel: "December 2025 nomination",
        tone: "identity",
      },
    ],
    ledger: { recipient: "Hanh", relation: "direct" },
    ledgerFacts: [
      {
        label: "zaino · completed Aug 2026",
        href: grantRecordUrl("zaino - Stability, Performance & Testing"),
        source: ledgerRangeUrl(ZCG_GIDS.grantsDisbursed, "A817:L817"),
        sourceLabel: "Official ZCG grants ledger",
        tone: "history",
      },
      {
        label: "Coin Voting · open grant",
        href: grantRecordUrl("Maintenance and Improvements to Coin Voting"),
        source: ledgerRangeUrl(ZCG_GIDS.grantsDisbursed, "A587:L599"),
        sourceLabel: "Official ZCG grants ledger",
        tone: "open",
      },
    ],
  },
  {
    name: "Zerodartz",
    img: "/committee/zerodartz.png",
    url: "https://forum.zcashcommunity.com/u/zerodartz",
    cohort: "dec-2025",
    term: "to Dec 2026",
    facts: [
      {
        label: "ZCG · re-elected Dec 2025",
        source:
          "https://forum.zcashcommunity.com/t/zcap-siv-poll-zcg-elections-open-now/53685/20",
        sourceLabel: "December 2025 election result",
        tone: "current",
      },
      {
        label: "ZecHub DAO · member",
        source: "https://zechub.wiki/dao",
        sourceLabel: "ZecHub DAO member registry",
        tone: "current",
      },
    ],
    ledger: { recipient: "Zerodartz", relation: "direct" },
  },
  {
    name: "Artkor",
    img: "/committee/artkor.png",
    url: "https://forum.zcashcommunity.com/u/artkor",
    cohort: "dec-2025",
    term: "to Dec 2026",
    facts: [
      {
        label: "RUZcash · public alias",
        source:
          "https://forum.zcashcommunity.com/t/artkor-aka-ruzcash-for-zcg-december-2025/53449",
        sourceLabel: "December 2025 nomination",
        tone: "identity",
      },
    ],
    ledger: { recipient: "Artkor", relation: "direct" },
  },
];

/** Members grouped by cohort, in seating order. */
export function membersByCohort(): { cohort: Cohort; members: Member[] }[] {
  return (Object.keys(COHORTS) as Cohort[]).map((cohort) => ({
    cohort,
    members: MEMBERS.filter((m) => m.cohort === cohort),
  }));
}

const TONE_ORDER: FactTone[] = ["current", "identity", "past"];

/**
 * The 3D office reads the same public record as the committee cards: each
 * seat's caption is the member's leading source-linked fact (current role
 * first, then identity, then history). A committee change is one edit, here.
 */
export function officeMembers(): {
  name: string;
  img: string;
  tags: string[];
}[] {
  return MEMBERS.map((m) => ({
    name: m.name,
    img: m.img,
    tags: [...m.facts]
      .sort((a, b) => TONE_ORDER.indexOf(a.tone) - TONE_ORDER.indexOf(b.tone))
      .map((f) => f.label),
  }));
}
