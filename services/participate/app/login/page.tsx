import Link from "next/link";
import { WorkspaceSignInForm } from "@/components/workspace-auth";
import { WorkspaceThemeControl } from "@/components/workspace-theme";
import { safeAuthNext } from "@/lib/auth/redirect";

export default async function LoginPage({ searchParams }: {
  searchParams?: Promise<{ error?: string; next?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const next = safeAuthNext(params.next, "/participate");
  return <main className="dao-app dao-auth-page">
    <header className="dao-auth-header">
      <Link className="dao-brand" href="/communities" aria-label="Proposals home"><span className="dao-zcash-mark" aria-hidden="true" /></Link>
      <WorkspaceThemeControl />
    </header>
    <section className="dao-auth-card" aria-labelledby="login-title">
      <h1 id="login-title">Welcome back</h1>
      <p className="dao-auth-description">Your email. A code. You’re in.</p>
      <WorkspaceSignInForm next={next} errorCode={params.error} />
      <Link className="dao-auth-browse" href="/communities">Browse proposals <span aria-hidden="true">→</span></Link>
    </section>
  </main>;
}
