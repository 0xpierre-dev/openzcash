/**
 * Human labels for the status vocabularies of the ZCG records, in one place,
 * so a verdict or a grant status reads the same in the funnel, the changelog,
 * the tables, the detail pages and the administrator forms.
 *
 * The raw values are the spreadsheet's own words normalised by the importers
 * (`normStatus`): lowercase, underscores. Anything unknown falls back to the
 * raw value with underscores replaced, never to an empty string.
 */

/** Grant-level status recorded on each ledger row of a grant. */
export const GRANT_STATUS_LABEL: Record<string, string> = {
  open: "Open",
  completed: "Completed",
  cancelled: "Cancelled",
  keyholder_veto: "Keyholder veto",
  funds_returned: "Funds returned",
};

export function grantStatusLabel(
  status: string | null | undefined,
  fallback = "Unknown",
): string {
  if (!status) return fallback;
  return GRANT_STATUS_LABEL[status] ?? status.replace(/_/g, " ");
}

/** Verdict of a ZCG proposal, as published (D-1) on /zcg/proposals. */
export const PROPOSAL_STATUS_LABEL: Record<string, string> = {
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  cancelled: "Cancelled",
  filtered: "Filtered",
  under_review: "Under review",
  pending: "Pending",
  vetoed: "Vetoed",
};

export function proposalStatusLabel(
  status: string | null | undefined,
  fallback = "·",
): string {
  if (!status) return fallback;
  return PROPOSAL_STATUS_LABEL[status] ?? status.replace(/_/g, " ");
}

/**
 * The Coinholder (FPF) programme describes the same verdicts in its own
 * words: a filtered application was "not considered" by the coinholder vote,
 * and "pending" means the vote has not happened yet.
 */
export const COINHOLDER_VERDICT_LABEL: Record<string, string> = {
  ...PROPOSAL_STATUS_LABEL,
  filtered: "Not considered",
  pending: "Pending vote",
  vetoed: "Keyholder veto",
};
