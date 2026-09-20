import { cached, LEDGER_TTL_MS } from "@/lib/cache/memo";
import { listDisbursements } from "./disbursements-repo";
import { summarizeDiscretionary, type DiscretionaryLine } from "./discretionary-summary";

export type { DiscretionaryLine } from "./discretionary-summary";
export { bountyUsd } from "./discretionary-summary";

/** The discretionary tab summed by payment type, cached like the ledger. */
export function getDiscretionaryLines(): Promise<DiscretionaryLine[]> {
  return cached("discretionary:lines", LEDGER_TTL_MS, async () =>
    summarizeDiscretionary(
      await listDisbursements({ sheet: "discretionary", limit: 1000 }),
    ),
  );
}
