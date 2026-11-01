/** Display-only annotations, checked against ZCG minutes on 2026-10-10.
 * Keep these separate from the immutable, already-anchored proposal snapshots.
 * A total grant budget is not an outstanding balance or evidence of payment.
 */
export type ZcgApprovedBudget = { usdCents: string; sourceUrl: string };

const forum = "https://forum.zcashcommunity.com/t";
const budgets: Readonly<Record<string, ZcgApprovedBudget>> = {
  "zcg-graphsense-2026-09-28": {
    usdCents: "800000",
    sourceUrl: `${forum}/zcash-community-grants-zcg-meeting-minutes-9-28-2026/57928/1`
  },
  "zcg-ironwood-2026-09-28": {
    usdCents: "800000",
    sourceUrl: `${forum}/zcash-community-grants-zcg-meeting-minutes-9-28-2026/57928/2`
  },
  "zcg-mumbai-2026-09-14": {
    usdCents: "2030000",
    sourceUrl: `${forum}/zcash-community-grants-meeting-minutes-9-14-2026/57615/1`
  },
  "zcg-arabia-2026-08-31": {
    usdCents: "2700000",
    sourceUrl: `${forum}/zcash-community-grants-meeting-minutes-8-31-2026/57394/2`
  }
};

export function zcgApprovedBudget(recordId: string): ZcgApprovedBudget | null {
  return Object.hasOwn(budgets, recordId) ? budgets[recordId] : null;
}
