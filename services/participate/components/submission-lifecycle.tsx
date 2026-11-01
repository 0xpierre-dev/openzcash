"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { abandonmentReasonSchema, type ProposalAbandonment, type SubmissionDraft } from "@/lib/domain/proposal-submission";

const messages: Record<string, string> = {
  unauthorized: "Sign in with the author's account and try again.",
  DRAFT_NOT_FOUND: "This draft is unavailable for your account. Refresh My proposals.",
  DRAFT_CHANGED: "This proposal changed in another tab. Reopen it before continuing.",
  ALREADY_PUBLISHED: "This proposal is published. You can abandon it; its record stays public.",
  ALREADY_ABANDONED: "This proposal is already abandoned. Refresh to see its record.",
  PROPOSAL_NOT_PUBLISHED: "This is still a private draft. You can delete it instead.",
  INVALID_PROPOSAL_INPUT: "Enter a public reason of 10–1,000 characters and confirm.",
  CONCURRENT_UPDATE: "Another update occurred. Please try again."
};

export function SubmissionLifecycleAction({ draft, disabled = false, onDeleted, onAbandoned }: {
  draft: SubmissionDraft; disabled?: boolean; onDeleted?: (id: string) => void; onAbandoned?: (draft: SubmissionDraft) => void;
}) {
  const router = useRouter(), id = useId();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [reason, setReason] = useState(""), [consent, setConsent] = useState(false), [done, setDone] = useState(false);
  const requestKey = useRef(""), flight = useRef(false), trigger = useRef<HTMLButtonElement>(null);
  const isDraft = draft.state === "DRAFT";
  if (draft.state === "ABANDONED") return null;
  function close() { setOpen(false); setError(""); setConsent(false); trigger.current?.focus(); }
  async function confirm() {
    if (flight.current || disabled || (!isDraft && (!consent || !abandonmentReasonSchema.safeParse(reason).success))) return;
    flight.current = true; setBusy(true); setError("");
    try {
      requestKey.current ||= crypto.randomUUID();
      const response = await fetch("/api/participate/proposals", {
        method: isDraft ? "DELETE" : "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify(isDraft ? { id: draft.id, expectedVersion: draft.version, consent: true }
          : { id: draft.id, contentHash: draft.contentHash, reason: reason.trim(), requestKey: requestKey.current, consent: true })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(messages[result?.error] ?? "Could not confirm the change. Retry safely; the same request will not create another record.");
      if (isDraft ? result?.deletedId !== draft.id : result?.draft?.id !== draft.id || result?.draft?.state !== "ABANDONED") throw new Error("Could not confirm the change. Please retry.");
      setDone(true); setOpen(false);
      if (isDraft) onDeleted?.(draft.id); else onAbandoned?.(result.draft);
      window.dispatchEvent(new Event("dao:participation-updated"));
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Connection interrupted. Please retry."); }
    finally { flight.current = false; setBusy(false); }
  }
  return <div className="submission-lifecycle">
    {done ? <p role="status">{isDraft ? "Draft deleted." : "Proposal abandoned. The event is awaiting a Zcash anchor."}</p> : <button ref={trigger} type="button" className="dao-text-button submission-lifecycle-trigger" disabled={disabled || busy} aria-expanded={open} aria-controls={`${id}-confirm`} onClick={() => { setOpen(!open); setError(""); }}>{isDraft ? "Delete draft" : "Abandon proposal"}</button>}
    {open ? <section id={`${id}-confirm`} className="submission-lifecycle-confirm" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>{isDraft ? "Delete this draft?" : "Abandon this proposal?"}</h3>
      <p>{isDraft ? "Its private text and any unsaved edits will be deleted. This cannot be undone."
        : "Stops further review. Files, comments and prior decisions stay public. This cannot be undone; publication credits are not refunded."}</p>
      {!isDraft ? <><label htmlFor={`${id}-reason`}>Public reason</label><textarea id={`${id}-reason`} value={reason} rows={3} minLength={10} maxLength={1000} disabled={busy} onChange={event => { setReason(event.target.value); requestKey.current = ""; setError(""); }} placeholder="Why are you withdrawing this proposal?" />
        <label className="submission-lifecycle-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} /><span>Publish this reason in the permanent record.</span></label></> : null}
      {error ? <p role="alert" className="dao-error">{error}</p> : null}
      <div className="dao-form-actions"><button type="button" className="dao-button" disabled={busy} onClick={close}>Cancel</button><button type="button" className="dao-button submission-lifecycle-danger" disabled={busy || disabled || (!isDraft && (!consent || !abandonmentReasonSchema.safeParse(reason).success))} onClick={() => void confirm()}>{busy ? "Saving…" : isDraft ? "Delete permanently" : "Confirm abandonment"}</button></div>
    </section> : null}
  </div>;
}

export function AbandonmentNotice({ value, endpoint }: { value: ProposalAbandonment; endpoint: string }) {
  return <aside className="proposal-abandonment" aria-label="Author withdrawal">
    <div><strong>Abandoned by author</strong><time dateTime={value.occurredAt}>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value.occurredAt))} UTC</time></div>
    <p>{value.reason}</p><a className="dao-text-button" href={`${endpoint}/activity/${value.eventId}?download=1`}>Abandonment receipt ↓</a>
  </aside>;
}
