import {
  COINHOLDER_ROUND,
  ROUND_BANDS,
  ROUND_PROPOSALS,
} from "@/lib/zcg/coinholder-round";
import { ROUNDS } from "@/lib/coinholder/rounds";
import { PROGRAM } from "@/lib/coinholder/program";
import { OUTCOME_LABEL } from "@/lib/coinholder/derive";

// Static curated dataset — safe to serve as a fully static route.
export const dynamic = "force-static";
// A live review round must not be cached for a year at the edge.
export const revalidate = 3600;

/**
 * Public, read-only mirror of the latest Coinholder-Directed Retroactive Grants
 * round: the 37 proposals as FPF announced them for review, and, once the vote
 * closed, each outcome and its tally in ZEC. Amounts in USD (dollars). The
 * human-readable page is /coinholders.
 */
export async function GET() {
  // The round this payload describes (dates and proposals come from
  // COINHOLDER_ROUND); its results apply only once ROUNDS records them.
  const described = ROUNDS.find(
    (r) => r.label === COINHOLDER_ROUND.label && r.status === "results",
  );
  const byIssue = new Map(described?.proposals.map((p) => [p.id, p]) ?? []);
  return Response.json({
    program: "coinholder",
    programName: PROGRAM.officialName,
    administrator: "Financial Privacy Foundation (runs submissions, review, KYC and reporting; coinholders decide)",
    page: "https://openzcash.org/coinholders",
    round: {
      label: COINHOLDER_ROUND.label,
      announcedOn: COINHOLDER_ROUND.announcedOn,
      reviewCloses: COINHOLDER_ROUND.reviewCloses,
      pollOpens: COINHOLDER_ROUND.pollOpens,
      proposalCount: COINHOLDER_ROUND.proposalCount,
      totalRequestedUsd: COINHOLDER_ROUND.totalRequestedUsdCents / 100,
      sourceThreadUrl: COINHOLDER_ROUND.sourceThreadUrl,
      githubRepoUrl: COINHOLDER_ROUND.githubRepoUrl,
      dataDocUrl: COINHOLDER_ROUND.dataDocUrl,
      ballotOptions: COINHOLDER_ROUND.ballotOptions,
      status: described ? "results" : "review",
      resultsUrl: described?.sources[0]?.href ?? null,
      talliesSource: described?.talliesSource?.href ?? null,
      turnout: described?.turnout ?? null,
      nextRound: PROGRAM.nextRound,
    },
    bands: ROUND_BANDS.map((b) => ({
      key: b.key,
      label: b.label,
      count: b.count,
      totalRequestedUsd: b.totalUsdCents / 100,
      sharePct: b.sharePct,
    })),
    proposals: ROUND_PROPOSALS.map((p) => ({
      rank: p.rank,
      project: p.project,
      org: p.org,
      requestedUsd: p.requestedUsdCents / 100,
      summary: p.summary,
      band: p.band,
      threadUrl: p.threadUrl,
      githubUrl: p.githubUrl,
      ...(() => {
        const result = byIssue.get(p.githubUrl.split("/").pop() ?? "");
        return result ? {
          outcome: OUTCOME_LABEL[result.outcome],
          tallyZec: result.tally,
          ...(result.dispute ? { disputedBy: result.dispute.by, disputeUrl: result.dispute.href } : {}),
        } : {};
      })(),
    })),
    notes:
      "Proposals curated from the FPF 30-day review announcement (round.sourceThreadUrl); outcomes from FPF's results post (round.resultsUrl); tallies in ZEC from the finalized vote-chain round (round.talliesSource). Amounts are requested, not approved or paid. For paid history use /api/zcg/data/*.",
  });
}
