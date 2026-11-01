"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
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

// Tags used before the vote stay visible; post-decision tags live in "More tags".
const PRE_VOTE_GROUP = "Review";
const toggleId = (current: string[], id: string) => current.includes(id) ? current.filter(item => item !== id) : [...current, id];

function MoreTags({ selection, disabled, onToggle }: { selection: string[]; disabled: boolean; onToggle: (id: string) => void }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null), search = useRef<HTMLInputElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const q = query.trim().toLocaleLowerCase("en");
  const chosen = selectedCommitteeLabels(selection).filter(label => label.group !== PRE_VOTE_GROUP);
  return <div className="committee-more-tags" ref={root} onKeyDown={event => { if (event.key === "Escape") setOpen(false); }}>
    <div className="committee-more-tags-row">
      <button type="button" className="committee-more-tags-trigger" aria-expanded={open} aria-controls={panelId} disabled={disabled} onClick={() => setOpen(value => !value)}>
        More tags{chosen.length ? <span>{chosen.length}</span> : null}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {chosen.map(label => <button type="button" key={label.id} className="committee-label-chip" aria-pressed="true" aria-label={`Remove ${label.name}`} disabled={disabled} onClick={() => onToggle(label.id)}><LabelBadge label={label} /><span aria-hidden="true">×</span></button>)}
    </div>
    {open ? <div className="committee-more-tags-panel" id={panelId} role="group" aria-label="More tags">
      <input ref={search} type="search" placeholder="Search tags" aria-label="Search tags" value={query} onChange={event => setQuery(event.target.value)} />
      <div className="committee-more-tags-list">
        {COMMITTEE_LABEL_GROUPS.filter(group => group !== PRE_VOTE_GROUP).map(group => {
          const items = COMMITTEE_LABELS.filter(label => label.group === group && `${label.name} ${label.description}`.toLocaleLowerCase("en").includes(q));
          return items.length ? <fieldset key={group}><legend>{group}</legend>
            {items.map(label => <label key={label.id} title={label.description || label.name}><input type="checkbox" checked={selection.includes(label.id)} disabled={disabled} onChange={() => onToggle(label.id)} /><LabelBadge label={label} /></label>)}
          </fieldset> : null;
        })}
        {!COMMITTEE_LABELS.some(label => label.group !== PRE_VOTE_GROUP && `${label.name} ${label.description}`.toLocaleLowerCase("en").includes(q)) ? <p>No tags match your search.</p> : null}
      </div>
    </div> : null}
  </div>;
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
      {/* Pre-vote tags are one click away; everything else is in the "More tags" checklist. */}
      <fieldset className="committee-label-group" disabled={busy || stale}><legend>Before the vote</legend><div>
        {COMMITTEE_LABELS.filter(label => label.group === PRE_VOTE_GROUP).map(label => { const on = selection.includes(label.id); return <button type="button" key={label.id} className="committee-label-chip" aria-pressed={on} title={label.description || label.name}
          onClick={() => setSelection(current => toggleId(current, label.id))}><LabelBadge label={label} />{on ? <span aria-hidden="true">✓</span> : null}</button>; })}
      </div></fieldset>
      <MoreTags selection={selection} disabled={busy || stale} onToggle={id => setSelection(current => toggleId(current, id))} />
      {error ? <p className="dao-form-error" role="alert">{error}</p> : null}
      <div className="committee-label-footer"><span>{demo ? "Read-only preview · Saving requires an authorized committee role and enabled operations." : !canSave ? "Verify your email to save labels." : "Changes are recorded in the proposal’s public history."}</span><div>{stale ? <button type="button" className="dao-button" disabled={busy} onClick={() => void onReload()}>Reload labels</button> : <button type="button" className="dao-text-button" disabled={busy || !changed} onClick={() => { setSelection(labels); setError(""); }}>Reset</button>}<button type="button" className="dao-button dao-button--primary" disabled={busy || !canSave || !changed || stale} onClick={() => void save()}>{busy ? "Saving…" : "Save labels"}</button></div></div>
    </> : <><CommitteeLabels ids={labels} /><p>Only committee reviewers can change labels.</p></>}
  </section>;
}
