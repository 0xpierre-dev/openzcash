import { FeatureLink, SourceNote } from "@/components/workspace";
import { getPaymentSchedule } from "@/lib/zcg/schedule-repo";
import { Card, PageHeader, Stat } from "@/components/ui";
import { grantsSummary, listGrants } from "@/lib/zcg/grants-repo";
import { formatUsdCents } from "@/lib/zcg/format";
import { GrantsTable, type GrantTableRow } from "./grants-table";
import { cached, LEDGER_TTL_MS } from "@/lib/cache/memo";
import { Synced } from "@/components/synced";

export const dynamic = "force-dynamic";
export const metadata = { title: "Grants ZCG · OpenZcash" };

const STATUS_LABELS: Record<string, string> = {
  completed: "Completed",
  cancelled: "Cancelled",
  open: "Open",
  keyholder_veto: "Veto",
  funds_returned: "Funds returned",
};

function statusLabel(status: string | null): string {
  if (!status) return "Unknown";
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export default async function GrantsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    category?: string;
    program?: string;
    q?: string;
  }>;
}) {
  const params = await searchParams;
  const [grants, summary, schedule] = await Promise.all([
    cached("grants:list", LEDGER_TTL_MS, () => listGrants()),
    cached("grants:summary", LEDGER_TTL_MS, () => grantsSummary()),
    getPaymentSchedule(),
  ]);

  const rows: GrantTableRow[] = grants.map((g) => ({
    grantKey: g.grantKey,
    grantee: g.grantee,
    category: g.category ?? "",
    status: g.status,
    statusText: statusLabel(g.status),
    program: g.program,
    milestoneCount: g.milestoneCount,
    paidCount: g.paidCount,
    milestonesText: `${g.paidCount}/${g.milestoneCount}`,
    _usd: Number(g.usdCents),
    _zec: Number(g.zecZat),
  }));

  return (
    <>
      <PageHeader
        title="Grants"
        subtitle="Follow every funded project, from approval to its final milestone."
      />

      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Grants"
          value={String(summary.grantCount)}
          sub="approved projects"
        />
        <Stat
          label="Committed"
          value={formatUsdCents(summary.committedCents, { compact: true })}
          sub="USD, excluding cancelled"
          tone="warn"
        />
        <Stat
          label="Paid"
          tone="in"
          value={formatUsdCents(summary.paidCents, { compact: true })}
          sub="milestones already paid"
        />
        <Stat
          label="Open"
          value={formatUsdCents(summary.futureCents, { compact: true })}
          sub="committed, still to pay"
        />
      </section>

      <FeatureLink
        eyebrow="Scheduled payments"
        title={formatUsdCents(schedule.totalCents)}
        description={`${schedule.rows.length} approved payments with a future estimated date. Explore the total by month, recipient and category.`}
        href="/zcg/schedule"
        label="View payment schedule"
      />

      <Card className="overflow-hidden p-0">
        <div className="ws-ledger">
          <GrantsTable
            key={JSON.stringify(params)}
            rows={rows}
            initialPicks={{
              ...(params.status
                ? { status: [statusLabel(params.status)] }
                : {}),
              ...(params.category ? { category: [params.category] } : {}),
              ...(params.program
                ? {
                    program: [
                      params.program === "coinholder" ? "Coinholder" : "ZCG",
                    ],
                  }
                : {}),
            }}
            initialQuery={params.q}
          />
        </div>
      </Card>

      <p className="mt-4 text-xs text-stone-600">
        {grants.length} grants · one project per row · click to view its
        milestones
      </p>

      <FeatureLink
        eyebrow="People behind the decisions"
        title="Meet the ZCG committee"
        description="Current members, public affiliations, disclosed roles and election records."
        href="/zcg/committee"
        label="View committee"
      />
      <SourceNote>
        One project per row. Paid values use the ledger’s budgeted USD amounts;
        open commitments exclude cancelled grants. Payment records do not
        independently establish delivery.
      </SourceNote>
      <Synced className="mt-4" />
    </>
  );
}
