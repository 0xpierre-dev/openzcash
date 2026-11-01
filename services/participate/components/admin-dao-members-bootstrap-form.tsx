"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";

export function AdminDaoMembersBootstrapForm({ communityId }: { communityId: string }) {
  const router = useRouter();
  const id = useId();
  const [members, setMembers] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flight = useRef(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (flight.current || saved || !members.trim()) return;
    flight.current = true;
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/dao-members/bootstrap", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ communityId, members })
      });
      const json = (await response.json().catch(() => null)) as
        | { error?: string; details?: { issues?: Array<{ message?: string }> } }
        | null;

      if (!response.ok) {
        const messages: Record<string, string> = {
          DAO_MEMBER_BOOTSTRAP_LOCKED: "The member list is already set up. Refresh to view it.",
          DUPLICATE_DAO_MEMBER: "Each name and Signal username must be unique.",
          COMMUNITY_NOT_FOUND: "This community is no longer available to your account.",
          forbidden: "You do not have permission to set up this member list."
        };
        setError(
          json?.details?.issues?.[0]?.message ??
            messages[json?.error ?? ""] ??
            "Could not create the member list. Check the entries and try again."
        );
        return;
      }

      setMembers("");
      setSaved(true);
      router.refresh();
    } catch {
      setError("Connection interrupted. Your entries are still here. Please try again.");
    } finally {
      flight.current = false;
      setIsSaving(false);
    }
  }

  return (
    <form className="dao-form dao-member-setup-form" onSubmit={handleSubmit} aria-busy={isSaving}>
      <div className="dao-member-setup-heading">
        <h2>Set up your member list</h2>
        <p>Add the first members once. Future additions and removals require an approved proposal.</p>
      </div>
      <div className="dao-field">
        <label htmlFor={id}>Initial members</label>
        <p id={`${id}-hint`}>One member per line: name, Signal username.</p>
        <textarea
          id={id}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
          aria-invalid={error ? true : undefined}
          value={members}
          onChange={(event) => setMembers(event.currentTarget.value)}
          placeholder={"alice,alice_user.99\nbob,bob_user.42"}
          rows={6}
          autoComplete="off"
          spellCheck={false}
          disabled={isSaving || saved}
          required
        />
      </div>
      <div className="dao-form-actions">
        <button
          type="submit"
          className="dao-button dao-button--primary"
          disabled={isSaving || saved || !members.trim()}
        >
          {isSaving ? "Creating…" : "Create member list"}
        </button>
      </div>
      {error ? <p id={`${id}-error`} className="dao-form-error" role="alert">{error}</p> : null}
      {saved ? <p className="dao-notice" role="status">Member list created. Loading your members…</p> : null}
    </form>
  );
}
