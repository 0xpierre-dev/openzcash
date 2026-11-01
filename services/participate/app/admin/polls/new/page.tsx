import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth/session";
import { resolveAdminCommunity } from "@/lib/auth/admin-community";
import { CommunitySwitcher } from "@/components/community-switcher";
import { DaoMemberStatus } from "@prisma/client";
import { AdminPollCreateForm } from "@/components/admin-poll-create-form";
import { ZcashBrandmark } from "@/components/zcash-brandmark";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NewPollPage({ searchParams }: { searchParams?: Promise<{ communityId?: string }> }) {
  const session = await readSession();
  if (!session) redirect("/login?next=%2Fadmin%2Fpolls%2Fnew");
  if (session.subjectType !== "user") redirect("/polls");
  const { community, communities } = await resolveAdminCommunity(session.userId, (await searchParams)?.communityId);
  const daoMembers = await db.daoMember.findMany({
    where: {
      communityId: community.id,
      status: DaoMemberStatus.ACTIVE
    },
    orderBy: {
      nick: "asc"
    },
    select: {
      id: true,
      nick: true,
      signalUsername: true
    }
  });

  return (
    <main className="page-shell">
      <section className="workspace-shell">
        <CommunitySwitcher communities={communities} communityId={community.id} />
        <Link href={`/admin/polls?communityId=${encodeURIComponent(community.id)}`} className="admin-back-link">
          <span aria-hidden="true">←</span>
          <span>Polls</span>
        </Link>

        <div className="editorial-grid editorial-grid--admin">
          <section className="hero-card editorial-panel editorial-panel--wide">
            <div className="editorial-section-head">
              <div>
                <div className="eyebrow-row">
                  <p className="eyebrow">Create</p>
                  <ZcashBrandmark className="zcash-brandmark--compact" />
                </div>
                <h1 className="editorial-title">Prepare the poll, then review before opening.</h1>
              </div>
              <span className="status-pill">New poll</span>
            </div>
            <p className="editorial-copy editorial-copy--wide">
              Choose the question, answers and voting window for this community.
              Review the proposal before opening it to voters.
            </p>
            <div className="editorial-card-grid">
              <article className="editorial-note-card">
                <span className="section-label">Module 1</span>
                <strong>Question and answer rails</strong>
                <p>Choose approval, rejection and optional abstention labels.</p>
              </article>
              <article className="editorial-note-card">
                <span className="section-label">Module 2</span>
                <strong>DAO member basket</strong>
                <p>Use this community’s active member roster.</p>
              </article>
              <article className="editorial-note-card">
                <span className="section-label">Module 3</span>
                <strong>Guided opening</strong>
                <p>Review the proposal and voter list before opening.</p>
              </article>
            </div>
          </section>

          <AdminPollCreateForm communityId={community.id} daoMembers={daoMembers} />
        </div>
      </section>
    </main>
  );
}
