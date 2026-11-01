import Link from "next/link";
import { WorkspaceFrame } from "@/components/community-workspace";
import { MembershipAccess } from "@/components/membership-access";
import { readBrowsingWorkspaceContext } from "@/lib/services/workspace";
import { readMyMembership } from "@/lib/services/account-membership";

export const dynamic = "force-dynamic";

export default async function MembershipAccessPage({ params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = await params;
  const context = await readBrowsingWorkspaceContext(communityId);
  const userId = context.session?.subjectType === "user" ? context.session.userId : null;
  const membership = userId ? await readMyMembership(context.community.id, userId) : null;
  return <WorkspaceFrame {...context} activeSection="members">
    <Link className="dao-back-link" href={`/communities/${encodeURIComponent(communityId)}/dao`}>← Proposals</Link>
    <header className="dao-page-heading"><p className="dao-eyebrow">{context.community.name}</p><h1>Join the community</h1></header>
    <MembershipAccess key={`${userId ?? "guest"}-${membership?.request?.updatedAt ?? membership?.memberStatus ?? "new"}`} communityId={communityId} signedIn={Boolean(userId)} nick={userId ? context.session?.nick : undefined} initial={membership} />
  </WorkspaceFrame>;
}
