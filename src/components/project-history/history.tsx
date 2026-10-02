"use client";
import Link from "next/link";
import { useState } from "react";
import type { ProjectHistory, Source, Amount, HistoryEvent } from "@/lib/project-history/types";
import { historyAmount } from "@/lib/project-history/format";
import { displayDate, safeExternalUrl } from "@/lib/ecosystem/catalog";
import styles from "./history.module.css";

const evidenceLabels: Record<HistoryEvent["evidence"], string> = {
  source_record: "Source record", published_artifact: "Published artifact", team_reported: "Team reported", reviewed_delivery: "Reviewed delivery",
};
function SourceLink({ source }: { source: Source }) {
  const url = safeExternalUrl(source.url);
  return url ? <a className={styles.source} href={url} title={source.observedAt ? `Source observed ${displayDate(source.observedAt)}` : undefined} target="_blank" rel="noopener noreferrer">{source.label} ↗</a> : <span className={styles.muted}>Source unavailable</span>;
}
function AmountValue({ amount, unit = "USD" }: { amount: Amount; unit?: "USD" | "ZEC" }) {
  return <>{historyAmount(amount.known, unit)}{amount.missing > 0 && <small className={styles.muted}> · {amount.missing} missing</small>}</>;
}

export function ProjectHistoryView({ history }: { history: ProjectHistory }) {
  const [tab, setTab] = useState("timeline"), [kind, setKind] = useState(""), [month, setMonth] = useState(""), [limit, setLimit] = useState(15);
  const events = history.timeline.filter(event => (!kind || event.kind === kind) && (!month || event.date?.slice(0, 7) === month));
  const kinds = [...new Set(history.timeline.map(event => event.kind))];
  const paidCount = new Set(history.grants.flatMap(grant => grant.milestones.filter(item => item.paymentRecorded).map(item => item.id))).size;
  return <>
    <div className={styles.stats}>
      <div className={styles.stat}><strong>{history.grants.length}</strong><span>Associated grant records</span></div>
      <div className={styles.stat}><strong>{history.coverage.paymentsAvailable ? paidCount : "—"}</strong><span>Paid ledger entries</span></div>
      <div className={styles.stat}><strong>{history.timeline.filter(event => event.kind === "release").length}</strong><span>Releases in dated snapshot</span></div>
    </div>
    <p className={styles.muted}>Repository snapshot: {displayDate(history.repositorySnapshotAt)} · Latest mirror row import: {history.ledgerImportedAt ? displayDate(history.ledgerImportedAt) : "unavailable"}</p>
    <div className={styles.layout}><div>
      <div className={styles.tabs} role="tablist" aria-label="Project history sections">
        {[["timeline", "Timeline"], ["funding", "Funding & milestones"], ["gaps", "Evidence gaps"]].map(([id, title], index) => <button key={id} type="button" role="tab" className={styles.tab} id={`tab-${id}`} aria-controls={`panel-${id}`} aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={event => {
          const ids = ["timeline", "funding", "gaps"];
          const next = event.key === "ArrowRight" ? (index + 1) % 3 : event.key === "ArrowLeft" ? (index + 2) % 3 : event.key === "Home" ? 0 : event.key === "End" ? 2 : null;
          if (next !== null) { event.preventDefault(); setTab(ids[next]); document.getElementById(`tab-${ids[next]}`)?.focus(); }
        }}>{title}</button>)}
      </div>
      <section role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "timeline" && <>
          <div className={styles.filters}>
            <label>Record type<select value={kind} onChange={event => { setKind(event.target.value); setLimit(15); }}><option value="">All records</option>{kinds.map(value => <option value={value} key={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
            <label>Event month · UTC<input type="month" min="2016-01" max="2099-12" value={month} onChange={event => { setMonth(event.target.value); setLimit(15); }} /></label>
            {month && <button className={styles.more} onClick={() => setMonth("")}>Clear month</button>}
          </div>
          <p className={styles.muted} aria-live="polite">{events.length} linked record{events.length === 1 ? "" : "s"}{month ? ` · undated records excluded` : " · undated references appear last"}</p>
          <ol className={styles.timeline}>{events.slice(0, limit).map(event => <li key={event.id} className={styles.event}>
            <time dateTime={event.date ?? undefined}>{event.date ? displayDate(event.date) : "Date not linked"}</time>
            <div className={styles.eventBody}><span className={`${styles.badge} ${event.evidence === "published_artifact" || event.evidence === "reviewed_delivery" ? styles.artifact : ""}`}>{evidenceLabels[event.evidence]}</span>
              <h3>{event.title}</h3><p>{event.detail}</p><SourceLink source={event.source} />
            </div>
          </li>)}</ol>
          {!events.length && <p className={styles.empty}>No linked records for this selection. This does not establish that no work occurred.</p>}
          {events.length > limit && <button className={styles.more} onClick={() => setLimit(limit + 15)}>Show more records</button>}
        </>}
        {tab === "funding" && <>
          <p className={styles.muted}>Amounts describe each associated grant. Requested amounts, approval status and paid entries are separate; the source has no distinct approved-amount field.</p>
          {history.grants.map(grant => <article className={styles.grant} key={grant.id}>
            <div className={styles.grantTop}><span className={styles.eyebrow}>{grant.program === "zcg" ? "ZCG" : "Coinholder Grants"}</span><span className={styles.badge}>{grant.statusBasis === "dated_catalog" ? "Catalog: " : ""}{grant.status.replaceAll("_", " ")}</span></div>
            <h3>{grant.title}</h3>
            {grant.sharedWith.length > 0 && <p className={styles.shared}>Shared award context with {grant.sharedWith.map((project, index) => <span key={project.id}>{index > 0 && ", "}<Link href={`/ecosystem/history/${project.id}`}>{project.name}</Link></span>)}. These amounts are not an allocation to this component.</p>}
            <dl className={styles.amounts}>
              <div><dt>Requested · USD</dt><dd>{historyAmount(grant.requestedUsdCents)}</dd></div>
              <div><dt>Recorded grant budget · USD</dt><dd><AmountValue amount={grant.budgetUsdCents} /></dd></div>
              <div><dt>Budget value of paid entries · USD</dt><dd><AmountValue amount={grant.paidBudgetUsdCents} /></dd></div>
              <div><dt>Recorded paid ZEC</dt><dd><AmountValue amount={grant.recordedZecZat} unit="ZEC" /></dd></div>
            </dl>
            <p>USD figures are historical ledger budgets. ZEC is the recorded disbursement, not a current USD valuation or independent on-chain verification.</p>
            <p><SourceLink source={grant.source} />{grant.scopeUrl && <> · <a className={styles.source} href={grant.scopeUrl} target="_blank" rel="noopener noreferrer">Proposal scope ↗</a></>}</p>
            <details><summary>{grant.milestones.length} linked ledger {grant.milestones.length === 1 ? "entry" : "entries"}</summary>
              {grant.milestones.map(milestone => <div className={styles.milestone} key={milestone.id}>
                <h4>{milestone.title}</h4><p>{milestone.deliverable ?? "Deliverable text is not linked; consult the proposal scope."}</p>
                <p>{milestone.paymentRecorded ? `Payment recorded${milestone.paidDate ? ` · ${displayDate(milestone.paidDate)}` : " · date unavailable"}` : "Not marked paid in the ledger"}</p>
                {milestone.deliveryEvidence.length ? milestone.deliveryEvidence.map(event => <p key={event.id}><span className={styles.badge}>Reviewed delivery</span> {event.detail} <SourceLink source={event.source} /></p>) : <p>Acceptance evidence is not linked yet.</p>}
                <SourceLink source={milestone.source} />
              </div>)}
              {!grant.milestones.length && <p>No exact ledger match is linked. Missing records are not a zero total.</p>}
            </details>
          </article>)}
          {!history.grants.length && <p className={styles.empty}>No project-specific grant record is linked in this catalog.</p>}
        </>}
        {tab === "gaps" && <><p className={styles.muted}>What this history cannot establish yet. These are coverage gaps, not a rating of the team.</p><ul>{history.gaps.map(gap => <li className={styles.gap} key={gap}>{gap}</li>)}</ul></>}
      </section>
    </div><aside className={styles.aside}>
      <section><h2>Source coverage</h2><dl>
        <dt>Project identity reviewed</dt><dd>{displayDate(history.registryCheckedAt)}</dd>
        <dt>Repository snapshot · not live</dt><dd>{displayDate(history.repositorySnapshotAt)}</dd>
        <dt>Latest mirror row import</dt><dd>{history.ledgerImportedAt ? displayDate(history.ledgerImportedAt) : "Unavailable"}</dd>
        <dt>Proposal / payment readers</dt><dd>{history.coverage.proposalsAvailable ? "Available" : "Unavailable"} / {history.coverage.paymentsAvailable ? "Available" : "Unavailable"}</dd>
      </dl></section>
      <section><h2>Reading the evidence</h2><p>Source records document funding and decisions. Published artifacts establish releases. Team reports describe claimed work. Reviewed delivery requires evidence tied to a specific milestone.</p><p>Payment alone never marks work delivered.</p></section>
      {history.reportLinks.length > 0 && <section><h2>Community reports</h2><ul>{history.reportLinks.map(report => <li key={report.url}><a className={styles.source} href={report.url} target="_blank" rel="noopener noreferrer">{report.title} ↗</a></li>)}</ul><p>These are report sources to inspect, not verified completion claims.</p></section>}
      <section><h2>Reuse this history</h2><p>The same public record is available to Zarvis and monthly reporting.</p><a className={styles.source} href={`/api/project-history/${history.project.id}`} target="_blank" rel="noopener noreferrer">Open source data ↗</a></section>
    </aside></div>
  </>;
}
