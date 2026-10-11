"use client";

import { CommitteeAdminDialog } from "@/components/participate/workspace/committee-admin-dialog";
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AccountProfile } from "@/lib/participate/workspace/domain/account-profile";
import type { CreditScope } from "@/lib/participate/workspace/domain/credit-scope";
import type { AccountCreditSummary } from "@/lib/participate/workspace/domain/participation-credits";
import { ParticipationCreditsPanel } from "@/components/participate/workspace/participation-credits";
import { PasskeyIcon, PasskeySettings } from "@/components/participate/workspace/passkey-settings";
import type { DemoPersona } from "@/lib/participate/workspace/auth/demo-persona";
import { emailErrorMessage, emailFetch } from "@/lib/participate/workspace/auth/email-client";
import { useParticipateHost } from "@/components/participate/workspace/participate-bridge";

type Section = "profile" | "credits";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const ERRORS: Record<string, string> = {
  unauthorized: "Sign in again to update your profile.",
  forbidden: "Profile settings are unavailable for this session.",
  forbidden_origin: "Reload the page and try again.",
  INVALID_AVATAR: "Choose a valid PNG, JPG, or WebP image up to 2 MB.",
  AVATAR_TOO_LARGE: "Choose an image smaller than 2 MB.",
  INVALID_PROFILE_INPUT: "Use a display name of up to 60 characters.",
  INVALID_USERNAME: "Use 3–30 letters, numbers, dots, hyphens or underscores. Start and end with a letter or number.",
  RESERVED_USERNAME: "Choose another username.",
  USERNAME_TAKEN: "That username is already taken.",
  PROFILE_BODY_TOO_LARGE: "Choose an image smaller than 2 MB.",
  ACCOUNT_UNAVAILABLE: "Sign in again to update your profile.",
  ACCOUNT_SETTINGS_UNAVAILABLE: "Profile settings are unavailable for this session."
};

export function AccountAvatar({ name, src, className = "dao-account-avatar" }: { name: string; src?: string | null; className?: string }) {
  return <span className={className} aria-hidden="true">{src
    // Avatars are bounded, server-reencoded data URLs; no remote image requests.
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt="" width={72} height={72} />
    : Array.from(name)[0]?.toLocaleUpperCase("en-US") ?? "?"}</span>;
}

function AccountIcon({ kind }: { kind: "profile" | "privacy" | "logout" }) {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind === "profile"
    ? <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>
    : kind === "privacy" ? <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>
    : <><path d="M9 4H4v16h5M10 12h11m-4-4 4 4-4 4" /></>}</svg>;
}

