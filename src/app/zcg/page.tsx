import { getPaymentSchedule } from "@/lib/zcg/schedule-repo";
import Link from "next/link";
import { PageHeader, Stat } from "@/components/ui";
import {
  IconArrowUp,
  IconBalance,
  IconChart,
  IconCheck,
  IconCoins,
  IconGrant,
  IconNews,
  IconReceipt,
  IconShield,
  IconTerminal,
  IconUsers,
  IconVote,
  IconWallet,
} from "@/components/icons";
import type { ComponentType } from "react";
import { disbursementsSummary } from "@/lib/zcg/disbursements-repo";
import { formatUsdCents } from "@/lib/zcg/format";
import { formatZecCompact } from "@/lib/zcash/units";
import { ElectionsSection } from "./elections-section";
import { CurrentCommittee } from "./current-committee";
import { listChangelog } from "@/lib/zcg/changelog";
import { proposalStatusLabel } from "@/lib/zcg/status-labels";
import "./overview.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "ZCG · OpenZcash" };

type Tile = {
  href: string;
  label: string;
  sub: string;
  Icon: ComponentType<{ className?: string }>;
};

// Primary records stay visible; specialist tools remain one click away.
const TILES: Tile[] = [
  {
    href: "/zcg/totals",
    label: "Totals",
    sub: "Where the money goes",
    Icon: IconChart,
  },
  {
    href: "/zcg/grants",
    label: "Grants",
    sub: "Approved projects",
    Icon: IconGrant,
  },
  {
    href: "/zcg/disbursements",
    label: "Disbursements",
    sub: "The full ledger",
    Icon: IconReceipt,
  },
  {
    href: "/zcg/recipients",
    label: "Recipients",
    sub: "By amount received",
    Icon: IconUsers,
  },
  {
    href: "/zcg/proposals",
    label: "Proposals",
    sub: "Governance funnel",
    Icon: IconVote,
  },
  {
    href: "/zcg/committee",
    label: "Committee",
    sub: "Members, mandates & elections",
    Icon: IconUsers,
  },
  {
    href: "/zcg/analytics",
    label: "Insights",
    sub: "Burn-rate & delivery",
    Icon: IconArrowUp,
  },
  {
    href: "/zcg/stipends",
    label: "Stipends",
    sub: "Committee pay",
    Icon: IconCoins,
  },
  {
    href: "/zcg/budget",
    label: "Budget",
    sub: "Discretionary · USD × ZEC",
    Icon: IconBalance,
  },
  {
    href: "/zcg/coinholder",
    label: "Coinholder",
    sub: "FPF grants pool",
    Icon: IconWallet,
  },
  {
    href: "/zcg/reconciliation",
    label: "Reconciliation",
    sub: "On-chain ↔ ledger",
    Icon: IconShield,
  },
  {
    href: "/zcg/meetings",
    label: "Meetings",
    sub: "Committee minutes",
    Icon: IconNews,
  },
  {
    href: "/zcg/methodology",
    label: "Methodology",
    sub: "Sources & API",
    Icon: IconCheck,
  },
  {
    href: "/zcg/copilot",
    label: "ZCG Copilot",
    sub: "Ask about public records",
    Icon: IconTerminal,
  },
];

const PRIMARY_ROUTES = [
  "/zcg/grants",
  "/zcg/proposals",
  "/zcg/disbursements",
  "/zcg/recipients",
];

const changeLabel = (v: string | null) => proposalStatusLabel(v);

