import { reconcileCreditPurchases } from "@/lib/services/credit-purchases";
import { db } from "@/lib/db";

// One server-owned batch, including previously credited receipts. An operator
// can invoke it periodically; it never accepts payment evidence from the caller.
reconcileCreditPurchases().then(result => {
  console.log(JSON.stringify(result));
}).catch(() => {
  console.error("Credit reconciliation failed");
  process.exitCode = 1;
}).finally(() => db.$disconnect());
