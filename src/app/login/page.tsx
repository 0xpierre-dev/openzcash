import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Sign in · OpenZcash" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="ws-login-layout">
      <section>
        <span className="ws-eyebrow">OpenZcash workspace</span>
        <h1>
          Public records.
          <br />A focused workspace.
        </h1>
        <p>
          Sign in to manage treasury sources, recipient projects and onboarding
          invitations.
        </p>
        <div className="ws-login-features">
          <span>01 · Treasury sources</span>
          <span>02 · Recipient projects</span>
          <span>03 · Onboarding invitations</span>
        </div>
        <Link href="/zcg">Explore public records →</Link>
      </section>
      <div className="ws-login-form">
        <h2>Administrator access</h2>
        <p>Enter your password to continue.</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
