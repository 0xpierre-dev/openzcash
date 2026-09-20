import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { zcgDisbursements } from "@/lib/db/schema";
import { cached, LEDGER_TTL_MS } from "@/lib/cache/memo";
import { scheduledPayments } from "./scheduled-payments";

/** Grant-sheet rows, cached like every other ledger read; filters are applied
 *  in memory, so one cache entry serves the overview, the grants list and the
 *  schedule page. */
function grantRows() {
  return cached("schedule:grant-rows", LEDGER_TTL_MS, () =>
    getDb()
      .select()
      .from(zcgDisbursements)
      .where(
        inArray(zcgDisbursements.sourceSheet, [
          "grants_disbursed",
          "coinholder_grants",
        ]),
      ),
  );
}

export async function getPaymentSchedule(
  filters: { from?: string; to?: string; category?: string } = {},
) {
  const rows = await grantRows();
  // Same civil timezone as proposal publication and the committee's reporting.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return scheduledPayments(rows, today, filters);
}
