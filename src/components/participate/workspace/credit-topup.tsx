"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { parseTreasuryAmountZat } from "@/lib/participate/workspace/domain/treasury";
import type { CreditNetwork, CreditPurchaseStatus, CreditPurchaseView, CreditPurchaseFundingView, CreditPurchasesView } from "@/lib/participate/workspace/domain/credit-purchases";

type CreditTopUpProps = { communityId: string; scopeKind?: "DAO" | "COMMITTEE"; onCreditsChanged: () => void };

const NETWORKS = new Set(["mainnet", "testnet", "regtest"]);
const STATUSES = new Set(["PENDING", "CONFIRMING", "CREDITED", "EXPIRED", "REVIEW"]);
const STATUS_LABELS: Record<CreditPurchaseStatus, string> = {
  PENDING: "Awaiting payment", CONFIRMING: "Confirming", CREDITED: "Credits added", EXPIRED: "Expired", REVIEW: "Needs review"
};
const NETWORK_LABELS: Record<CreditNetwork, string> = { mainnet: "Mainnet", testnet: "Testnet", regtest: "Regtest" };
const ERRORS: Record<string, string> = {
  unauthorized: "Sign in again to view your payment requests.",
  forbidden_origin: "This request could not be verified. Refresh and try again.",
  COMMUNITY_NOT_FOUND: "This credit account is no longer available.",
  CREDIT_ACCOUNT_UNAVAILABLE: "A permanent account is required to buy Zcred.",
  CREDIT_FUNDING_UNAVAILABLE: "The receiving wallet is currently unavailable.",
  CREDIT_PURCHASE_NOT_FOUND: "This payment request is no longer available.",
  CREDIT_PURCHASE_UNAVAILABLE: "Credit purchases are currently unavailable for this account.",
  INVALID_CREDIT_PURCHASE_INPUT: "This payment request could not be created. Refresh and try again.",
  CREDIT_PURCHASE_IDEMPOTENCY_CONFLICT: "This request conflicts with an earlier invoice. Refresh your invoices before continuing.",
  PAYMENT_CHECK_UNAVAILABLE: "Payment confirmation is temporarily unavailable. Try checking again shortly.",
  CREDIT_PAYMENT_PROVIDER_UNAVAILABLE: "The receiving wallet could not be checked. Try again shortly.",
  CREDIT_RECEIVER_UNAVAILABLE: "The receiving wallet is not ready to confirm payments. Try again shortly.",
  CREDIT_PAYMENT_OBSERVER_UNAVAILABLE: "The receiving wallet could not be verified. Payment confirmation is unavailable; try again shortly.",
  CREDIT_PURCHASE_PENDING: "Another invoice is still open. Refresh invoices to view it before creating a new one.",
  CREDIT_ACCOUNT_PAYMENT_REVIEW: "Payments for this credit account need review. Contact the account administrators before paying again.",
  CREDIT_DEMO_ACCOUNT: "Real payments are unavailable for an account that has received demo Zcred.",
  INVALID_PURCHASE_INPUT: "This payment request could not be created. Refresh the payment options and try again.",
  CREDIT_PURCHASE_CONCURRENT_UPDATE: "The payment request changed. Check or refresh its latest status.",
  PARTICIPATION_ACCOUNT_REQUIRED: "Sign in with a permanent account to buy Zcred.",
  CREDIT_PURCHASE_REQUEST_FAILED: "The payment request could not be completed. Retry safely or refresh invoices."
};
const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short"
});
const countFormat = new Intl.NumberFormat("en-US");
const EXPIRED_PAYMENT_DETECTED = "Payment detected. The payment window has closed; check again while it confirms. Do not send again.";

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validPackage(value: unknown): value is Record<string, unknown> & NonNullable<CreditPurchaseFundingView["package"]> {
  if (!object(value) || !Number.isSafeInteger(value.credits) || Number(value.credits) <= 0 || typeof value.amountZat !== "string" || typeof value.amountZec !== "string") return false;
  try { return parseTreasuryAmountZat(value.amountZec) === BigInt(value.amountZat); }
  catch { return false; }
}

