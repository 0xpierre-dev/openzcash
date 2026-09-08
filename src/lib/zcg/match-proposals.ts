import { issueNumberFromLink } from "./issue-link";
import { titlesMatch } from "./match-titles";

type ProposalIdentity = {
  id: string;
  program: string;
  status: string;
  title: string;
  platformLink: string | null;
};

type ApplicationIdentity = { number: number; title: string };

/** Pair official issue identities first; only infer unique, undecided ZCG matches. */
export function matchProposalApplications(
  proposals: ProposalIdentity[],
  applications: ApplicationIdentity[],
): Map<string, number> {
  const matches = new Map<string, number>();
  const usedIssues = new Set<number>();
  for (const proposal of proposals) {
    if (proposal.program !== "zcg") continue;
    const issue = issueNumberFromLink(proposal.platformLink);
    if (issue == null || usedIssues.has(issue)) continue;
    if (applications.some((app) => app.number === issue)) {
      matches.set(proposal.id, issue);
      usedIssues.add(issue);
    }
  }

  const candidates = proposals.filter((proposal) =>
    proposal.program === "zcg" &&
    (proposal.status === "under_review" || proposal.status === "pending") &&
    issueNumberFromLink(proposal.platformLink) == null,
  );
  const unmatchedApps = applications.filter((app) => !usedIssues.has(app.number));
  for (const proposal of candidates) {
    const possible = unmatchedApps.filter((app) => titlesMatch(proposal.title, app.title));
    if (possible.length !== 1) continue;
    const app = possible[0];
    // Ambiguous titles remain separate records instead of guessing an identity.
    if (candidates.filter((p) => titlesMatch(p.title, app.title)).length !== 1) continue;
    matches.set(proposal.id, app.number);
  }
  return matches;
}
