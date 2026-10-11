"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { parseTreasuryAmountZat, type CommunityTreasuryView, type TreasuryKindValue } from "@/lib/participate/workspace/domain/treasury";

export type TreasuryActionsProps = {
  communityId: string;
  treasuryKind: TreasuryKindValue;
  canManage: boolean;
  onUpdated?: (treasuries: CommunityTreasuryView) => void;
};

const ERRORS: Record<string, string> = {
  unauthorized: "Sign in again before recording this change.",
  TREASURY_OWNER_REQUIRED: "Only a community owner can change the recorded budget.",
  forbidden_origin: "This request could not be verified. Reload the page and try again.",
  COMMUNITY_NOT_FOUND: "This community is no longer available to your account.",
  INVALID_TREASURY_INPUT: "Check the amount, funding source, and reason.",
  INSUFFICIENT_RECORDED_FUNDS: "The source treasury does not have enough recorded available funds.",
  TREASURY_BALANCE_LIMIT: "This change would exceed the treasury balance limit.",
  IDEMPOTENCY_CONFLICT: "This request changed after submission. Close the form and try again.",
  RETRY_REQUIRED: "The budget changed while saving. Review the balances and try again."
};

export function TreasuryActions({ communityId, treasuryKind, canManage, onUpdated }: TreasuryActionsProps) {
  const router = useRouter();
  const fieldId = useId();
  const [mode, setMode] = useState<"funding" | "allocation" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const request = useRef<{ signature: string; key: string } | null>(null);
  const target = treasuryKind === "COMMUNITY" ? "SUSTAINABILITY" : "COMMUNITY";
  const targetName = target === "SUSTAINABILITY" ? "sustainability" : "community";

  if (!canManage) return null;

  function open(next: "funding" | "allocation" | null) {
    setMode(next);
    setError(null);
    setNotice(null);
    request.current = null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !mode) return;
    const form = new FormData(event.currentTarget);
    const amountZec = String(form.get("amountZec") ?? "").trim();
    try {
      parseTreasuryAmountZat(amountZec);
    } catch {
      setError("Enter a positive amount up to 21,000,000 ZEC, with no more than eight decimal places.");
      return;
    }
    const fields = mode === "funding"
      ? { treasuryKind, amountZec, fundingSource: String(form.get("fundingSource") ?? "").trim(), reason: String(form.get("reason") ?? "").trim() }
      : { fromTreasuryKind: treasuryKind, toTreasuryKind: target, amountZec, reason: String(form.get("reason") ?? "").trim() };
    const signature = JSON.stringify({ mode, ...fields });
    if (request.current?.signature !== signature) {
      request.current = { signature, key: crypto.randomUUID() };
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/communities/${encodeURIComponent(communityId)}/treasuries/${mode === "funding" ? "funding" : "allocations"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...fields, idempotencyKey: request.current.key })
      });
      const result = await response.json().catch(() => null) as { error?: string; treasuries?: CommunityTreasuryView } | null;
      if (!response.ok || !result?.treasuries) {
        setError(ERRORS[result?.error ?? ""] ?? "The change could not be recorded. Please try again.");
        return;
      }
      onUpdated?.(result.treasuries);
      setNotice(mode === "funding" ? "Funding recorded." : "Budget allocation recorded.");
      setMode(null);
      request.current = null;
      router.refresh();
    } catch {
      setError("The connection was interrupted. Retry to check and safely complete this same request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dao-treasury-actions">
      {!mode ? <div className="dao-treasury-action-links">
        <button type="button" className="dao-text-button" onClick={() => open("funding")}><span aria-hidden="true">+</span> Record funding</button>
        <button type="button" className="dao-text-button" onClick={() => open("allocation")}>Allocate budget <span aria-hidden="true">↗</span></button>
      </div> : <form className="dao-form dao-treasury-form" onSubmit={submit}>
        <div className="dao-inline-heading"><h3>{mode === "funding" ? "Record funding" : `Allocate to ${targetName}`}</h3><button type="button" className="dao-text-button" disabled={busy} onClick={() => open(null)}>Cancel</button></div>
        <p className="dao-field-hint">{mode === "funding" ? "Add a funding record to this treasury." : "Move the recorded available budget between the two funds."}</p>
        <div className="dao-field"><label htmlFor={`${fieldId}-amount`}>Amount in ZEC</label><input id={`${fieldId}-amount`} name="amountZec" type="text" inputMode="decimal" placeholder="0.00" required maxLength={32} autoComplete="off" disabled={busy} /></div>
        {mode === "funding" ? <div className="dao-field"><label htmlFor={`${fieldId}-source`}>Funding source</label><input id={`${fieldId}-source`} name="fundingSource" placeholder="Where the funding came from" required minLength={3} maxLength={200} disabled={busy} /></div> : null}
        <div className="dao-field"><label htmlFor={`${fieldId}-reason`}>Reason</label><textarea id={`${fieldId}-reason`} name="reason" placeholder="A brief explanation for the record" required minLength={3} maxLength={500} rows={2} disabled={busy} /></div>
        <button type="submit" className="dao-button dao-button--primary" disabled={busy}>{busy ? "Recording…" : mode === "funding" ? "Record funding" : "Record allocation"}</button>
      </form>}
      {notice ? <p className="dao-notice" role="status">{notice}</p> : null}
      {error ? <p className="dao-error" role="alert">{error}</p> : null}
    </div>
  );
}