export function WorkspaceAccount({ nick, roleLabel, canEditProfile = true, communityId, creditScope, initialProfile, initialCreditSummary, committeeEntry, demoPersona, canPreviewCommittee = false, canModeratePilot = false }: { nick: string; roleLabel: string; canEditProfile?: boolean; communityId?: string; creditScope?: CreditScope; initialProfile?: AccountProfile | null; initialCreditSummary?: AccountCreditSummary | null; committeeEntry?: { label: string; href: string }; demoPersona?: DemoPersona; canPreviewCommittee?: boolean; canModeratePilot?: boolean }) {
  const router = useRouter();
  const openHostView = useParticipateHost();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const firstOption = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [moderationOpen, setModerationOpen] = useState(false);
  const [moderationActive, setModerationActive] = useState(false);
  const [section, setSection] = useState<Section | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(initialProfile ?? null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(canEditProfile && !initialProfile);
  const [loadVersion, setLoadVersion] = useState(0);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [creditsBusy, setCreditsBusy] = useState(false);
  const [passkeysBusy, setPasskeysBusy] = useState(false);
  const [creditCommunityId, setCreditCommunityId] = useState(creditScope?.id ?? communityId);
  const [activeCreditScope, setActiveCreditScope] = useState(creditScope);
  const [switchingDemo, setSwitchingDemo] = useState(false);
  const [demoError, setDemoError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const switching = useRef(false);
  const demoLabel = demoPersona === "committee" ? "Committee demo · Read-only" : demoPersona === "participant" ? "Participant demo" : null;

  useEffect(() => {
    if (!open || !canModeratePilot) return;
    let cancelled = false;
    void fetch("/api/participate/moderation-access", { cache: "no-store", credentials: "same-origin" })
      .then(async response => response.ok ? response.json() : { active: false })
      .then(result => { if (!cancelled) setModerationActive(result.active === true); })
      .catch(() => { if (!cancelled) setModerationActive(false); });
    return () => { cancelled = true; };
  }, [open, canModeratePilot]);

  function moderationChanged(active: boolean) {
    setModerationActive(active);
    window.dispatchEvent(new Event("participate:moderation-updated"));
    setNotice(active ? "Moderation unlocked for 15 minutes." : "Moderation locked.");
  }

  async function switchDemo() {
    if (demoPersona !== "committee" || switching.current) return;
    switching.current = true; setSwitchingDemo(true); setDemoError("");
    const persona = "participant";
    const next = "/zcg/participate";
    try {
      await emailFetch("/api/auth/demo", { persona, next });
      setOpen(false);
      if (openHostView) openHostView("proposals");
      else { router.push(next); router.refresh(); }
    } catch (error) { setDemoError(emailErrorMessage(error)); }
    finally { switching.current = false; setSwitchingDemo(false); }
  }
  async function signOut(event: FormEvent<HTMLFormElement>) {
    if (!openHostView) return; // Standalone forms keep their normal redirect.
    event.preventDefault();
    if (switching.current) return;
    switching.current = true; setSigningOut(true); setDemoError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ next: "/zcg/participate" }) });
      if (!response.ok) throw new Error("Sign out failed");
      setOpen(false); openHostView("proposals");
    } catch { setDemoError("Could not sign out. Please try again."); }
    finally { switching.current = false; setSigningOut(false); }
  }

  useEffect(() => {
    if (!canEditProfile) return;
    function openCredits(event: Event) {
      const detail = (event as CustomEvent<{ communityId?: string; creditScope?: CreditScope }>).detail;
      setCreditCommunityId(typeof detail?.communityId === "string" ? detail.communityId : creditScope?.id ?? communityId);
      setActiveCreditScope(detail?.creditScope ?? creditScope);
      setOpen(false); setSection("credits");
    }
    window.addEventListener("dao:open-credits", openCredits);
    return () => window.removeEventListener("dao:open-credits", openCredits);
  }, [canEditProfile, communityId, creditScope]);

  useEffect(() => {
    if (!canEditProfile) return;
    if (initialProfile?.nick === nick && loadVersion === 0) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/account/settings", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok || !data.profile) throw new Error("Profile unavailable");
        if (!controller.signal.aborted) { setProfile(data.profile); setLoadError(false); }
      } catch {
        if (!controller.signal.aborted) setLoadError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [canEditProfile, nick, loadVersion, initialProfile]);

  useEffect(() => {
    if (!open) return;
    firstOption.current?.focus();
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);

  const closeSettings = useCallback(() => setSection(null), []);
  const restoreFocus = useCallback(() => trigger.current?.focus(), []);
  const name = canEditProfile ? profile?.displayName || profile?.nick || nick : nick;
  function showSettings() {
    setCreditCommunityId(creditScope?.id ?? communityId); setActiveCreditScope(creditScope);
    setOpen(false); setNotice(""); setSection("profile");
  }

  return <div className="dao-account-menu" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <button className="dao-account-trigger" type="button" ref={trigger} aria-label="Account settings" aria-expanded={open} aria-controls={open ? `${id}-menu` : undefined} onClick={() => setOpen(!open)}>
      <AccountAvatar name={name} src={canEditProfile ? profile?.avatarUrl : null} />
      <span className="dao-account-copy"><span className="dao-account-name">{name}</span><span className="dao-account-role">{demoLabel ?? roleLabel}</span></span>
      <svg className="dao-account-chevron" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m5 8 5 5 5-5" /></svg>
    </button>
    {open ? <div className="dao-account-popover" id={`${id}-menu`}>
      {canEditProfile ? <button ref={firstOption} type="button" aria-label="Profile" className="dao-account-profile-link" onClick={showSettings}><AccountIcon kind="profile" /><span>Profile<small>Credits & settings</small></span></button> : <p className="dao-account-guest">Invitation session</p>}
      {committeeEntry ? <Link className="committee-account-link" href={committeeEntry.href} onClick={event => { setOpen(false); if (openHostView && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); openHostView("committee"); } }}><AccountIcon kind="profile" /><span>{committeeEntry.label}</span></Link> : null}
      {demoPersona ? <button type="button" disabled={demoPersona === "participant" || switchingDemo || signingOut} title={demoPersona === "participant" ? "Admin access only" : undefined} onClick={() => void switchDemo()}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4" /></svg><span>{switchingDemo ? "Switching…" : `Switch to ${demoPersona === "participant" ? "committee" : "participant"} demo`}</span></button> : null}
      {canPreviewCommittee && !committeeEntry ? <button type="button" onClick={() => { setOpen(false); setAdminOpen(true); }}><AccountIcon kind="privacy" /><span>Committee preview</span></button> : null}
      {canModeratePilot ? <button type="button" onClick={() => { setOpen(false); setModerationOpen(true); }}><AccountIcon kind="privacy" /><span>{moderationActive ? "Renew moderation access" : "Moderation"}</span></button> : null}
      {canModeratePilot && moderationActive ? <button type="button" onClick={() => { void fetch("/api/participate/moderation-access", { method: "DELETE", credentials: "same-origin" }).then(response => { if (!response.ok) throw new Error(); moderationChanged(false); setOpen(false); }).catch(() => setDemoError("Could not lock moderation. Please try again.")); }}><AccountIcon kind="privacy" /><span>Lock moderation</span></button> : null}
      {canPreviewCommittee && committeeEntry?.label === "Committee preview" ? <button type="button" onClick={() => { void fetch("/api/participate/admin-access", { method: "DELETE", credentials: "same-origin" }).then(response => { if (!response.ok) throw new Error(); setOpen(false); if (openHostView) openHostView("proposals"); else { router.push("/zcg/participate"); router.refresh(); } }).catch(() => setDemoError("Could not lock the preview. Please try again.")); }}><AccountIcon kind="privacy" /><span>Lock committee preview</span></button> : null}
      {demoError ? <p className="dao-account-guest" role="alert">{demoError}</p> : null}
      <form method="post" action="/api/auth/logout" onSubmit={event => void signOut(event)}><input type="hidden" name="next" value={creditScope?.kind === "COMMITTEE" ? "/zcg/participate" : communityId ? `/communities/${encodeURIComponent(communityId)}#proposals` : "/communities"} /><button ref={!canEditProfile ? firstOption : undefined} type="submit" disabled={switchingDemo || signingOut}><AccountIcon kind="logout" /><span>{signingOut ? "Signing out…" : "Sign out"}</span></button></form>
    </div> : null}
    {adminOpen && canPreviewCommittee ? <CommitteeAdminDialog onClose={() => setAdminOpen(false)} restoreFocus={restoreFocus} /> : null}
    {moderationOpen && canModeratePilot ? <CommitteeAdminDialog mode="moderation" onClose={() => setModerationOpen(false)} onUnlocked={() => moderationChanged(true)} restoreFocus={restoreFocus} /> : null}
    {notice ? <span className="dao-sr-only" role="status">{notice}</span> : null}
    {section && canEditProfile ? <AccountSettingsDialog section={section} onClose={closeSettings} restoreFocus={restoreFocus} saving={saving || creditsBusy || passkeysBusy}>
      <div inert={creditsBusy || passkeysBusy}>
        {loading ? <p className="dao-settings-message" role="status">Loading your profile…</p> : loadError || !profile ? <div className="dao-settings-message"><p role="alert">Your settings could not be loaded.</p><button type="button" className="dao-button" onClick={() => { setLoading(true); setLoadError(false); setLoadVersion(value => value + 1); }}>Try again</button></div> : <AccountSettingsForm profile={profile} onSavingChange={setSaving} onClose={closeSettings} onSaved={next => { setProfile(next); setNotice("Account settings saved."); closeSettings(); router.refresh(); }} />}
      </div>
      <div className="dao-account-credits" tabIndex={-1} inert={saving || passkeysBusy}>
        <ParticipationCreditsPanel key={activeCreditScope?.id ?? creditCommunityId ?? "accounts"} scope={activeCreditScope} communityId={creditCommunityId} initialSummary={activeCreditScope?.id === creditScope?.id ? initialCreditSummary : null} compact onBusyChange={setCreditsBusy} />
      </div>
      <AccountPasskeys disabled={saving || creditsBusy} onSavingChange={setPasskeysBusy} />
    </AccountSettingsDialog> : null}
  </div>;
}

function AccountSettingsDialog({ section, onClose, restoreFocus, saving, children }: { section: Section; onClose: () => void; restoreFocus: () => void; saving: boolean; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previousOverflow; restoreFocus(); };
  }, [restoreFocus]);
  useEffect(() => {
    if (section !== "credits") return;
    const credits = dialog.current?.querySelector<HTMLElement>(".dao-account-credits");
    credits?.scrollIntoView?.({ block: "nearest" });
    credits?.focus({ preventScroll: true });
  }, [section]);
  return <dialog ref={dialog} className="dao-settings-dialog dao-account-card" aria-labelledby={titleId} onKeyDown={event => {
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled):not([tabindex='-1']), textarea:not(:disabled), select:not(:disabled), summary, a[href]"))
      .filter(element => !element.closest("[hidden], [inert]") && element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }} onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}>
    <header className="dao-settings-heading"><h2 id={titleId}>My profile</h2><button className="dao-settings-close" type="button" aria-label="Close settings" disabled={saving} onClick={onClose}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></header>
    {children}
  </dialog>;
}

