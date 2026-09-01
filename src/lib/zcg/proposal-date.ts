import { issueNumberFromLink } from "./issue-link";

const FUTURE_TOLERANCE_MS = 86_400_000;

type ProposalWithSubmittedDate = {
  submittedDate?: string | null;
  platformLink?: string | null;
};

export type ProposalDateReconciliation<T> = {
  rows: T[];
  corrected: number;
};

type IssueCreatedAtFetcher = (issueNumber: number) => Promise<string | null>;

function isoDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * Reconciles impossible future submission dates with the creation timestamp of
 * the official GitHub issue linked by the spreadsheet. Normal sheet dates are
 * never overridden.
 */
export async function reconcileFutureProposalDates<
  T extends ProposalWithSubmittedDate,
>(
  rows: T[],
  fetchIssueCreatedAt: IssueCreatedAtFetcher,
  nowMs = Date.now(),
): Promise<ProposalDateReconciliation<T>> {
  let corrected = 0;
  const reconciled = await Promise.all(
    rows.map(async (row) => {
      const sheetDay = isoDay(row.submittedDate);
      if (!sheetDay) return row;

      const sheetTimestamp = Date.parse(sheetDay);
      if (sheetTimestamp <= nowMs + FUTURE_TOLERANCE_MS) return row;

      const issueNumber = issueNumberFromLink(row.platformLink);
      if (issueNumber == null) return row;

      const githubDay = isoDay(await fetchIssueCreatedAt(issueNumber));
      if (!githubDay) return row;

      const githubTimestamp = Date.parse(githubDay);
      if (
        githubTimestamp > nowMs + FUTURE_TOLERANCE_MS ||
        githubTimestamp >= sheetTimestamp
      ) {
        return row;
      }

      corrected += 1;
      return { ...row, submittedDate: githubDay };
    }),
  );

  return { rows: reconciled, corrected };
}
