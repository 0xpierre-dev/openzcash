import { grantStatusLabel } from "./status-labels";

/** Format USD cents consistently across server and browser ICU versions. */
export function formatUsdCents(
  cents: bigint | number | null | undefined,
  opts: { compact?: boolean } = {},
): string {
  if (cents == null) return "·";
  const n = Number(cents) / 100;
  if (opts.compact && Math.abs(n) >= 1000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(n);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
  }).format(n);
}

/** Row-level grant status in the ledger tables; same vocabulary as
 *  `status-labels.ts`, with "·" for an empty cell. */
export function disbStatusLabel(status: string | null): string {
  return grantStatusLabel(status, "·");
}

const TYPE_LABELS: Record<string, string> = {
  grant_milestone: "Grant",
  ic_payment: "Contractor",
  coinholder_grant: "Coinholder",
  monthly: "Monthly",
  security_bounty: "Security bounty",
  bounty_match: "Bounty match",
  sponsorship: "Sponsorship",
  tool_credit_service: "Tool/service credit",
  reimbursement: "Reimbursement",
  funds_returned: "Funds returned",
  discretionary: "Discretionary",
};

export function disbTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type.replace(/_/g, " ");
}
