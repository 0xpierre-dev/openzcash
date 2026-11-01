"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

export default function WorkspaceError({ reset }: { reset: () => void }) {
  const params = useParams<{ communityId: string }>();
  return <main className="dao-loading"><span className="dao-eyebrow">Community governance</span><h1>We couldn’t open this page.</h1><p role="alert">Try loading it again. If this happened after saving, check your proposals before resubmitting.</p><div className="dao-form-actions"><button type="button" className="dao-button dao-button--primary" onClick={reset}>Try again</button><Link className="dao-button" href={`/communities/${encodeURIComponent(params.communityId)}#proposals`}>Back to proposals</Link></div></main>;
}
