"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MIN_POLL_WINDOW_HOURS, MIN_POLL_WINDOW_MS } from "@/lib/domain/poll-window";
import { PROPOSAL_TAGS, MAX_PROPOSAL_TAGS, type ProposalTagId } from "@/lib/domain/proposal-tags";
import { PROPOSAL_TEMPLATES, type ProposalTemplateId } from "@/lib/domain/proposal-templates";
import { ProposalMarkdown } from "@/components/proposal-markdown";
import { parseProposalUsdCents, PROPOSAL_SETTLEMENT_LABEL } from "@/lib/domain/proposal-funding";

type ProposalDraft = {
  id: string; title: string; body: string; tags?: string[]; treasuryId?: string;
  requestedAmountUsd?: string; requestedAmountZec?: string; opensAt: string; closesAt: string;
};

function localInputDate(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function CommunityProposalForm({ communityId, funds, memberCount, initialProposal }: {
  communityId: string;
  funds: { id: string | null; name: string }[];
  memberCount: number;
  initialProposal?: ProposalDraft;
}) {
  const router = useRouter();
  const [body, setBody] = useState(initialProposal?.body ?? "");
  const [tags, setTags] = useState<ProposalTagId[]>(() => PROPOSAL_TAGS.filter(tag => initialProposal?.tags?.includes(tag.id)).map(tag => tag.id));
  const [templateId, setTemplateId] = useState<ProposalTemplateId>("community-grant");
  const [preview, setPreview] = useState(false);
  const [replacement, setReplacement] = useState<{ text: string; label: string } | null>(null);
  const [editorNotice, setEditorNotice] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const importSequence = useRef(0);
  const selectedTemplate = PROPOSAL_TEMPLATES.find(template => template.id === templateId)!;
  const [treasuryId, setTreasuryId] = useState(initialProposal?.treasuryId ?? "");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [pending, setPending] = useState(false);
  const flight = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = pending || importing || uncertain;
  useEffect(() => () => { importSequence.current += 1; }, []);
  const initialOpensAt = initialProposal?.opensAt;
  const initialClosesAt = initialProposal?.closesAt;
  useEffect(() => {
    // Initialize browser-local times after hydration; the server timezone may differ.
    const timer = window.setTimeout(() => {
      const opens = initialOpensAt ? new Date(initialOpensAt) : new Date(Date.now() + 86400000);
      const closes = initialClosesAt ? new Date(initialClosesAt) : new Date(opens.getTime() + 7 * 86400000);
      setOpensAt(localInputDate(opens));
      setClosesAt(localInputDate(closes));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialOpensAt, initialClosesAt]);

  function offerBody(text: string, label: string) {
    setEditorNotice(null);
    if (body.trim() && body !== text) { setReplacement({ text, label }); return; }
    setBody(text); setPreview(false); setReplacement(null);
    setEditorNotice(`${label} loaded. Review the text and set your funding and voting dates below.`);
  }

  async function importMarkdown(file?: File) {
    if (!file || busy) return;
    setError(null); setEditorNotice(null);
    if (!/\.(md|markdown)$/i.test(file.name) || file.size > 160_000) {
      setError("Choose a Markdown file (.md or .markdown) with no more than 40,000 characters."); return;
    }
    const sequence = ++importSequence.current;
    setImporting(true);
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      if (sequence !== importSequence.current) return;
      if (!text.trim() || text.length > 40_000 || text.includes("\0")) throw new Error("Invalid Markdown file");
      offerBody(text, "Markdown file");
    } catch {
      if (sequence === importSequence.current) setError("This file could not be imported. Use UTF-8 Markdown, up to 40,000 characters. Your current text is unchanged.");
    } finally { if (sequence === importSequence.current) setImporting(false); }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([selectedTemplate.body], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = selectedTemplate.filename;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (flight.current || busy || replacement) return;
    if (body.trim().length < 20 || body.length > 40_000) {
      setPreview(false); setError("Write a proposal between 20 and 40,000 characters before saving."); return;
    }
    setPending(true);
    flight.current = true;
    setError(null);
    const data = new FormData(event.currentTarget);
    let saved = false;
    try {
      const opens = new Date(opensAt);
      const closes = new Date(closesAt);
      if (!Number.isFinite(opens.getTime()) || !Number.isFinite(closes.getTime()) || closes.getTime() - opens.getTime() < MIN_POLL_WINDOW_MS) {
        setError(`Choose valid voting dates and allow at least ${MIN_POLL_WINDOW_HOURS} hours for voting.`);
        return;
      }
      const amountUsd = String(data.get("amount") ?? "").trim();
      if (treasuryId) {
        try { parseProposalUsdCents(amountUsd); } catch {
          setError("Enter a positive USD amount with up to two decimal places."); return;
        }
      }
      const payload = {
        title: String(data.get("title") ?? ""), body, tags,
        opensAt: opens.toISOString(), closesAt: closes.toISOString(),
        ...(treasuryId ? { treasuryId, requestedAmountUsd: amountUsd } : {})
      };
      const response = await fetch(`/api/admin/communities/${encodeURIComponent(communityId)}/proposals${initialProposal ? `/${encodeURIComponent(initialProposal.id)}` : ""}`, {
        method: initialProposal ? "PATCH" : "POST",
        headers: { "content-type": "application/json" }, body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => null);
      if (response.status >= 500 || (response.ok && typeof result?.proposal?.id !== "string")) {
        setUncertain(true);
        setError("We could not confirm whether your changes were saved. Check the proposal before submitting again.");
        return;
      }
      if (!response.ok) {
        const messages: Record<string, string> = {
          DAO_MEMBER_BASKET_EMPTY: "Add your community members before creating a voting proposal.",
          COMMUNITY_NOT_FOUND: "Your access to this community has changed. Refresh the page.",
          PROPOSAL_NOT_FOUND: "Your access to this proposal has changed. Refresh the page.",
          CONCURRENT_UPDATE: "Another update occurred. Your text is still here; please try again.",
          TREASURY_NOT_FOUND: "Choose a treasury belonging to this community.",
          POLL_NOT_DRAFT: "This proposal has already moved beyond the draft stage.",
          PROPOSAL_NOT_DRAFT: "This proposal has already moved beyond the draft stage.",
          MEMBERSHIP_PROPOSAL_EDIT_UNSUPPORTED: "This draft contains a membership change. Its member and action cannot be changed here.",
          forbidden: "Your session or permissions changed. Sign in again before saving.",
          forbidden_origin: "This page could not be verified. Reopen it and try again.",
          INVALID_PROPOSAL_INPUT: `Check the title, description, amount, and voting dates. Allow at least ${MIN_POLL_WINDOW_HOURS} hours for voting.`
        };
        setError(messages[result?.error] ?? "We couldn’t save the proposal. Check the fields and try again.");
        return;
      }
      saved = true;
      router.push(`/communities/${encodeURIComponent(communityId)}/proposals/${encodeURIComponent(result.proposal.id)}`);
      router.refresh();
    } catch {
      setUncertain(true);
      setError("Connection interrupted. Your changes may have been saved. Check the proposal before submitting again.");
    } finally { if (!saved) { flight.current = false; setPending(false); } }
  }

  return <form className="dao-panel dao-form" onSubmit={submit} aria-busy={pending}>
    <section className="dao-template-picker" aria-label="Proposal templates">
      <div className="dao-template-heading"><div><h2>Start with a template</h2><p>A clear request makes a better decision.</p></div><button className="dao-button" type="button" disabled={busy} onClick={() => fileInput.current?.click()}>{importing ? "Importing…" : "Import .md"}</button></div>
      <input ref={fileInput} type="file" className="dao-file-input" aria-label="Import Markdown file" accept=".md,.markdown,text/markdown" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void importMarkdown(file); }} />
      <div className="dao-template-controls"><label className="dao-sr-only" htmlFor="proposal-template">Proposal template</label><select id="proposal-template" disabled={busy} value={templateId} onChange={event => setTemplateId(event.target.value as ProposalTemplateId)}>{PROPOSAL_TEMPLATES.map(template => <option key={template.id} value={template.id}>{template.title}</option>)}</select><button type="button" className="dao-button" disabled={busy} onClick={() => offerBody(selectedTemplate.body, selectedTemplate.title)}>Use template</button><button type="button" className="dao-template-download" disabled={busy} onClick={downloadTemplate}>Download .md</button></div>
      <p className="dao-template-description">{selectedTemplate.description} <a href={selectedTemplate.source.url} target="_blank" rel="noopener noreferrer">{selectedTemplate.source.label} ↗</a></p>
      {replacement ? <div className="dao-template-replace" role="group" aria-label="Replace proposal text"><p>Replace your current proposal text with {replacement.label.toLowerCase()}?</p><div className="dao-form-actions"><button type="button" className="dao-button" disabled={busy} onClick={() => { setBody(replacement.text); setPreview(false); setReplacement(null); setEditorNotice("Proposal text replaced. Funding and voting dates are unchanged."); }}>Replace text</button><button type="button" className="dao-button" disabled={busy} onClick={() => setReplacement(null)}>Keep my text</button></div></div> : null}
      {editorNotice ? <p className="dao-field-hint" role="status">{editorNotice}</p> : null}
    </section>
    <div className="dao-field">
      <label htmlFor="proposal-title">Proposal title</label>
      <input id="proposal-title" name="title" required disabled={busy} minLength={12} maxLength={200} defaultValue={initialProposal?.title} placeholder="What should the community decide?" />
    </div>
    <fieldset className="dao-tag-picker" disabled={busy}><legend>Tags <span>Up to {MAX_PROPOSAL_TAGS}</span></legend><div>{PROPOSAL_TAGS.map(tag => {
      const selected = tags.includes(tag.id);
      return <button key={tag.id} type="button" className={`dao-topic-choice dao-topic--${tag.tone}`} aria-pressed={selected} disabled={busy || (!selected && tags.length >= MAX_PROPOSAL_TAGS)} onClick={() => setTags(current => selected ? current.filter(id => id !== tag.id) : [...current, tag.id])}><span aria-hidden="true">{selected ? "✓" : "+"}</span>{tag.label}</button>;
    })}</div></fieldset>
    <div className="dao-field">
      <div className="dao-editor-heading"><label htmlFor="proposal-body">The proposal</label><div role="group" aria-label="Markdown editor mode"><button type="button" disabled={busy} aria-pressed={!preview} onClick={() => setPreview(false)}>Write</button><button type="button" disabled={busy} aria-pressed={preview} onClick={() => setPreview(true)}>Preview</button></div></div>
      <textarea id="proposal-body" name="body" className="dao-markdown-editor" rows={16} required={!preview} disabled={busy} hidden={preview} minLength={preview ? undefined : 20} maxLength={40000} value={body} onChange={event => setBody(event.target.value)} placeholder="Explain the idea, why it matters, who will deliver it, and what success looks like." />
      {preview ? <div className="dao-markdown-preview" aria-label="Proposal preview">{body.trim() ? <ProposalMarkdown>{body}</ProposalMarkdown> : <p>Write a proposal or choose a template to preview it here.</p>}</div> : null}
      <p className="dao-editor-hint"><span>Markdown supports headings, links, tables and checklists.</span><span>{body.length.toLocaleString("en-US")} / 40,000</span></p>
    </div>
    <div className="dao-field-row">
      <div className="dao-field">
        <label htmlFor="proposal-treasury">Funding source</label>
        <select id="proposal-treasury" disabled={busy} value={treasuryId} onChange={event => setTreasuryId(event.target.value)}>
          <option value="">No funding requested</option>
          {funds.filter(fund => fund.id).map(fund => <option key={fund.id} value={fund.id!}>{fund.name}</option>)}
        </select>
        {!funds.some(fund => fund.id) ? <p>Record funding in the treasury to attach a budget.</p> : null}
      </div>
      {treasuryId ? <div className="dao-field">
        <label htmlFor="proposal-amount">Requested amount · USD</label>
        <input id="proposal-amount" name="amount" inputMode="decimal" required disabled={busy} pattern="[0-9]+([.][0-9]{1,2})?" maxLength={20} defaultValue={initialProposal?.requestedAmountUsd} placeholder="0.00" aria-describedby="proposal-settlement" />
        <p id="proposal-settlement">{PROPOSAL_SETTLEMENT_LABEL}</p>
        {initialProposal?.requestedAmountZec && !initialProposal.requestedAmountUsd ? <p>Previous budget: {initialProposal.requestedAmountZec} ZEC. Enter a USD budget to update this draft.</p> : null}
      </div> : null}
    </div>
    <div className="dao-field-row">
      <div className="dao-field"><label htmlFor="proposal-opens">Voting opens</label><input type="datetime-local" id="proposal-opens" required disabled={busy} value={opensAt} onChange={event => setOpensAt(event.target.value)} /></div>
      <div className="dao-field"><label htmlFor="proposal-closes">Voting closes</label><input type="datetime-local" id="proposal-closes" required disabled={busy} value={closesAt} onChange={event => setClosesAt(event.target.value)} /></div>
    </div>
    <p className="dao-notice">Times use your local timezone. Allow at least {MIN_POLL_WINDOW_HOURS} hours for voting. {initialProposal ? "The existing voter list stays attached to this draft." : `${memberCount} active community member${memberCount === 1 ? "" : "s"} will be included in this draft.`}</p>
    {memberCount === 0 && !initialProposal ? <p className="dao-notice">Your community needs a member list first. <Link href={`/communities/${encodeURIComponent(communityId)}/members`}>Add members</Link></p> : null}
    {error ? <p className="dao-error" role="alert">{error}</p> : null}
    {uncertain ? <Link className="dao-back-link" href={initialProposal ? `/communities/${encodeURIComponent(communityId)}/proposals/${encodeURIComponent(initialProposal.id)}` : `/communities/${encodeURIComponent(communityId)}/dao`}>Check saved proposals →</Link> : null}
    <div className="dao-form-actions">
      <Link className="dao-button" href={`/communities/${encodeURIComponent(communityId)}`}>Cancel</Link>
      <button type="submit" className="dao-button dao-button--primary" disabled={busy || Boolean(replacement) || (!initialProposal && memberCount === 0)}>{pending ? "Saving…" : initialProposal ? "Save changes" : "Create draft"}</button>
    </div>
  </form>;
}