function validPurchase(value: unknown, communityId: string): value is CreditPurchaseView {
  return object(value) && validPackage(value) && typeof value.id === "string" && value.id.length > 0
    && value.communityId === communityId && NETWORKS.has(String(value.network)) && STATUSES.has(String(value.status))
    && typeof value.address === "string" && value.address.length > 0 && typeof value.memo === "string" && value.memo.length > 0
    && (typeof value.paymentUri === "string" || value.paymentUri === null)
    && Number.isSafeInteger(value.confirmations) && Number(value.confirmations) >= 0
    && Number.isSafeInteger(value.requiredConfirmations) && Number(value.requiredConfirmations) > 0
    && typeof value.expiresAt === "string" && Number.isFinite(Date.parse(value.expiresAt))
    && typeof value.createdAt === "string" && Number.isFinite(Date.parse(value.createdAt))
    && (typeof value.txid === "string" || value.txid === null)
    && (value.status !== "CREDITED" || (typeof value.txid === "string" && /^[a-f0-9]{64}$/i.test(value.txid)
      && Number(value.confirmations) >= Number(value.requiredConfirmations)));
}

function validPurchases(value: unknown, communityId: string): value is CreditPurchasesView {
  if (!object(value) || !object(value.funding) || !Array.isArray(value.purchases)) return false;
  const funding = value.funding;
  if (funding.preparedReceiver !== undefined && (!object(funding.preparedReceiver)
    || typeof funding.preparedReceiver.operator !== "string" || funding.preparedReceiver.operator.length > 80
    || funding.preparedReceiver.network !== "mainnet" || funding.preparedReceiver.state !== "preparing")) return false;
  return typeof funding.configured === "boolean" && (funding.network === null || NETWORKS.has(String(funding.network)))
    && (funding.package === null || validPackage(funding.package))
    && (!funding.configured || (funding.network !== null && funding.package !== null))
    && value.purchases.every(purchase => validPurchase(purchase, communityId));
}

