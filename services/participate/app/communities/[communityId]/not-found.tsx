import Link from "next/link";

export default function WorkspaceNotFound() {
  return <main className="dao-loading"><span className="dao-eyebrow">Community governance</span><h1>This page isn’t available.</h1><p>The link may have changed, or your account may not have access.</p><Link className="dao-button dao-button--primary" href="/communities">Back to proposals</Link></main>;
}
