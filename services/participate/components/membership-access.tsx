"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceSignInButton } from "@/components/workspace-auth";
import { membershipErrorMessage } from "@/lib/domain/account-membership";
import type { MembershipRequestView, MyMembershipView } from "@/lib/services/account-membership";

export function MembershipAccess({ communityId, signedIn, nick, initial }: { communityId: string; signedIn: boolean; nick?: string; initial: MyMembershipView | null }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [observedAt, setObservedAt] = useState(() => Date.now());
  const flight = useRef(false);
  const requestKey = useRef<string | null>(null);
  const base = `/communities/${encodeURIComponent(communityId)}`;
  const active = state?.memberStatus === "ACTIVE";
  const pending = state?.request && ["PENDING", "PROPOSED"].includes(state.request.status);
  const retryAt = state?.canRequestAt ? new Date(state.canRequestAt) : null;
  const remainingCooldown = retryAt ? +retryAt - observedAt : 0;
  const cooling = remainingCooldown > 0;
  useEffect(() => {
    if (remainingCooldown <= 0) return;
    const timer = window.setTimeout(() => setObservedAt(Date.now()), Math.min(remainingCooldown, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [remainingCooldown]);

  async function send(operation: "request" | "withdraw") {
    if (flight.current || uncertain) return;
    flight.current = true; setBusy(true); setError("");
    requestKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch(`/api/communities/${encodeURIComponent(communityId)}/membership`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation, requestId: operation === "request" ? requestKey.current : state?.request?.id }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) { if (response.status >= 500) setUncertain(true); setError(membershipErrorMessage(result?.error)); return; }
      if (operation === "request" && result?.request?.id) setState({ memberStatus: state?.memberStatus ?? null, request: result.request, canRequestAt: null });
      else if (operation === "withdraw" && result?.status === "WITHDRAWN" && state?.request) setState({ ...state, request: { ...state.request, status: "WITHDRAWN" }, canRequestAt: new Date(Date.now() + 86_400_000).toISOString() });
      else { setUncertain(true); setError(membershipErrorMessage()); }
      setConfirmWithdraw(false); router.refresh();
    } catch { setUncertain(true); setError("Connection interrupted. Refresh to check whether your request was saved."); }
    finally { flight.current = false; setBusy(false); }
  }
  return <section className="dao-panel dao-membership-access" aria-busy={busy}>
    <span className="dao-membership-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3m4-12v6m-3-3h6" /></svg></span>
    <p className="dao-eyebrow">Your membership</p>
    <h2>{active ? "You’re a member" : pending ? state?.request?.status === "PROPOSED" ? "Awaiting a community vote" : "Request received" : "Join this DAO"}</h2>
    <p>{active ? "Your account is included in new voting rosters. Open a proposal to participate." : pending ? state?.request?.status === "PROPOSED" ? "A membership proposal has been prepared. Admission requires an approved, finalized result." : "The leaders can now review your request and propose your admission." : "Request membership with your account. The community decides who joins."}</p>
    {nick ? <div className="dao-account-identity"><span className="dao-member-avatar" aria-hidden="true">{Array.from(nick)[0]?.toUpperCase()}</span><div><strong>{nick}</strong><span>account</span></div></div> : null}
    {!signedIn ? <WorkspaceSignInButton next={`${base}/join`} label="Sign in to request membership" className="dao-button dao-button--primary" />
      : active ? <Link href={`${base}/dao`} className="dao-button dao-button--primary">View proposals</Link>
      : pending ? <div className="dao-form-actions">{confirmWithdraw ? <><button type="button" disabled={busy || uncertain} className="dao-button dao-button--danger" onClick={() => void send("withdraw")}>Confirm withdrawal</button><button type="button" className="dao-button dao-button--quiet" disabled={busy} onClick={() => setConfirmWithdraw(false)}>Keep request</button></> : <button type="button" className="dao-button dao-button--quiet" disabled={busy || uncertain} onClick={() => setConfirmWithdraw(true)}>Withdraw request</button>}</div>
      : <><p className="dao-field-hint">{state?.request?.status === "DECLINED" ? "Your previous request was declined. " : state?.request?.status === "WITHDRAWN" ? "You withdrew your previous request. " : state?.memberStatus === "REMOVED" ? "You are no longer on the active roster. " : ""}{cooling && retryAt ? `You can request again after ${retryAt.toLocaleString("en-US", { timeZone: "UTC" })} UTC.` : "Your account name is shared with the community leaders when you request membership."}</p><button type="button" className="dao-button dao-button--primary" disabled={busy || Boolean(cooling) || uncertain} onClick={() => void send("request")}>{busy ? "Sending…" : "Request membership"}</button></>}
    {pending && !confirmWithdraw ? <p role="status" className="dao-field-hint">{state?.request?.status === "PROPOSED" ? "Proposed · Not a member yet" : "Pending review · Not a member yet"}</p> : null}
    {confirmWithdraw ? <p className="dao-field-hint">Withdrawing cancels this request, including admission from its proposal. You can reapply after 24 hours.</p> : null}
    {error ? <p role="alert" className="dao-error">{error}</p> : null}
    {uncertain ? <button type="button" className="dao-button dao-button--quiet" onClick={() => window.location.reload()}>Refresh status</button> : null}
    <details className="dao-rule-details"><summary>How access works</summary><p>Use your passkey or password to sign in to the same account. Membership gives that account access to future community ballots; it does not grant administrator permissions.</p><p>Signal and ZcashNames are not required. A ZcashName is not a verified identity here yet.</p></details>
  </section>;
}

export function MembershipRequestList({ communityId, requests }: { communityId: string; requests: MembershipRequestView[] }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const flight = useRef(false);
  async function decline(id: string) {
    if (flight.current) return;
    flight.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/communities/${encodeURIComponent(communityId)}/membership`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "decline", requestId: id }) });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.status !== "DECLINED") setError(membershipErrorMessage(result?.error));
      else { setConfirm(null); router.refresh(); }
    } catch { setError(membershipErrorMessage()); }
    finally { flight.current = false; setBusy(false); }
  }
  return <section className="dao-membership-requests" aria-label="Membership requests" aria-busy={busy}>
    <div className="dao-section-heading"><div><h2>Requests <span className="dao-request-count">{requests.length}</span></h2><p>Review accounts that want to join.</p></div><CopyJoinLink communityId={communityId} /></div>
    {!requests.length ? <p className="dao-notice">No pending requests. Share the membership page to invite people to apply.</p> : <ul className="dao-request-list">{requests.map(request => <li key={request.id}>
      <div className="dao-account-identity"><span className="dao-member-avatar" aria-hidden="true">{Array.from(request.nick)[0]?.toUpperCase()}</span><div><strong>{request.nick}</strong><span>{request.status === "PROPOSED" ? "Proposal prepared" : "Pending review"} · {new Date(request.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</span></div></div>
      <div className="dao-form-actions">{request.status === "PROPOSED" && request.proposalId ? <Link className="dao-button dao-button--quiet" href={`/communities/${encodeURIComponent(communityId)}/proposals/${encodeURIComponent(request.proposalId)}`}>View proposal ↗</Link> : <><Link className="dao-button" href={`/communities/${encodeURIComponent(communityId)}/members/change?request=${encodeURIComponent(request.id)}`}>Review for admission</Link><button type="button" className={`dao-button ${confirm === request.id ? "dao-button--danger" : "dao-button--quiet"}`} disabled={busy} onClick={() => confirm === request.id ? void decline(request.id) : setConfirm(request.id)}>{confirm === request.id ? "Confirm decline" : "Decline"}</button>{confirm === request.id ? <button className="dao-button dao-button--quiet" type="button" onClick={() => setConfirm(null)} disabled={busy}>Cancel</button> : null}</>}</div>
    </li>)}</ul>}{error ? <p className="dao-error" role="alert">{error}</p> : null}
  </section>;
}

export function CopyJoinLink({ communityId }: { communityId: string }) {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState("");
  async function copy() {
    const link = `${window.location.origin}/communities/${encodeURIComponent(communityId)}/join`;
    try { await navigator.clipboard.writeText(link); setCopied(true); }
    catch { setFallback(link); }
  }
  return <div className="dao-copy-join"><button type="button" className="dao-button dao-button--quiet" onClick={() => void copy()}>{copied ? "Link copied" : "Copy membership link"}</button>{copied ? <span className="dao-sr-only" role="status">Membership link copied</span> : null}{fallback ? <label className="dao-field">Membership link<input value={fallback} readOnly onFocus={event => event.target.select()} /></label> : null}</div>;
}

export function AccountRosterSetup({ communityId, nick, requests }: { communityId: string; nick: string; requests: MembershipRequestView[] }) {
  const router = useRouter();
  const [includeSelf, setIncludeSelf] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const flight = useRef(false);
  async function initialize() {
    if (flight.current || saved) return;
    flight.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/communities/${encodeURIComponent(communityId)}/membership`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "initialize", includeSelf, requestIds: selected }) });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.count) setError(membershipErrorMessage(result?.error));
      else { setSaved(true); router.refresh(); }
    } catch { setError(membershipErrorMessage()); }
    finally { flight.current = false; setBusy(false); }
  }
  return <section className="dao-panel dao-form" aria-busy={busy}><h2>Start your voting roster</h2><p>Select accounts for this one-time setup. Later changes require a community vote.</p><label className="dao-roster-check"><input type="checkbox" checked={includeSelf} disabled={busy || saved} onChange={event => setIncludeSelf(event.target.checked)} /><span><strong>{nick}</strong> · My account</span></label>{requests.filter(request => request.status === "PENDING" && request.nick !== nick).map(request => <label className="dao-roster-check" key={request.id}><input type="checkbox" checked={selected.includes(request.id)} disabled={busy || saved} onChange={event => setSelected(current => event.target.checked ? [...current, request.id] : current.filter(id => id !== request.id))} /><span>{request.nick}</span></label>)}<div className="dao-form-actions"><button type="button" className="dao-button dao-button--primary" disabled={busy || saved || (!includeSelf && !selected.length)} onClick={() => void initialize()}>{busy ? "Creating roster…" : "Create initial roster"}</button></div>{error ? <p className="dao-error" role="alert">{error}</p> : null}{saved ? <p role="status" className="dao-notice">Roster created.</p> : null}<p className="dao-field-hint">Only the owner can complete initial setup. Accounts keep their existing administrator permissions.</p></section>;
}
