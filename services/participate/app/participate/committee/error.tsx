"use client";

import Link from "next/link";

export default function CommitteeError({ reset }: { reset: () => void }) {
  return <main className="dao-loading">
    <span className="dao-eyebrow">Committee workspace</span>
    <h1>We couldn’t load the workspace.</h1>
    <p role="alert">Try again. If you just signed or saved a change, refresh the history before resubmitting.</p>
    <div className="dao-form-actions">
      <button type="button" className="dao-button dao-button--primary" onClick={reset}>Try again</button>
      <Link className="dao-button" href="/participate">Back to proposals</Link>
    </div>
  </main>;
}