export default async function ZcgPage() {
  const [s, changes, schedule] = await Promise.all([
    disbursementsSummary(),
    listChangelog(7, 12, "zcg").catch(() => []),
    // Derived figure; never lets the app's first screen fail.
    getPaymentSchedule().catch(() => null),
  ]);

  return (
    <div className="zcg-overview">
      <PageHeader
        title="Zcash Community Grants"
        subtitle="Public accounting for Zcash Community Grants, imported from the official spreadsheet. An off-chain disbursement ledger that can be cross-referenced with the on-chain Lockbox/ZCG outflows."
      />

      <section className="zcg-overview-metrics" aria-label="Funding summary">
        <Stat
          label="Grants"
          value={String(s.grantCount)}
          sub={`${s.paidCount} payments made`}
        />
        <Stat
          label="USD paid to date"
          value={formatUsdCents(s.usdPaidCents, { compact: true })}
          sub="budgeted value of paid entries"
          tone="warn"
        />
        <Stat
          label="ZEC paid (ledger)"
          value={formatZecCompact(s.zecPaidZat, { symbol: false })}
          sub="recorded by the spreadsheet"
        />
        <Stat
          label="Recipients"
          value={String(s.recipientCount)}
          sub="orgs and individuals"
        />
      </section>

      <nav className="zcg-overview-primary" aria-label="Grant records">
        {PRIMARY_ROUTES.map((href) =>
          TILES.find((tile) => tile.href === href)!,
        ).map((tile) => (
          <Link key={tile.href} href={tile.href}>
            <tile.Icon className="h-5 w-5" />
            <span>
              <strong>{tile.label}</strong>
              <small>{tile.sub}</small>
            </span>
            <span aria-hidden>→</span>
          </Link>
        ))}
      </nav>
      <details className="zcg-overview-tools">
        <summary>More ZCG tools</summary>
        <nav aria-label="More ZCG tools">
          {TILES.filter((tile) => !PRIMARY_ROUTES.includes(tile.href)).map(
            (tile) => (
              <Link key={tile.href} href={tile.href}>
                <tile.Icon className="h-4 w-4" />
                <span>
                  <strong>{tile.label}</strong>
                  <small>{tile.sub}</small>
                </span>
              </Link>
            ),
          )}
        </nav>
      </details>

      {schedule ? (
        <section
          className="zcg-overview-schedule"
          aria-labelledby="overview-schedule-title"
        >
          <div>
            <h2 id="overview-schedule-title">Scheduled payments</h2>
            <p className="zcg-overview-schedule-value tnum">
              {formatUsdCents(schedule.totalCents)}
            </p>
          </div>
          <p className="zcg-overview-schedule-note">
            <strong>{schedule.rows.length} approved future payments</strong>
            Unpaid milestones with an estimated date, summed from the ledger.
            View totals by month and category.
          </p>
          <Link className="ws-button" href="/zcg/schedule">
            Open schedule <span aria-hidden>→</span>
          </Link>
        </section>
      ) : null}

      <CurrentCommittee />

      {changes.length > 0 ? (
        <section className="mb-8">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-stone-700">
              Changed this week
            </h2>
            <a
              href="/api/feeds/zcg.xml"
              className="text-xs text-stone-400 hover:text-amber-700"
              title="Subscribe to changes via RSS"
            >
              RSS ↗
            </a>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white shadow-sm shadow-stone-300/40 ring-1 ring-inset ring-stone-900/5">
            <ul className="divide-y divide-stone-100">
              {changes.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <span className="min-w-0 flex-1 overflow-hidden">
                    {c.kind === "proposal_status" ? (
                      <Link
                        href={`/zcg/proposals?status=${c.toVal ?? ""}`}
                        className="block truncate text-stone-800 hover:text-amber-700"
                      >
                        <span className="font-medium">{c.title}</span>
                        <span className="text-stone-500">
                          {" "}
                          moved {changeLabel(c.fromVal)} →{" "}
                        </span>
                        <span className="font-medium">
                          {changeLabel(c.toVal)}
                        </span>
                      </Link>
                    ) : c.kind === "proposal_new" ? (
                      <Link
                        href="/zcg/proposals?status=under_review"
                        className="block truncate text-stone-800 hover:text-amber-700"
                      >
                        <span className="text-stone-500">New proposal: </span>
                        <span className="font-medium">{c.title}</span>
                      </Link>
                    ) : (
                      <Link
                        href="/zcg/disbursements"
                        className="block truncate text-stone-800 hover:text-amber-700"
                      >
                        <span className="font-medium">{c.title}</span>
                        <span className="text-stone-500"> · {c.detail}</span>
                      </Link>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-stone-400 tnum">
                    {c.at.toISOString().slice(5, 10).replace("-", "/")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-2 text-xs text-stone-500">
            Automatic diff between daily imports of the official spreadsheet:
            new proposals, verdict changes, and newly recorded payments.
          </p>
        </section>
      ) : null}

      <ElectionsSection />

      <Link className="zcg-overview-office" href="/zcg/office">
        <span>
          <strong>Step into the ZCG office</strong>
          <small>
            A living 3D room where every proposal under review walks the floor
            as a zebra, in front of the committee.
          </small>
        </span>
        <span aria-hidden>→</span>
      </Link>
    </div>
  );
}