function newestFirst(purchases: CreditPurchaseView[]) {
  return [...purchases].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function isActive(purchase: CreditPurchaseView, now: number) {
  return purchase.status === "CONFIRMING" || purchase.status === "REVIEW"
    || (purchase.status === "PENDING" && Date.parse(purchase.expiresAt) > now);
}

function payableUri(purchase: CreditPurchaseView) {
  const value = purchase.paymentUri;
  if (typeof value !== "string" || !/^zcash:/i.test(value) || /[\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const uri = new URL(value);
    const params = uri.searchParams;
    if (uri.protocol !== "zcash:" || uri.host || uri.hash || uri.pathname !== purchase.address
      || params.getAll("amount").length !== 1 || params.getAll("memo").length !== 1
      || [...params.keys()].some(key => key !== "amount" && key !== "memo")) return null;
    if (parseTreasuryAmountZat(params.get("amount")!) !== BigInt(purchase.amountZat)) return null;
    const encodedMemo = params.get("memo")!;
    if (!/^[A-Za-z0-9_-]*$/.test(encodedMemo) || encodedMemo.length % 4 === 1) return null;
    const base64 = encodedMemo.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")), char => char.charCodeAt(0));
    if (new TextDecoder("utf-8", { fatal: true }).decode(bytes) !== purchase.memo) return null;
    return value;
  } catch { return null; }
}

export function CreditTopUp(props: CreditTopUpProps) {
  return <CreditTopUpBody key={props.communityId} {...props} />;
}

function CreditTopUpBody({ communityId, scopeKind = "DAO", onCreditsChanged }: CreditTopUpProps) {
  const titleId = useId();
  const ownerLabel = scopeKind === "COMMITTEE" ? "committee" : "DAO";
  const [data, setData] = useState<CreditPurchasesView | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"create" | "check" | null>(null);
  const [retryCreate, setRetryCreate] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [uncertainPaymentId, setUncertainPaymentId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const operation = useRef<"load" | "create" | "check" | null>(null);
  const readSequence = useRef(0);
  const createKey = useRef<string | null>(null);
  const mounted = useRef(true);
  const loadedBefore = useRef(false);
  const knownStatuses = useRef(new Map<string, CreditPurchaseStatus>());
  const callback = useRef(onCreditsChanged);
  const endpoint = `/api/account/credits/purchases?communityId=${encodeURIComponent(communityId)}`;

  useEffect(() => { callback.current = onCreditsChanged; }, [onCreditsChanged]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const recordStatuses = useCallback((purchases: CreditPurchaseView[], notify: boolean) => {
    let changed: "credited" | "review" | null = null;
    for (const purchase of purchases) {
      const previous = knownStatuses.current.get(purchase.id);
      if (notify && purchase.status === "REVIEW" && previous === "CREDITED") changed = "review";
      else if (notify && purchase.status === "CREDITED" && previous !== "CREDITED" && changed !== "review") changed = "credited";
      knownStatuses.current.set(purchase.id, purchase.status);
    }
    if (changed) callback.current();
    return changed;
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (operation.current && operation.current !== "load") return;
    const sequence = ++readSequence.current;
    operation.current = "load";
    let failureMessage = "Payment requests could not be loaded. Refresh invoices to try again.";
    try {
      const response = await fetch(endpoint, { cache: "no-store", ...(signal ? { signal } : {}) });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok || !validPurchases(result, communityId)) {
        const code = object(result) && typeof result.error === "string" ? result.error : "";
        failureMessage = ERRORS[code] ?? failureMessage;
        throw new Error("Payment requests unavailable");
      }
      if (!mounted.current || signal?.aborted || sequence !== readSequence.current) return;
      const purchases = newestFirst(result.purchases);
      const now = Date.now();
      const pending = purchases.find(purchase => isActive(purchase, now));
      setClock(now);
      setData({ ...result, purchases });
      setActionError(null);
      if (pending && createKey.current) { createKey.current = null; setRetryCreate(false); }
      setSelectedId(current => current && purchases.some(purchase => purchase.id === current)
        ? current : (pending ?? purchases[0])?.id ?? null);
      const change = recordStatuses(purchases, loadedBefore.current);
      if (change === "review") setNotice("A previously confirmed payment now needs review.");
      else if (change === "credited") setNotice("Payment confirmed. Your credits have been added.");
      loadedBefore.current = true;
    } catch {
      if (mounted.current && !signal?.aborted && sequence === readSequence.current) setLoadError(failureMessage);
    } finally {
      if (sequence === readSequence.current) {
        operation.current = null;
        if (mounted.current && !signal?.aborted) setLoading(false);
      }
    }
  }, [communityId, endpoint, recordStatuses]);

  function refreshInvoices() {
    if (operation.current) return;
    setLoading(true); setLoadError(null);
    void load();
  }

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) return load(controller.signal);
    });
    return () => controller.abort();
  }, [load]);

  const selected = data?.purchases.find(purchase => purchase.id === selectedId) ?? null;
  const active = data?.purchases.find(purchase => isActive(purchase, clock));
  const expiredLocally = selected?.status === "PENDING" && Date.parse(selected.expiresAt) <= clock;
  const stale = Boolean(loadError);
  const canCreate = Boolean(data?.funding.configured && data.funding.package && !active && !stale && !loading && !busy);
  const nextExpiration = data?.purchases.filter(purchase => purchase.status === "PENDING" && Date.parse(purchase.expiresAt) > clock)
    .reduce((earliest, purchase) => Math.min(earliest, Date.parse(purchase.expiresAt)), Infinity);

  useEffect(() => {
    if (!nextExpiration || !Number.isFinite(nextExpiration)) return;
    const timer = window.setTimeout(() => setClock(Date.now()), Math.min(Math.max(0, nextExpiration - Date.now()) + 30, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [nextExpiration, clock]);

  function acceptPurchase(purchase: CreditPurchaseView) {
    setData(current => current ? { ...current, purchases: newestFirst([purchase, ...current.purchases.filter(item => item.id !== purchase.id)]) } : current);
    setSelectedId(purchase.id);
    setClock(Date.now());
    setUncertainPaymentId(null);
    recordStatuses([purchase], true);
  }

  async function createInvoice() {
    if (operation.current || !canCreate) return;
    createKey.current ??= crypto.randomUUID();
    operation.current = "create";
    setBusy("create"); setActionError(null); setNotice(null);
    try {
      const response = await fetch("/api/account/credits/purchases", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ communityId, requestKey: createKey.current })
      });
      const result: unknown = await response.json().catch(() => null);
      if (!mounted.current) return;
      if (!response.ok || !object(result) || !validPurchase(result.purchase, communityId)) {
        const code = object(result) && typeof result.error === "string" ? result.error : "";
        if (code === "CREDIT_PURCHASE_PENDING") {
          setLoadError(ERRORS[code]); setRetryCreate(false);
          return;
        }
        setActionError(ERRORS[code] ?? "The invoice could not be created. Retry to recover the same request.");
        setRetryCreate(true);
        return;
      }
      acceptPurchase(result.purchase);
      createKey.current = null;
      setRetryCreate(false);
      setNotice(result.purchase.status === "CREDITED" ? "Payment confirmed. Your credits have been added."
        : result.purchase.status === "CONFIRMING" ? "Payment detected. Waiting for the required confirmations."
          : result.purchase.status === "REVIEW" ? "This payment needs administrator review."
            : result.purchase.status === "EXPIRED" ? result.purchase.txid ? EXPIRED_PAYMENT_DETECTED : "This invoice has expired. Create a new invoice before paying."
              : "Invoice ready. Review its details before opening your wallet.");
    } catch {
      if (mounted.current) {
        setRetryCreate(true);
        setActionError("The connection was interrupted. Retry to recover the same invoice; no payment is sent here.");
      }
    } finally {
      operation.current = null;
      if (mounted.current) setBusy(null);
    }
  }

  async function checkPayment() {
    if (operation.current || !selected) return;
    operation.current = "check";
    setBusy("check"); setActionError(null); setNotice(null);
    try {
      const response = await fetch(`/api/account/credits/purchases/${encodeURIComponent(selected.id)}/check`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({})
      });
      const result: unknown = await response.json().catch(() => null);
      if (!mounted.current) return;
      if (!response.ok || !object(result) || !validPurchase(result.purchase, communityId) || result.purchase.id !== selected.id) {
        const code = object(result) && typeof result.error === "string" ? result.error : "";
        setActionError(ERRORS[code] ?? "Payment status could not be checked. Try Check payment again.");
        setUncertainPaymentId(selected.id);
        return;
      }
      acceptPurchase(result.purchase);
      setNotice(result.purchase.status === "CREDITED" ? "Payment confirmed. Your credits have been added."
        : result.purchase.status === "CONFIRMING" ? "Payment detected. Waiting for the required confirmations."
          : result.purchase.status === "PENDING" ? "Payment has not been confirmed yet."
            : result.purchase.status === "REVIEW" ? "This payment needs administrator review."
              : result.purchase.txid ? EXPIRED_PAYMENT_DETECTED : "This invoice has expired. No credits have been confirmed for it.");
    } catch {
      if (mounted.current) {
        setUncertainPaymentId(selected.id);
        setActionError("The connection was interrupted. Payment confirmation is unavailable. Check again to recover the latest status.");
      }
    } finally {
      operation.current = null;
      if (mounted.current) setBusy(null);
    }
  }

  function selectInvoice(id: string) {
    if (operation.current) return;
    setSelectedId(id); setActionError(null); setNotice(null); setClock(Date.now());
  }

  // An unavailable top-up with no invoices is secondary. Keep live payment
  // requests and failures outside this disclosure so they remain actionable.
  if (data && !data.funding.configured && data.purchases.length === 0 && !loading && !loadError && !actionError) {
    return <details className="dao-credit-section dao-topup-unavailable-details"><summary>Add credits <span>{data.funding.preparedReceiver ? "Preparing" : "Unavailable"}</span></summary>{data.funding.preparedReceiver ? <><p><strong>1 Zcred = $0.25</strong> · Paid in ZEC</p><p>Recipient: {data.funding.preparedReceiver.operator}. The Zallet receiving wallet is being prepared; purchases are not open.</p><p>Your exact ZEC amount and payment memo will appear on an invoice.</p></> : <p>This {ownerLabel} has not connected its receiving wallet yet.</p>}<button type="button" className="dao-text-button" aria-label="Refresh invoices" onClick={refreshInvoices}>Check again</button></details>;
  }

  return <section className="dao-topup" aria-labelledby={titleId}>
    <div className="dao-topup-heading">
      <h3 id={titleId}>Add credits</h3>
      <button type="button" className="dao-topup-refresh" aria-label="Refresh invoices" title="Refresh invoices" disabled={loading || Boolean(busy)} onClick={refreshInvoices}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 7a7 7 0 0 1 11.5-1.5L20 8M4 16l2.4 2.5A7 7 0 0 0 17.9 17" /></svg>
      </button>
    </div>
    {loading ? <p className="dao-topup-loading" role="status">Loading payment requests…</p> : null}
    {loadError ? <p className="dao-topup-error" role="alert">{loadError}{data ? " Previous details may be out of date. Refresh before paying." : ""}</p> : null}
    {data ? <>
      {!data.funding.configured ? <p className="dao-topup-unavailable">This {ownerLabel} has not connected its receiving wallet yet.</p> : null}
      {data.funding.configured && data.funding.package && !active ? <div className="dao-topup-package">
        <div><strong>{countFormat.format(data.funding.package.credits)} Zcred</strong><p>{data.funding.package.amountZec} ZEC <span>· {data.funding.network ? NETWORK_LABELS[data.funding.network] : ""}</span></p></div>
        <button className="dao-button" type="button" disabled={!canCreate} onClick={createInvoice}>{busy === "create" ? "Creating invoice…" : retryCreate ? "Retry invoice" : "Create invoice"}</button>
      </div> : null}
      {active && selected?.id !== active.id ? <button className="dao-topup-return" type="button" disabled={loading || Boolean(busy)} onClick={() => selectInvoice(active.id)}>View active invoice</button> : null}
      {selected ? <InvoiceDetails key={selected.id} purchase={selected} expiredLocally={expiredLocally} stale={stale || loading} paymentUncertain={uncertainPaymentId === selected.id} busy={busy} canPay={Boolean(data.funding.configured)} onCheck={checkPayment} onExpired={() => setClock(Date.now())} /> : null}
      {data.purchases.length > 1 ? <details className="dao-topup-history">
        <summary>Recent invoices <span>{data.purchases.length}</span></summary>
        <ul>{data.purchases.slice(0, 5).map(purchase => <li key={purchase.id}>
          <button type="button" aria-pressed={selected?.id === purchase.id} disabled={loading || Boolean(busy)} onClick={() => selectInvoice(purchase.id)}>
            <span><strong>{countFormat.format(purchase.credits)} Zcred</strong><time dateTime={purchase.createdAt}>{dateFormat.format(new Date(purchase.createdAt))}</time></span>
            <span className={`dao-topup-history-status dao-topup-history-status--${purchase.status.toLowerCase()}`}>{STATUS_LABELS[purchase.status]}</span>
          </button>
        </li>)}</ul>
      </details> : null}
    </> : null}
    {actionError ? <p className="dao-topup-error" role="alert">{actionError}</p> : null}
    {notice ? <p className="dao-topup-notice" role="status">{notice}</p> : null}
  </section>;
}

