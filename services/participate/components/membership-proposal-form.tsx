"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { DEFAULT_PASSING_THRESHOLD_PERCENT, DEFAULT_QUORUM_PERCENT } from "@/lib/domain/governance";
import { MIN_POLL_WINDOW_MS } from "@/lib/domain/poll-window";
import { parsePollUtcInput } from "@/lib/domain/poll-form";
import { membershipErrorMessage } from "@/lib/domain/account-membership";
import { CopyJoinLink } from "@/components/membership-access";
import type { MembershipRequestView } from "@/lib/services/account-membership";

type Member = { id: string; nick: string };
type Field = "request" | "member" | "question" | "opens" | "closes";

export function MembershipProposalForm({ communityId, members, requests = [], initialRequestId = "" }: { communityId: string; members: Member[]; requests?: MembershipRequestView[]; initialRequestId?: string }) {
  const router = useRouter();
  const id = useId();
  const flight = useRef(false);
  const requestKey = useRef<string | null>(null);
  const [action, setAction] = useState<"ADD_MEMBER" | "REMOVE_MEMBER">("ADD_MEMBER");
  const pendingRequests = requests.filter(request => request.status === "PENDING");
  const [request, setRequest] = useState(pendingRequests.some(item => item.id === initialRequestId) ? initialRequestId : "");
  const [member, setMember] = useState("");
  const [question, setQuestion] = useState("");
  const [opens, setOpens] = useState("");
  const [closes, setCloses] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const base = `/communities/${encodeURIComponent(communityId)}`;

  const fieldProps = (field: Field) => ({
    id: `${id}-${field}`,
    "aria-invalid": Boolean(errors[field]),
    "aria-describedby": errors[field] ? `${id}-${field}-error` : undefined
  });
  const fieldError = (field: Field) => errors[field]
    ? <p id={`${id}-${field}-error`} className="dao-field-error">{errors[field]}</p> : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (flight.current || uncertain || members.length === 0) return;
    const opensAt = parsePollUtcInput(opens);
    const closesAt = parsePollUtcInput(closes);
    const nextErrors: Partial<Record<Field, string>> = {};
    if (action === "ADD_MEMBER") {
      if (!pendingRequests.some(item => item.id === request)) nextErrors.request = "Choose a pending membership request.";
    } else if (!members.some(item => item.id === member)) nextErrors.member = "Choose an active member.";
    if (question.trim().length < 12) nextErrors.question = "Describe the decision in at least 12 characters.";
    if (!opensAt) nextErrors.opens = "Enter a valid opening date and time in UTC.";
    if (!closesAt) nextErrors.closes = "Enter a valid closing date and time in UTC.";
    else if (opensAt && Date.parse(closesAt) - Date.parse(opensAt) < MIN_POLL_WINDOW_MS) nextErrors.closes = "Allow at least 24 hours for voting.";
    setErrors(nextErrors);
    setError(null);
    if (Object.keys(nextErrors).length) {
      setError("Check the highlighted fields.");
      const field = Object.keys(nextErrors)[0] as Field;
      event.currentTarget.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[id="${id}-${field}"]`)?.focus();
      return;
    }
    requestKey.current ??= crypto.randomUUID();
    const proposal = { requestKey: requestKey.current, question: question.trim(), opensAt: opensAt!, closesAt: closesAt!,
      action: action === "ADD_MEMBER" ? { type: action, requestId: request } : { type: action, targetMemberId: member } };
    flight.current = true;
    setBusy(true);
    let saved = false;
    try {
      const response = await fetch(`/api/communities/${encodeURIComponent(communityId)}/membership`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "propose", proposal }) });
      const result = await response.json().catch(() => null) as { pollId?: string; error?: string } | null;
      if (response.ok && typeof result?.pollId === "string" && result.pollId) {
        saved = true;
        router.push(`${base}/proposals/${encodeURIComponent(result.pollId)}`);
        router.refresh();
      } else if (response.status >= 500 || response.ok) {
        setUncertain(true);
        setError("We could not confirm whether the draft was saved. Check your proposals before creating another.");
      } else {
        setError(membershipErrorMessage(result?.error));
      }
    } catch {
      setUncertain(true);
      setError("Connection interrupted. The draft may have been saved. Check your proposals before creating another.");
    } finally {
      if (!saved) { flight.current = false; setBusy(false); }
    }
  }

  if (!members.length) return <section className="dao-panel"><h2>No active members</h2><p className="dao-notice">Membership proposals need an active voting roster. A removed roster cannot be reset through initial setup.</p><Link className="dao-button" href={`${base}/members`}>Back to members</Link></section>;

  return <div className="dao-membership-grid">
    <form className="dao-panel dao-form dao-membership-form" onSubmit={submit} noValidate aria-busy={busy}>
      <fieldset disabled={busy || uncertain}>
        <legend>Membership change</legend>
        <div className="dao-choice-tabs" role="group" aria-label="Membership change">
          <button type="button" aria-pressed={action === "ADD_MEMBER"} onClick={() => { setAction("ADD_MEMBER"); setErrors({}); setError(null); }}>Add member</button>
          <button type="button" aria-pressed={action === "REMOVE_MEMBER"} onClick={() => { setAction("REMOVE_MEMBER"); setErrors({}); setError(null); }}>Remove member</button>
        </div>
        {action === "ADD_MEMBER" ? <div className="dao-field">
          <label htmlFor={`${id}-request`}>Membership request</label><select {...fieldProps("request")} value={request} onChange={event => setRequest(event.target.value)} required disabled={!pendingRequests.length || busy || uncertain}><option value="" disabled>{pendingRequests.length ? "Select an applicant" : "No pending requests"}</option>{pendingRequests.map(item => <option key={item.id} value={item.id}>{item.nick}</option>)}</select>{fieldError("request")}
          <p>{pendingRequests.length ? "This person requested membership while signed in to their account." : "Share the membership page so people can apply with their own account."}</p><CopyJoinLink communityId={communityId} />
        </div> : <div className="dao-field"><label htmlFor={`${id}-member`}>Member to remove</label><select {...fieldProps("member")} value={member} onChange={e => setMember(e.target.value)} required><option value="" disabled>Select an active member</option>{members.map(item => <option key={item.id} value={item.id}>{item.nick}</option>)}</select>{fieldError("member")}<p>Removal affects future voting rosters. Existing ballot access stays unchanged.</p></div>}
        <div className="dao-field"><label htmlFor={`${id}-question`}>Proposal question</label><textarea {...fieldProps("question")} value={question} onChange={e => setQuestion(e.target.value)} rows={3} minLength={12} maxLength={200} placeholder={action === "ADD_MEMBER" ? "Should we add this member to our community?" : "Should we remove this member from the active roster?"} required />{fieldError("question")}</div>
        <div className="dao-field-row">
          <div className="dao-field"><label htmlFor={`${id}-opens`}>Voting opens · UTC</label><input {...fieldProps("opens")} type="datetime-local" value={opens} onChange={e => setOpens(e.target.value)} required />{fieldError("opens")}</div>
          <div className="dao-field"><label htmlFor={`${id}-closes`}>Voting closes · UTC</label><input {...fieldProps("closes")} type="datetime-local" value={closes} onChange={e => setCloses(e.target.value)} required />{fieldError("closes")}</div>
        </div>
        <p className="dao-field-hint">At least 24 hours. All voting dates use UTC.</p>
      </fieldset>
      {error ? <div role="alert" className="dao-error">{error}</div> : null}
      <div className="dao-form-actions">
        {uncertain ? <Link className="dao-button dao-button--primary" href={`${base}/dao`}>Check proposals</Link> : <button type="submit" className="dao-button dao-button--primary" disabled={busy || (action === "ADD_MEMBER" && !pendingRequests.length)}>{busy ? "Saving draft…" : "Save proposal draft"}</button>}
        <Link className="dao-button dao-button--quiet" href={`${base}/members`}>Back to members</Link>
      </div>
      <p className="dao-field-hint">Saving creates a draft. It does not change membership or send invitations.</p>
    </form>
    <aside className="dao-panel dao-membership-rules" aria-label="Membership rules">
      <p className="dao-eyebrow">Current rules</p><h2>Community vote</h2>
      <dl><div><dt>Eligible now</dt><dd>{members.length} {members.length === 1 ? "member" : "members"}</dd></div><div><dt>Quorum</dt><dd>At least {DEFAULT_QUORUM_PERCENT}%</dd></div><div><dt>Approval</dt><dd>At least {DEFAULT_PASSING_THRESHOLD_PERCENT}%</dd></div></dl>
      <p className="dao-field-hint">Approve · Reject · Abstain. Abstentions count toward quorum and the approval denominator.</p>
      <details className="dao-rule-details"><summary>How membership works</summary><p>The active roster is copied when the draft is saved. An admission is tied to the applicant’s account and request. Passkey sign-in does not grant membership.</p><p>A member is added or removed only after an approved, finalized result. Verified finalization is still in development. Leader-managed membership and ZcashNames verification are not available yet.</p></details>
    </aside>
  </div>;
}
