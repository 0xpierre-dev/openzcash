import Link from "next/link";
import { WorkspaceFrame } from "@/components/community-workspace";
import { CommunityProposalForm } from "@/components/community-proposal-form";
import { readWorkspaceContext } from "@/lib/services/workspace";
import { readCommunityTreasuries } from "@/lib/services/treasuries";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NewCommunityProposalPage({ params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = await params;
  const context = await readWorkspaceContext(communityId);
  const [treasury, memberCount] = await Promise.all([
    readCommunityTreasuries(communityId, context.session.userId),
    db.daoMember.count({ where: { communityId, status: "ACTIVE" } })
  ]);
  return <WorkspaceFrame {...context} activeSection="proposals">
    <Link className="dao-back-link" href={`/communities/${communityId}/dao`}>← All proposals</Link>
    <header className="dao-page-heading"><p className="dao-eyebrow">Make room for a good idea</p><h1>Create a proposal</h1><p>Give your community the context it needs to make a decision.</p></header>
    <CommunityProposalForm key={communityId} communityId={communityId} funds={treasury.funds} memberCount={memberCount} />
  </WorkspaceFrame>;
}
