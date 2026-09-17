import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { zcgDisbursements } from "@/lib/db/schema";
import { scheduledPayments } from "./scheduled-payments";
export async function getPaymentSchedule(
  filters: { from?: string; to?: string; category?: string } = {},
) {
  const rows = await getDb()
    .select()
    .from(zcgDisbursements)
    .where(
      inArray(zcgDisbursements.sourceSheet, [
        "grants_disbursed",
        "coinholder_grants",
      ]),
    );
  // Same civil timezone as proposal publication and the committee's reporting.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return scheduledPayments(rows, today, filters);
}
