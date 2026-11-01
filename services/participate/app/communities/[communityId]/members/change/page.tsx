import Link from "next/link";
import { WorkspaceFrame } from "@/components/community-workspace";
import { MembershipProposalForm } from "@/components/membership-proposal-form";
import { readWorkspaceContext } from "@/lib/services/workspace";
import { db } from "@/lib/db";
import { readMembershipRequests } from "@/lib/services/account-membership";

export const dynamic = "force-dynamic";

export default async function MembershipChangePage({ params, searchParams }: { params: Promise<{ communityId: string }>; searchParams?: Promise<{ request?: string }> }) {
  const { communityId } = await params;
  const context = await readWorkspaceContext(communityId);
  const requests = await readMembershipRequests(context.community.id, context.session.userId);
  const initialRequestId = (await searchParams)?.request;
  const members = await db.daoMember.findMany({
    where: { communityId: context.community.id, status: "ACTIVE" },
    orderBy: [{ nick: "asc" }, { id: "asc" }], select: { id: true, nick: true }
  });
  return <WorkspaceFrame {...context} activeSection="members">
    <Link className="dao-back-link" href={`/communities/${encodeURIComponent(communityId)}/members`}>← Members</Link>
    <header className="dao-page-heading"><p className="dao-eyebrow">{context.community.name}</p><h1>Propose a membership change</h1><p>Add or remove a member through a community vote.</p></header>
    <MembershipProposalForm key={communityId} communityId={communityId} members={members} requests={requests} initialRequestId={initialRequestId} />
  </WorkspaceFrame>;
}
