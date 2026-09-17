"use client";

import Link from "next/link";
import { Badge } from "@/components/ui";
import { DataTable, type Column } from "@/components/data-table";
import { formatUsdCents } from "@/lib/zcg/format";
import { formatZec } from "@/lib/zcash/units";

type StatusTone = "emerald" | "rose" | "amber" | "zinc";

function statusTone(status: string | null): StatusTone {
  if (status === "completed") return "emerald";
  if (status === "cancelled" || status === "keyholder_veto") return "rose";
  if (status === "open") return "amber";
  return "zinc";
}

/** Serializable row shape for the client DataTable (no bigint). */
export type GrantTableRow = {
  grantKey: string;
  grantee: string;
  category: string;
  status: string | null;
  statusText: string;
  program: "zcg_regular" | "coinholder";
  milestoneCount: number;
  paidCount: number;
  milestonesText: string;
  _usd: number;
  _zec: number;
};

interface GrantsTableProps {
  rows: GrantTableRow[];
  initialPicks?: Record<string, string[]>;
  initialQuery?: string;
}

export function GrantsTable({
  rows,
  initialPicks,
  initialQuery,
}: GrantsTableProps) {
  const columns: Column<GrantTableRow>[] = [
    {
      key: "grantKey",
      header: "Grant",
      sortable: true,
      filterable: true,
      filterValue: (r) => r.grantKey,
      render: (r) => (
        <div className="max-w-[24rem]">
          <Link
            href={`/zcg/grant?g=${encodeURIComponent(r.grantKey)}`}
            className="ws-grant-name"
          >
            {r.grantKey}
          </Link>
          {r.program === "coinholder" ? (
            <span className="text-[10px] uppercase tracking-wide text-amber-700/70">
              coinholder
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "grantee",
      header: "Recipient",
      sortable: true,
      filterable: true,
      filterValue: (r) => r.grantee,
      render: (r) => (
        <Link
          className="ws-grantee"
          href={`/zcg/recipient?r=${encodeURIComponent(r.grantee)}`}
        >
          {r.grantee}
        </Link>
      ),
    },
    {
      key: "category",
      header: "Category",
      sortable: true,
      filterable: true,
      filterType: "select",
      filterValue: (r) => r.category,
      render: (r) => (
        <span className="text-xs text-stone-600">{r.category || "·"}</span>
      ),
    },
    {
      key: "program",
      header: "Program",
      filterable: true,
      filterType: "select",
      filterValue: (r) => (r.program === "coinholder" ? "Coinholder" : "ZCG"),
      render: (r) => (
        <span className="text-xs text-stone-500">
          {r.program === "coinholder" ? "Coinholder" : "ZCG"}
        </span>
      ),
    },
    {
      key: "usd",
      header: "Value",
      align: "right",
      sortable: true,
      sortValue: (r) => r._usd,
      render: (r) => (
        <span className="font-medium text-amber-700/90">
          {formatUsdCents(BigInt(r._usd))}
        </span>
      ),
    },
    {
      key: "zec",
      header: "ZEC",
      align: "right",
      sortable: true,
      sortValue: (r) => r._zec,
      render: (r) =>
        r._zec !== 0 ? (
          <span className="text-stone-600">
            {formatZec(BigInt(r._zec), { symbol: false })}
          </span>
        ) : (
          <span className="text-stone-600">·</span>
        ),
    },
    {
      key: "milestones",
      header: "Milestones",
      align: "center",
      sortable: true,
      filterable: true,
      sortValue: (r) => r.paidCount,
      filterValue: (r) => r.milestonesText,
      render: (r) => (
        <Link
          href={`/zcg/grant?g=${encodeURIComponent(r.grantKey)}`}
          className="inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-xs tnum ring-1 ring-inset ring-stone-200 hover:ring-amber-500/40"
        >
          <span className="ws-milestone-dots" aria-hidden>
            {Array.from({ length: Math.min(r.milestoneCount, 8) }, (_, i) => (
              <i
                key={i}
                data-paid={
                  i <
                  Math.round(
                    (r.paidCount / Math.max(1, r.milestoneCount)) *
                      Math.min(r.milestoneCount, 8),
                  )
                }
              />
            ))}
          </span>
          <span className="text-amber-700">{r.paidCount}</span>
          <span className="text-stone-600">/{r.milestoneCount}</span>
        </Link>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      filterable: true,
      filterType: "select",
      sortValue: (r) => r.statusText,
      filterValue: (r) => r.statusText,
      render: (r) => <Badge tone={statusTone(r.status)}>{r.statusText}</Badge>,
    },
  ];

  return (
    <DataTable
      columns={columns}
      initialPicks={initialPicks}
      initialQuery={initialQuery}
      rows={rows}
      rowKey={(r) => `${r.program}:${r.grantKey}`}
      initialSort={{ key: "usd", dir: "desc" }}
    />
  );
}
