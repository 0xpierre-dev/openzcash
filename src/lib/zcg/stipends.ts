import { cached, LEDGER_TTL_MS } from "@/lib/cache/memo";
import { listDisbursements } from "./disbursements-repo";
import { summarizeStipends, type StipendSummary } from "./stipends-summary";

export type { MemberStipend, StipendSummary } from "./stipends-summary";

/** The committee's own compensation (monthly-payments tab), cached like the
 *  rest of the ledger. Shared by /zcg/stipends and /zcg/committee. */
export function getStipendSummary(): Promise<StipendSummary> {
  return cached("stipends:summary", LEDGER_TTL_MS, async () =>
    summarizeStipends(
      await listDisbursements({ sheet: "monthly", limit: 1000 }),
    ),
  );
}
