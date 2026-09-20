/** What the committee's discretionary budget actually paid for, from the
 *  discretionary tab of the ledger. Pure aggregation, unit-testable. */

export type DiscretionaryRow = {
  disbursementType: string | null;
  amountUsdCents: bigint | null;
  isPaid: boolean | null;
};

export type DiscretionaryLine = { type: string; label: string; usd: number; rows: number };

const LABELS: Record<string, string> = {
  security_bounty: "security bounties",
  bounty_match: "bounty matches",
  tool_credit_service: "tooling & services",
  reimbursement: "reimbursements",
  sponsorship: "sponsorships",
};

/** Largest first; unknown types keep their raw key, humanised. */
export function summarizeDiscretionary(rows: DiscretionaryRow[]): DiscretionaryLine[] {
  const by = new Map<string, DiscretionaryLine>();
  for (const r of rows) {
    if (r.isPaid === false) continue;
    const type = r.disbursementType || "other";
    const line = by.get(type) ?? {
      type,
      label: LABELS[type] ?? type.replace(/_/g, " "),
      usd: 0,
      rows: 0,
    };
    line.usd += r.amountUsdCents != null ? Number(r.amountUsdCents) : 0;
    line.rows += 1;
    by.set(type, line);
  }
  return [...by.values()].sort((a, b) => b.usd - a.usd);
}

/** The bounty share of the discretionary budget: bounties plus matches. */
export function bountyUsd(lines: DiscretionaryLine[]): number {
  return lines
    .filter((l) => l.type === "security_bounty" || l.type === "bounty_match")
    .reduce((s, l) => s + l.usd, 0);
}