function AccountPasskeys({ disabled, onSavingChange }: { disabled: boolean; onSavingChange: (saving: boolean) => void }) {
  const [opened, setOpened] = useState(false);
  return <details className="dao-account-passkeys dao-credit-section" inert={disabled} onToggle={event => { if (event.currentTarget.open) setOpened(true); }}>
    <summary><PasskeyIcon size={18} />Passkeys<small>Optional</small></summary>
    {opened ? <PasskeySettings compact onSavingChange={onSavingChange} /> : null}
  </details>;
}

function AccountSettingsForm({ profile, onClose, onSaved, onSavingChange }: { profile: AccountProfile; onClose: () => void; onSaved: (profile: AccountProfile) => void; onSavingChange: (saving: boolean) => void }) {
  const id = useId();
  const [displayName, setDisplayName] = useState(profile.displayName ?? "");
  const [username, setUsername] = useState(profile.nick);
  const [share, setShare] = useState(profile.shareProfileInDiscussion);
  const [avatar, setAvatar] = useState<File | null>(null);
  const [preview, setPreview] = useState(profile.avatarUrl);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);
  const reader = useRef<FileReader | null>(null);
  const dirty = displayName.trim() !== (profile.displayName ?? "") || username.trim().toLowerCase() !== profile.nick.toLowerCase() || share !== profile.shareProfileInDiscussion || avatar !== null || (removeAvatar && profile.avatarUrl !== null);
  useEffect(() => () => reader.current?.abort(), []);

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    reader.current?.abort();
    if (!AVATAR_TYPES.has(file.type) || file.size > MAX_AVATAR_BYTES) { setError("Choose a PNG, JPG, or WebP image up to 2 MB."); return; }
    setError("");
    setAvatar(file);
    setRemoveAvatar(false);
    const nextReader = new FileReader();
    reader.current = nextReader;
    nextReader.onload = () => setPreview(String(nextReader.result));
    nextReader.onerror = () => setError("This image could not be read. Try another photo.");
    nextReader.readAsDataURL(file);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !dirty) return;
    setSaving(true); onSavingChange(true); setError("");
    const body = new FormData();
    body.set("displayName", displayName.trim());
    body.set("username", username.trim());
    body.set("shareProfileInDiscussion", String(share));
    if (avatar) body.set("avatar", avatar);
    else if (removeAvatar) body.set("removeAvatar", "true");
    try {
      const response = await fetch("/api/account/settings", { method: "PATCH", body });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.profile) { setError(ERRORS[data?.error ?? ""] ?? "Your changes could not be saved. Please try again."); return; }
      onSaved(data.profile);
    } catch { setError("Your changes could not be saved. Check your connection and try again."); }
    finally { setSaving(false); onSavingChange(false); }
  }
  return <form className="dao-settings-form" onSubmit={submit} aria-busy={saving}>
    <div className="dao-settings-content">
      <section aria-label="Profile settings">
        <div className="dao-settings-personal">
          <div className="dao-settings-photo">
            <AccountAvatar name={displayName.trim() || profile.nick} src={preview} className="dao-settings-avatar" />
            <button type="button" className="dao-text-button" disabled={saving} onClick={() => photoInput.current?.click()} aria-label="Upload photo">Edit photo</button>
            <input ref={photoInput} className="dao-sr-only" type="file" tabIndex={-1} accept="image/png,image/jpeg,image/webp" aria-label="Profile photo" onChange={choosePhoto} disabled={saving} />
          </div>
          <div className="dao-settings-name">
            <div className="dao-field"><label htmlFor={`${id}-name`}>Display name</label><input id={`${id}-name`} type="text" autoComplete="nickname" maxLength={60} value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder={profile.nick} disabled={saving} /></div>
            <div className="dao-field dao-settings-username"><label htmlFor={`${id}-username`}>Username</label><div className="dao-settings-username-input"><span aria-hidden="true">@</span><input id={`${id}-username`} type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={30} value={username} onChange={event => setUsername(event.target.value)} disabled={saving} /></div></div>
            {preview ? <button type="button" className="dao-text-button dao-text-button--muted" disabled={saving} onClick={() => { reader.current?.abort(); setAvatar(null); setPreview(null); setRemoveAvatar(true); setError(""); }}>Remove photo</button> : null}
          </div>
        </div>
        <label className="dao-privacy-option"><span><strong>Show name and photo in discussions</strong><small>Your username stays visible.</small></span><input type="checkbox" role="switch" checked={share} disabled={saving} onChange={event => setShare(event.target.checked)} /></label>
      </section>
      {error ? <p className="dao-form-error" role="alert">{error}</p> : null}
    </div>
    {dirty || error ? <footer className="dao-settings-footer"><button type="button" className="dao-button" disabled={saving} onClick={onClose}>Cancel</button><button type="submit" className="dao-button dao-button--primary" disabled={saving || !dirty}>{saving ? "Saving…" : "Save changes"}</button></footer> : null}
  </form>;
}
