import Link from "next/link";
import { redirect } from "next/navigation";
import { CommunityCreateForm } from "@/components/community-create-form";
import { readSession } from "@/lib/auth/session";
import { readManagedCommunities } from "@/lib/services/communities";

export const dynamic = "force-dynamic";

export default async function CommunitiesPage() {
  const session = await readSession();
  if (!session) redirect("/login?next=%2Fadmin%2Fcommunities");
  if (session.subjectType !== "user") redirect("/polls");
  const communities = await readManagedCommunities(session.userId);

  return (
    <main className="page-shell"><section className="workspace-shell">
      <header className="hero-card editorial-panel">
        <p className="eyebrow">Governance workspace</p>
        <h1 className="editorial-title">Communities</h1>
        <p className="editorial-copy">Manage each community&apos;s members and proposals in its own workspace.</p>
      </header>
      <section className="hero-card editorial-panel">
        {communities.length ? communities.map((community) => (
          <p key={community.id}><Link href={`/communities/${encodeURIComponent(community.id)}`}
            className="text-link">{community.name}</Link></p>
        )) : <p>You have no communities yet. Create one to get started.</p>}
        <CommunityCreateForm />
      </section>
    </section></main>
  );
}