function InvoiceDetails({ purchase, expiredLocally, stale, paymentUncertain, busy, canPay, onCheck, onExpired }: {
  purchase: CreditPurchaseView;
  expiredLocally: boolean;
  stale: boolean;
  paymentUncertain: boolean;
  busy: "create" | "check" | null;
  canPay: boolean;
  onCheck: () => void;
  onExpired: () => void;
}) {
  const status = expiredLocally ? "EXPIRED" : purchase.status;
  const expiredPaymentDetected = status === "EXPIRED" && purchase.txid !== null;
  const uri = payableUri(purchase);
  const canReceivePayment = canPay && status === "PENDING" && !stale && !paymentUncertain && Boolean(uri);
  const walletEnabled = canReceivePayment && !busy;
  return <section className="dao-topup-invoice" aria-label="Payment request">
    <div className="dao-topup-invoice-heading"><span className={`dao-topup-status dao-topup-status--${status.toLowerCase()}`}>{STATUS_LABELS[status]}</span><span className="dao-topup-network">{NETWORK_LABELS[purchase.network]}</span></div>
    <div className="dao-topup-amount"><strong>{purchase.amountZec} <span>ZEC</span></strong><span>for {countFormat.format(purchase.credits)} Zcred</span></div>
    <p className="dao-topup-instructions">{paymentUncertain ? "Payment status is unavailable. Check again before sending a payment."
      : status === "CREDITED" ? "Your payment is confirmed and these credits have been added."
      : status === "CONFIRMING" ? "Payment detected. Wait for confirmation; do not send again."
        : status === "EXPIRED" ? expiredPaymentDetected ? EXPIRED_PAYMENT_DETECTED : "This invoice is no longer payable. Check payment if you already sent funds."
          : status === "REVIEW" ? "This payment needs administrator review. Share the invoice and transaction IDs below."
            : !canReceivePayment ? "This invoice is not currently payable. Refresh invoices before sending a payment."
              : "Send this exact amount with the memo below from your Zcash wallet."}</p>
    {status === "CONFIRMING" || status === "CREDITED" || (expiredPaymentDetected && purchase.confirmations > 0) ? <p className="dao-topup-confirmations">{countFormat.format(purchase.confirmations)} / {countFormat.format(purchase.requiredConfirmations)} confirmations</p> : null}
    <p className="dao-topup-expiry">{status === "PENDING" ? "Pay before" : "Invoice expires"} <time dateTime={purchase.expiresAt}>{dateFormat.format(new Date(purchase.expiresAt))}</time></p>
    {walletEnabled && uri ? <InvoiceQr key={uri} uri={uri} /> : null}
    <div className="dao-topup-actions">
      {walletEnabled && uri ? <a className="dao-button dao-button--primary" href={uri} onClick={event => {
        if (Date.parse(purchase.expiresAt) <= Date.now()) { event.preventDefault(); onExpired(); }
      }}>Open wallet <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14" /></svg></a> : null}
      <button type="button" className="dao-button" disabled={Boolean(busy) || stale} onClick={onCheck}>{busy === "check" ? "Checking payment…" : "Check payment"}</button>
    </div>
    <details className="dao-topup-payment-details" open={canReceivePayment}>
      <summary>{status === "PENDING" ? "Payment details" : "Invoice details"}</summary>
      <CopyValue label="Receiving address" action="Copy address" value={purchase.address} />
      <CopyValue label="Payment memo" action="Copy memo" value={purchase.memo} />
      {status === "PENDING" ? <p className="dao-topup-memo-hint">Keep the memo exactly as shown so your payment can be matched.</p> : null}
      {purchase.txid ? <CopyValue label="Transaction ID" action="Copy transaction ID" value={purchase.txid} /> : null}
      <dl className="dao-topup-reference"><div><dt>Invoice ID</dt><dd>{purchase.id}</dd></div><div><dt>Created</dt><dd><time dateTime={purchase.createdAt}>{dateFormat.format(new Date(purchase.createdAt))}</time></dd></div></dl>
    </details>
  </section>;
}

function InvoiceQr({ uri }: { uri: string }) {
  const [image, setImage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(uri).then(value => {
      if (active) setImage(value);
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, [uri]);
  if (failed) return <p className="dao-topup-qr-fallback">QR unavailable. Open your wallet or use the payment details below.</p>;
  return <figure className="dao-topup-qr">
    {image ? <Image src={image} width={180} height={180} unoptimized alt="QR code for this Zcash payment request" /> : <span role="status">Preparing payment QR…</span>}
    <figcaption>Scan with your Zcash wallet</figcaption>
  </figure>;
}

function CopyValue({ label, action, value }: { label: string; action: string; value: string }) {
  const id = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const [message, setMessage] = useState("");
  async function copy() {
    setMessage("");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setMessage("Copied.");
    } catch {
      field.current?.focus(); field.current?.select();
      setMessage("Select and copy this value manually.");
    }
  }
  return <div className="dao-topup-copy-field">
    <div><label htmlFor={id}>{label}</label><button type="button" className="dao-topup-copy" onClick={copy}>{action}</button></div>
    <textarea id={id} ref={field} readOnly rows={2} value={value} spellCheck={false} />
    {message ? <span className="dao-topup-copy-message" role="status">{message}</span> : null}
  </div>;
}
