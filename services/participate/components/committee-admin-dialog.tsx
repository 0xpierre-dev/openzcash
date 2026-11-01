"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { emailFetch } from "@/lib/auth/email-client";
import { useParticipateHost } from "@/components/participate-bridge";

const messages: Record<string, string> = {
  ADMIN_ACCESS_DENIED: "Access denied. Check your admin account and password.",
  ADMIN_ACCESS_UNAVAILABLE: "Admin access has not been configured yet.",
  ADMIN_RATE_LIMITED: "Too many attempts. Try again in 15 minutes.",
  ADMIN_INVALID_INPUT: "Enter your admin password."
};

export function CommitteeAdminDialog({ onClose, restoreFocus, mode = "preview", onUnlocked }: { onClose: () => void; restoreFocus: () => void; mode?: "preview" | "moderation"; onUnlocked?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), password = useRef<HTMLInputElement>(null), guard = useRef(false);
  const id = useId(), router = useRouter(), openHostView = useParticipateHost();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current, overflow = document.body.style.overflow;
    element?.showModal(); password.current?.focus(); document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; restoreFocus(); };
  }, [restoreFocus]);
  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (guard.current) return;
    guard.current = true; setBusy(true); setError("");
    const value = password.current?.value ?? "";
    if (password.current) password.current.value = "";
    try {
      await emailFetch(mode === "moderation" ? "/api/participate/moderation-access" : "/api/participate/admin-access", { password: value });
      onClose();
      if (mode === "moderation") { onUnlocked?.(); return; }
      if (openHostView) openHostView("committee");
      else { router.push("/participate/committee"); router.refresh(); }
    } catch (cause) {
      setError(cause instanceof Error && messages[cause.message] ? messages[cause.message] : "Could not unlock access. Please try again.");
      password.current?.focus();
    } finally { guard.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="dao-auth-dialog" aria-labelledby={`${id}-title`} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <button type="button" className="dao-auth-close" aria-label="Close admin access" disabled={busy} onClick={onClose}>×</button>
    <h2 id={`${id}-title`}>{mode === "moderation" ? "Discussion moderation" : "Committee preview"}</h2>
    <p className="dao-auth-note">{mode === "moderation" ? "Hide comments with a recorded reason · 15 minutes" : "Admin access · Read only · 15 minutes"}</p>
    <form className="dao-auth-form" onSubmit={event => void unlock(event)} aria-busy={busy}>
      <div className="dao-auth-field"><label htmlFor={`${id}-password`}>Admin password</label><input id={`${id}-password`} ref={password} type="password" name="password" autoComplete="current-password" required maxLength={72} disabled={busy} /></div>
      {error ? <p className="dao-auth-error" role="alert">{error}</p> : null}
      <button className="dao-auth-submit" disabled={busy}>{busy ? "Verifying…" : mode === "moderation" ? "Unlock moderation" : "Unlock preview"}</button>
    </form>
  </dialog>;
}
