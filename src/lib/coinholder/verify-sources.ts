/**
 * Where each round's tallies can be checked from. The Q3 2026 round ran on the
 * Valar Group shielded vote chain, whose finalized summary anyone can fetch;
 * the earlier rounds ran on Coin Voting (zecvote.zone), recounted with the
 * election seeds their organisers published. Sources are the posts that
 * published each seed and the tools they named.
 */
import { SITE_URL } from "@/lib/seo/page-metadata";
import type { Link } from "./types";

/** Servers of the vote chain's summary, in the order the site asks them. Their bodies are byte-identical. */
export const VOTE_CHAIN_HOSTS = [
  {
    id: "valar",
    name: "Valar Group",
    origin: "https://prod.vote-chain-primary.valargroup.org",
  },
  {
    id: "zf",
    name: "Zcash Foundation mirror",
    origin: "https://zvote.zfnd.org",
  },
] as const;

export type VoteChainHost = (typeof VOTE_CHAIN_HOSTS)[number];

/** The finalized vote-chain round behind each program round that used the chain. */
export const VOTE_CHAIN_ROUNDS: Readonly<Record<string, string>> = {
  "q3-2026": "2cba66eb16c7581a1692cb0b033785da0131059f645a0d2fb4dc2a5131505e01",
};

export const voteSummaryUrl = (origin: string, chainRoundId: string) =>
  `${origin}/shielded-vote/v1/vote-summary/${chainRoundId}`;

/** The standard-library Python recount, served from public/. */
export const SCRIPT_PATH = "/verify/coinholder_verify.py";
export const SCRIPT_NAME = "coinholder_verify.py";

/** Our export of a round, for the downloads row and the script's --compare. */
export const verifyApiPath = (roundId: string, format: "json" | "csv") =>
  `/api/coinholders/verify?round=${roundId}&format=${format}`;

/** Options in ballot order on the vote chain: Accept, Reject, Reject at a lower amount, Abstain. */
const JQ_OPTIONS = "[.options[] | (.total_value // 0) / 8] as [$a, $r, $l, $x]";
const JQ_RULE = `if $t >= 420000 and $a > $r + $l then "Funded" else "Rejected" end`;

/**
 * The commands the page offers for a vote-chain round, in the order of its
 * steps. Each runs as printed (bash or zsh, curl, jq 1.5+, Python 3.8+); a
 * test runs them against the stored copy of the Q3 2026 summary.
 */
export function chainCommands(roundId: string) {
  const chainRoundId = VOTE_CHAIN_ROUNDS[roundId];
  if (!chainRoundId) return null;
  const mirror = voteSummaryUrl(VOTE_CHAIN_HOSTS[1].origin, chainRoundId);
  const file = `${roundId}.json`;
  return {
    file,
    fetch: `curl -s ${mirror} -o ${file}\nshasum -a 256 ${file}   # sha256sum on Linux`,
    convert: `jq -r '.proposals[] | [.id, (.options[] | (.total_value // 0) / 8)] | @csv' ${file}`,
    apply: [
      "jq -r '.proposals[]",
      `  | ${JQ_OPTIONS}`,
      "  | ($a + $r + $l + $x) as $t",
      `  | [.id, $t, $t >= 420000, ${JQ_RULE}]`,
      `  | @csv' ${file}`,
    ].join("\n"),
    oneLiner: `curl -s ${mirror} | jq -r '.proposals[] | ${JQ_OPTIONS} | ($a + $r + $l + $x) as $t | [.id, $a, $r, $l, $x, $t, ${JQ_RULE}] | @csv'`,
    /** The Python path: download the script, run it, then run it against this page's JSON. */
    python: {
      download: `curl -sO ${SITE_URL}${SCRIPT_PATH}`,
      run: `python3 ${SCRIPT_NAME} ${chainRoundId} > ${roundId}.csv`,
      compare: `python3 ${SCRIPT_NAME} ${chainRoundId} --compare '${SITE_URL}${verifyApiPath(roundId, "json")}'`,
    },
  };
}

/** What a recount step produces, for its expected-result chip: the tallies, or the outcomes once ZIP 1016 is applied. */
export type RecountResult = "tallies" | "outcomes";

/** How a Coin Voting round is recounted, step by step, and where its tallies come from (the verdict card's third check). */
export type Recount = {
  /** "Tallies from …" and the line under it. */
  source: { from: string; sub: string };
  system: string;
  steps: {
    title: string;
    /** One line shown while the step is folded. */
    gist: string;
    text: string;
    code?: string;
    links: Link[];
    result?: RecountResult;
  }[];
  links: Link[];
};

