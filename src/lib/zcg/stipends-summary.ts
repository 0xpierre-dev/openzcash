/** Pure aggregation of the committee's monthly stipends. No server imports,
 *  so it is unit-tested directly; `stipends.ts` feeds it from the ledger. */

/** One committee member's stipend history, summed from the monthly tab. */
export type MemberStipend = {
  member: string;
  totalUsd: number;
  payments: number;
  firstPaid: string;
  lastPaid: string;
};

export type StipendSummary = {
  members: MemberStipend[];
  totalUsd: number;
  totalPayments: number;
};

export type StipendRow = {
  recipientNameRaw: string | null;
  amountUsdCents: bigint | null;
  paidOutDate: string | null;
};

/** One line per member, largest total first. */
export function summarizeStipends(rows: StipendRow[]): StipendSummary {
  const byMember = new Map<string, MemberStipend>();
  for (const d of rows) {
    const member = d.recipientNameRaw || "Unknown";
    const usd = d.amountUsdCents != null ? Number(d.amountUsdCents) : 0;
    const date = d.paidOutDate ?? "";
    const cur = byMember.get(member);
    if (!cur) {
      byMember.set(member, {
        member,
        totalUsd: usd,
        payments: 1,
        firstPaid: date,
        lastPaid: date,
      });
      continue;
    }
    byMember.set(member, {
      ...cur,
      totalUsd: cur.totalUsd + usd,
      payments: cur.payments + 1,
      firstPaid:
        date && (!cur.firstPaid || date < cur.firstPaid) ? date : cur.firstPaid,
      lastPaid: date && date > cur.lastPaid ? date : cur.lastPaid,
    });
  }
  const members = [...byMember.values()].sort(
    (a, b) => b.totalUsd - a.totalUsd,
  );
  return {
    members,
    totalUsd: members.reduce((s, m) => s + m.totalUsd, 0),
    totalPayments: members.reduce((s, m) => s + m.payments, 0),
  };
}
