"use client";

import { useEffect, useRef, useState } from "react";
import { collectionReasons, type CollectionCheckHistory, type CollectionCheckView } from "@/lib/domain/poll-collection";

const formatTime = (value: string) => `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(new Date(value))} UTC`;
const formatNumber = (value: number) => new Intl.NumberFormat("en-US").format(value);
function checkLabel(check: CollectionCheckView) {
  return check.status === "OBSERVED" ? "Snapshot recorded" : check.status === "RUNNING" && +new Date(check.leaseExpiresAt) > Date.now() ? "Checking history" : "Needs attention";
}

export function ProposalCollectionCheck({ communityId, pollId }: { communityId: string; pollId: string }) {
  const endpoint = `/api/admin/communities/${encodeURIComponent(communityId)}/proposals/${encodeURIComponent(pollId)}/collection-checks`;
  const [history, setHistory] = useState<CollectionCheckHistory | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const requestKey = useRef<string | null>(null);
  const inFlight = useRef(false);
  const latest = history?.checks[0];
  const running = latest?.status === "RUNNING" && +new Date(latest.leaseExpiresAt) > now;

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Unable to load verification history.");
        if (!controller.signal.aborted) { setHistory(data); setError(""); }
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load verification history."); }
    };
    void load();
    const timer = running ? window.setInterval(() => void load(), 3000) : undefined;
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [endpoint, running]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function checkHistory() {
    if (inFlight.current || !history?.canCheck) return;
    inFlight.current = true; setBusy(true); setError("");
    requestKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestKey: requestKey.current }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "The check could not finish. Try again.");
      const check = data.check as CollectionCheckView;
      setHistory(current => current ? { ...current, checks: [check, ...current.checks.filter(row => row.id !== check.id)].slice(0, 5) } : current);
      requestKey.current = null; setNow(Date.now());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The check could not finish. Try again."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  const interrupted = latest?.status === "RUNNING" && !running;
  const reason = interrupted ? "CHECK_INTERRUPTED" : latest?.reason;
  const coolingDown = latest && +new Date(latest.leaseExpiresAt) > now;
  return <section className="dao-collection-check" aria-label="Tally verification" aria-busy={busy || running}>
    <div className="dao-collection-heading"><h3>Tally verification</h3><span className="dao-status dao-status--closed">Pending</span></div>
    <p className="dao-collection-state" role="status">{busy || running ? "Checking wallet history…" : latest?.status === "OBSERVED" ? "Wallet snapshot recorded" : latest ? "Collection needs attention" : "Awaiting collection check"}</p>
    <p className="dao-notice">{reason ? collectionReasons[reason] : latest?.status === "OBSERVED" ? "Voting rules and a verified cutoff are still required to finalize this tally." : "Verify the collector’s history after the voting window closes."}</p>
    {latest?.finishedAt ? <p className="dao-collection-time">Last check <time dateTime={latest.finishedAt}>{formatTime(latest.finishedAt)}</time></p> : null}
    {error ? <p className="dao-error" role="alert">{error}</p> : null}
    {history?.canCheck ? <button className="dao-button" type="button" disabled={busy || running || Boolean(coolingDown)} onClick={checkHistory}>{busy || running ? "Checking…" : coolingDown ? "Check again shortly" : "Check collection"}</button> : !history && error ? <button className="dao-button" type="button" onClick={() => window.location.reload()}>Reload proposal</button> : null}
    {latest ? <details className="dao-collection-details"><summary>Verification details</summary>
      <p>Read-only wallet snapshots. Ballot outputs still need cutoff, confirmation and eligibility checks before they become counted votes.</p>
      {latest.status === "OBSERVED" ? <dl>
        <div><dt>Network</dt><dd>{latest.network}</dd></div>
        <div><dt>Scanned block</dt><dd>{formatNumber(latest.scannedHeight!)}</dd></div>
        <div><dt>Wallet transactions</dt><dd>{formatNumber(latest.transactionCount!)}</dd></div>
        <div><dt>Ballot outputs</dt><dd>{formatNumber(latest.outputCount!)}</dd></div>
      </dl> : null}
      {history!.checks.map(check => <div className="dao-collection-record" key={check.id}><strong>{checkLabel(check)}</strong><time dateTime={check.startedAt}>{formatTime(check.startedAt)}</time></div>)}
    </details> : null}
  </section>;
}
