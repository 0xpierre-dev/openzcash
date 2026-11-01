"use client";

import { useEffect, useRef, useState } from "react";
import { FUNDING_QUOTE_SOURCE_URL, formatUsdPerZec, type FundingQuoteHistory, type FundingQuoteView } from "@/lib/domain/funding-quote";
import { formatProposalUsd } from "@/lib/domain/proposal-funding";
import { formatTreasuryZec } from "@/lib/domain/treasury";

function utcTime(value: string) {
  return `${new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "UTC"
  }).format(new Date(value))} UTC`;
}

function utcClock(value: string) {
  return `${new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "UTC" }).format(new Date(value))} UTC`;
}

export function ProposalFundingQuote({ communityId, pollId, usdCents }: { communityId: string; pollId: string; usdCents: string }) {
  const endpoint = `/api/admin/communities/${encodeURIComponent(communityId)}/proposals/${encodeURIComponent(pollId)}/funding-quotes`;
  const [history, setHistory] = useState<FundingQuoteHistory | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [changed, setChanged] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const requestKey = useRef<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to load estimates.");
      if (controller.signal.aborted) return;
      setHistory(data);
      setChanged(data.usdCents !== usdCents);
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load estimates.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, usdCents]);

  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, []);

  async function estimate() {
    if (!history || inFlight.current || changed) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    requestKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        requestKey: requestKey.current, proposalHash: history.proposalHash
      }) });
      const data = await response.json();
      if (!response.ok) {
        if (data.error === "PROPOSAL_CHANGED") setChanged(true);
        throw new Error(data.message || "Unable to fetch a current estimate.");
      }
      const quote = data.quote as FundingQuoteView;
      setHistory({ ...history, quotes: [quote, ...history.quotes.filter((entry) => entry.id !== quote.id)].slice(0, 5) });
      requestKey.current = null;
      setNow(Date.now());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to fetch a current estimate."); }
    finally { inFlight.current = false; setPending(false); }
  }

  const current = history?.quotes.find((quote) => quote.proposalHash === history.proposalHash && quote.usdCents === usdCents);
  const expired = Boolean(current && new Date(current.expiresAt).getTime() <= now);
  const older = history?.quotes.filter((quote) => quote.id !== current?.id) ?? [];

  return <section className="dao-funding-quote" aria-label="ZEC payment estimate" aria-busy={loading || pending}>
    <div className="dao-funding-quote-heading"><h3>Payment estimate</h3>{current ? <span className={expired || changed ? "" : "dao-funding-quote-fresh"}>{changed ? "Outdated" : expired ? "Expired" : "Current"}</span> : null}</div>
    {current ? <>
      <p className="dao-funding-quote-amount">{formatTreasuryZec(current.amountZat)} <span>ZEC</span></p>
      <p className="dao-funding-quote-rate">1 ZEC = {formatUsdPerZec(current.rateUsdPerZecE8)} USD</p>
      <p className="dao-funding-quote-time"><a href={FUNDING_QUOTE_SOURCE_URL} target="_blank" rel="noreferrer">CoinGecko ↗</a><br /><time dateTime={current.quotedAt}>{utcTime(current.quotedAt)}</time></p>
      <p className="dao-funding-quote-validity">{expired ? "Expired at" : "Valid until"} <time dateTime={current.expiresAt} title={utcTime(current.expiresAt)}>{utcClock(current.expiresAt)}</time></p>
    </> : <p className="dao-notice">{loading ? "Loading estimates…" : "Check the ZEC equivalent of this USD request."}</p>}
    {changed ? <p className="dao-error" role="alert">The proposal changed. Reload to estimate its current budget.</p> : null}
    {error && !changed ? <p className="dao-error" role="alert">{error}</p> : null}
    {(!history && !loading) || changed ? <button className="dao-button" type="button" onClick={() => window.location.reload()}>Reload proposal</button> : history?.canEstimate ? <button className="dao-button" type="button" disabled={loading || pending} onClick={estimate}>{pending ? "Getting current price…" : current ? "Refresh estimate" : "Estimate in ZEC"}</button> : null}
    <p className="dao-notice">Indicative only. Network fees excluded.</p>
    {history && history.quotes.length > 0 ? <details className="dao-funding-quote-history"><summary>Quote details{older.length ? ` · ${history.quotes.length} recent` : ""}</summary>
      <p>Rounded up to the nearest zatoshi. Estimates do not authorize or send a payment.</p>
      {current ? <p>Retrieved {utcTime(current.retrievedAt)}. Recorded {utcTime(current.createdAt)}.</p> : null}
      {older.map((quote) => <div className="dao-funding-quote-record" key={quote.id}>
        <strong>{formatTreasuryZec(quote.amountZat)} ZEC</strong>
        <span>{formatProposalUsd(quote.usdCents)} · {formatUsdPerZec(quote.rateUsdPerZecE8)} / ZEC</span>
        <time dateTime={quote.quotedAt}>{utcTime(quote.quotedAt)}</time>
        <span>{quote.proposalHash !== history.proposalHash ? "Previous proposal version" : new Date(quote.expiresAt).getTime() <= now ? "Expired estimate" : "Earlier estimate"} · CoinGecko</span>
      </div>)}
    </details> : null}
  </section>;
}