const FORUM = "https://forum.zcashcommunity.com/t/";
const AUDIT_TOOL: Link = {
  label: "Coin Voting audit tool",
  href: "https://github.com/hhanh00/zcash-vote-audit/releases",
};
const APPLY_STEP: Recount["steps"][number] = {
  title: "Apply ZIP 1016",
  gist: "set the recount beside ours",
  text: "Set the recount beside the table below, or download ours as CSV: the same rule gives every published outcome.",
  links: [],
  result: "outcomes",
};

/** Seeds were published per question for the audit tool (Q4 2025 and the ratification poll). */
const auditRecount = (
  post: Link,
  source: Recount["source"],
  questions: string,
): Recount => ({
  source,
  system:
    "Coin Voting 2.0 on zecvote.zone, one election per question. The published seed and URL let anyone recount the shielded ballots. The results post also records transparent votes, which must be included to reproduce the combined tally.",
  steps: [
    {
      title: "Get the audit tool",
      gist: "Coin Voting 2.0, from its GitHub releases",
      text: "Download Coin Voting 2.0's audit tool from its GitHub releases.",
      links: [AUDIT_TOOL],
    },
    {
      title: "Enter each question's seed and URL",
      gist: "one election per question",
      text: `${questions} The tool reads the shielded ballots of that election and prints their totals.`,
      links: [post],
    },
    {
      title: "Include transparent votes and reconcile units",
      gist: "shielded + transparent, for each option",
      text: "Convert the audit tool’s displayed units to ZEC, then add the transparent votes listed separately in the results post for each option. The published summary rounds to whole ZEC; separately rounded totals can differ slightly from the sum of its rounded options. Keep unrounded inputs when independently checking the threshold and majority.",
      links: [post],
      result: "tallies",
    },
    APPLY_STEP,
  ],
  links: [post, AUDIT_TOOL],
});

const Q1_RECOUNT: Link = {
  label: "Recount and seed (forum)",
  href:
    FORUM +
    "polling-closed-coinholder-directed-grants-program-q1-round/55048/17",
};
const Q1_COUNTER: Link = {
  label: "Counter (hhanh00/zcv)",
  href: "https://github.com/hhanh00/zcv",
};

export const RECOUNTS: Readonly<Record<string, Recount>> = {
  "q1-2026": {
    source: {
      from: "the Voting Authorities' recount",
      sub: "recounted with the published election seed",
    },
    system:
      "Coin Voting in the Zkool wallet at zecvote.zone: a single election covering all seven questions, with one seed. The Voting Authorities recounted it with the election creator's seed, which they published.",
    steps: [
      {
        title: "Build the counter",
        gist: "hhanh00/zcv, built with Rust",
        text: "The Voting Authorities recounted with the open-source counter they linked. It needs Rust; the counter is built with its tally feature.",
        code: "git clone https://github.com/hhanh00/zcv && cd zcv\ncargo build --release --bin counter --features tally",
        links: [Q1_COUNTER],
      },
      {
        title: "Run it with the election seed",
        gist: "one seed for the whole election",
        text: "The seed phrase is in dismad's post. One run reads every ballot of the election and writes each question's totals; the post lists the six that were counted.",
        code: './target/release/counter --seed "<seed phrase from the post>" --election-url "https://zecvote.zone" --output results.csv',
        links: [Q1_RECOUNT],
        result: "tallies",
      },
      APPLY_STEP,
    ],
    links: [Q1_RECOUNT, Q1_COUNTER],
  },
  "q4-2025": auditRecount(
    {
      label: "FPF results summary",
      href:
        FORUM +
        "coinholder-directed-retroactive-grants-program-results-nov-2025/53487",
    },
    { from: "FPF's results summary", sub: "with every election's seed" },
    "FPF's results summary lists a seed phrase and a zecvote.zone URL for each of the nine questions.",
  ),
  "ratification-2025": auditRecount(
    {
      label: "Poll results (forum)",
      href:
        FORUM +
        "polling-closed-coinholder-poll-to-ratify-the-retroactive-grants-program/52013/38",
    },
    { from: "the poll results post", sub: "with every election's seed" },
    "The poll results post lists a seed phrase and a zecvote.zone URL for each of the three questions.",
  ),
};
