export const dynamic = "force-dynamic";

/** Public, read-only API index. Everything this site renders is queryable. */
export async function GET() {
  return Response.json({
    name: "OpenZcash public API",
    readOnly: true,
    endpoints: {
      "/api/zcg/data/disbursements":
        "Disbursement ledger with sourceSheetGid, one-based sourceRow, sourceUrl and importedAt provenance. Filters: sheet, grant, category, type, search, limit. ?format=csv for CSV.",
      "/api/zcg/data/recipients":
        "Per-recipient budgets (`usd`) and settled entries (`usdPaid`, `zecPaid`). Default excludes internal costs; ?internal=1 includes them. ?format=csv for CSV.",
      "/api/zcg/data/grants":
        "Per-grant aggregation (milestones, paid, status). ?format=csv for CSV.",
      "/api/zcg/coinholder/round":
        "Open Coinholder-Directed Retroactive Grants review round: proposals, requested amounts, key dates, ballot options.",
    },
    notes:
      "Amounts are in USD (dollars) and ZEC. Budgeted USD includes unpaid entries; usdPaid is the budgeted value of settled entries, not current market value or proof of delivery. importedAt is collection time, not source publication time; sourceUrl opens a live row, not an immutable snapshot. See /zcg/methodology.",
  }, { headers: { "cache-control": "public, max-age=300" } });
}
