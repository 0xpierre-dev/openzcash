"use client";

import { useState } from "react";
import { WorkspaceFrame, type WorkspaceFrameProps } from "@/components/community-workspace";
import { TreasuryActions } from "@/components/treasury-actions";
import { formatTreasuryZec, type CommunityTreasuryView, type TreasuryKindValue } from "@/lib/domain/treasury";

type Props = Omit<WorkspaceFrameProps, "children" | "activeSection"> & { treasury: CommunityTreasuryView };
const fundName = (kind: TreasuryKindValue) => kind === "SUSTAINABILITY" ? "Sustainability" : "Community";
const activityDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

export function TreasuryWorkspace({ community, communities, viewer, treasury, isDemo }: Props) {
  const [update, setUpdate] = useState<{ source: CommunityTreasuryView; value: CommunityTreasuryView } | null>(null);
  const balances = update?.source === treasury ? update.value : treasury;
  const canManage = viewer?.role === "OWNER" && balances.canManage;
  const available = balances.funds.reduce((sum, fund) => sum + BigInt(fund.availableZat), 0n);

  return <WorkspaceFrame community={community} communities={communities} viewer={viewer} activeSection="treasury" isDemo={isDemo}>
    <div className="dao-treasury-page">
      <header className="dao-treasury-heading">
        <div><h1>Treasury</h1><p>{community.name}</p></div>
        <p className="dao-treasury-disclosure">Recorded budgets<span>Wallet not connected</span></p>
      </header>

      <section className="dao-treasury-total" aria-label="Combined available budget">
        <div><p>Available across both funds</p><strong>{formatTreasuryZec(available)} <span>ZEC</span></strong></div>
        <p>Community initiatives.<br />A reserve for what comes next.</p>
      </section>

      <div className="dao-treasury-funds">
        {balances.funds.map(fund => <section key={fund.kind} className={`dao-treasury-fund${fund.kind === "SUSTAINABILITY" ? " dao-treasury-fund--reserve" : ""}`} aria-label={fund.name}>
          <div className="dao-treasury-fund-heading">
            <h2>{fundName(fund.kind)}</h2><span>{fund.kind === "SUSTAINABILITY" ? "Reserve" : "Initiatives"}</span>
          </div>
          <div className="dao-treasury-available"><span>Available</span><strong>{formatTreasuryZec(fund.availableZat)} <small>ZEC</small></strong></div>
          <dl className="dao-treasury-breakdown">
            <div><dt>Reserved</dt><dd>{formatTreasuryZec(fund.reservedZat)} <span>ZEC</span></dd></div>
            <div><dt>Committed</dt><dd>{formatTreasuryZec(fund.committedZat)} <span>ZEC</span></dd></div>
            <div><dt>Paid</dt><dd>{formatTreasuryZec(fund.paidZat)} <span>ZEC</span></dd></div>
          </dl>
          <TreasuryActions communityId={community.id} treasuryKind={fund.kind} canManage={canManage} onUpdated={value => setUpdate({ source: treasury, value })} />
        </section>)}
      </div>

      <section className="dao-treasury-history" aria-labelledby="treasury-activity-heading">
        <div className="dao-treasury-history-heading"><h2 id="treasury-activity-heading">Recent activity</h2><span>UTC</span></div>
        {balances.recentActivity.length ? <ol className="dao-treasury-entries">
          {balances.recentActivity.map(entry => <li key={entry.id}>
            <div className={`dao-treasury-entry-icon${entry.kind === "ALLOCATION" ? " dao-treasury-entry-icon--allocation" : ""}`} aria-hidden="true">{entry.kind === "FUNDING" ? "+" : "↗"}</div>
            <div className="dao-treasury-entry-detail">
              <h3>{entry.kind === "FUNDING" ? "Funding recorded" : "Budget allocated"}</h3>
              <p>{entry.kind === "ALLOCATION" && entry.fromTreasuryKind ? `${fundName(entry.fromTreasuryKind)} → ` : ""}{fundName(entry.toTreasuryKind)}{entry.fundingSource ? ` · ${entry.fundingSource}` : ""}</p>
              <p className="dao-treasury-entry-reason">{entry.reason}</p>
              <p className="dao-treasury-entry-meta">{entry.actorLabel} · <time dateTime={entry.createdAt}>{activityDate.format(new Date(entry.createdAt))}</time></p>
            </div>
            <p className="dao-treasury-entry-amount">{formatTreasuryZec(entry.amountZat)} <span>ZEC</span></p>
          </li>)}
        </ol> : <p className="dao-quiet-empty">No activity yet.</p>}
      </section>
    </div>
  </WorkspaceFrame>;
}
