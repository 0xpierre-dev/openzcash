"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function CommunityCreateForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/communities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), slug: form.get("slug") })
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error === "COMMUNITY_SLUG_TAKEN"
          ? "That community URL name is already in use."
          : "Could not create the community. Check the name and URL name.");
        return;
      }
      router.push(`/communities/${encodeURIComponent(body.community.id)}`);
      router.refresh();
    } catch {
      setError("Could not create the community. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="editorial-module">
      <h2>Create a community</h2>
      <label htmlFor="community-name">Community name</label>
      <input id="community-name" name="name" required minLength={3} maxLength={100} />
      <label htmlFor="community-slug">URL name</label>
      <input id="community-slug" name="slug" required minLength={3} maxLength={64}
        pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="my-community" />
      <p className="field-hint">Use lowercase letters, numbers and hyphens.</p>
      <button type="submit" className="button-link button-link-primary" disabled={saving}>
        {saving ? "Creating..." : "Create community"}
      </button>
      {error ? <p className="error-notice" role="alert">{error}</p> : null}
    </form>
  );
}
