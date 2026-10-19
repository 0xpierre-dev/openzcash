"use client";

import { useRef, useState, type CSSProperties } from "react";
import { passkeyFetch } from "@/lib/participate/workspace/auth/passkey-client";
import { COMMITTEE_LABEL_CATALOG, COMMITTEE_LABEL_GROUPS, COMMITTEE_LABELS, committeeLabelStyle, selectedCommitteeLabels, type CommitteeLabel } from "@/lib/participate/workspace/domain/committee-labels";

function LabelBadge({ label }: { label: CommitteeLabel }) {
  return <span className="committee-label-badge" style={committeeLabelStyle(label.color) as CSSProperties} title={label.description || label.name}>{label.name}</span>;
}

export function CommitteeLabels({ ids = [] }: { ids?: readonly string[] }) {
  const labels = selectedCommitteeLabels(ids);
  if (!labels.length) return null;
  return <ul className="committee-label-badges" aria-label="Committee labels">{labels.map(label => <li key={label.id}><LabelBadge label={label} /></li>)}</ul>;
}

export function CommitteeLabelEditor({ recordId, labels, version, canReview, canSave, demo, onSaved, onReload }: {
  recordId: string; labels: string[]; version: number; canReview: boolean; canSave: boolean; demo: boolean;
  onSaved: (value: { labels: string[]; labelsVersion: number }) => void; onReload: () => Promise<void>;
}) {
  const [selection, setSelection] = useState(labels);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [stale, setStale] = useState(false);
  const guard = useRef(false);
  const changed = JSON.stringify([...selection].sort()) !== JSON.stringify([...labels].sort());
  async function save() {
    if (guard.current || !canSave || !canReview || !changed || stale) return;
    guard.current = true; setBusy(true); setError("");
    try {
      const value = await passkeyFetch<{ labels: string[]; labelsVersion: number }>("/api/participate/committee", { action: "labels", recordId, version, labels: [...selection].sort() });
      onSaved(value);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      setStale(code === "COMMITTEE_REFRESH_REQUIRED");
      setError(code === "COMMITTEE_REFRESH_REQUIRED" ? "Labels changed. Reload before editing again." : code === "COMMITTEE_FORBIDDEN" || code === "COMMITTEE_VERIFIED_ACCOUNT_REQUIRED" ? "A verified committee reviewer account is required." : code === "COMMITTEE_PROPOSAL_UNAVAILABLE" ? "This proposal is no longer available to this committee." : "Labels could not be saved. Try again.");
    } finally { guard.current = false; setBusy(false); }
  }
  return <section className="committee-label-editor" aria-label="Edit committee labels">
    <div className="committee-label-heading"><div><h3>Proposal tags <span>{selection.length ? `${selection.length} selected` : "Tap to add"}</span></h3></div><a href={COMMITTEE_LABEL_CATALOG.url} target="_blank" rel="noopener noreferrer">ZCG catalog ↗</a></div>
    {canReview ? <>
      {/* Every tag is visible and toggles in place; no search, menu or checkbox list. */}
      <div className="committee-label-groups">{COMMITTEE_LABEL_GROUPS.map(group => {
        const items = COMMITTEE_LABELS.filter(label => label.group === group);
        return items.length ? <fieldset key={group} className="committee-label-group" disabled={busy || stale}><legend>{group}</legend><div>
          {items.map(label => { const on = selection.includes(label.id); return <button type="button" key={label.id} className="committee-label-chip" aria-pressed={on} title={label.description || label.name}
            onClick={() => setSelection(current => on ? current.filter(id => id !== label.id) : [...current, label.id])}><LabelBadge label={label} />{on ? <span aria-hidden="true">✓</span> : null}</button>; })}
        </div></fieldset> : null;
      })}</div>
      {error ? <p className="dao-form-error" role="alert">{error}</p> : null}
      <div className="committee-label-footer"><span>{demo ? "Read-only preview · Saving requires an authorized committee role and enabled operations." : !canSave ? "Verify your email to save labels." : "Changes are recorded in the proposal’s public history."}</span><div>{stale ? <button type="button" className="dao-button" disabled={busy} onClick={() => void onReload()}>Reload labels</button> : <button type="button" className="dao-text-button" disabled={busy || !changed} onClick={() => { setSelection(labels); setError(""); }}>Reset</button>}<button type="button" className="dao-button dao-button--primary" disabled={busy || !canSave || !changed || stale} onClick={() => void save()}>{busy ? "Saving…" : "Save labels"}</button></div></div>
    </> : <><CommitteeLabels ids={labels} /><p>Only committee reviewers can change labels.</p></>}
  </section>;
}
