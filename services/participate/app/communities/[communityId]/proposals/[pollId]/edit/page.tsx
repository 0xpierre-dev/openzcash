import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceFrame } from "@/components/community-workspace";
import { CommunityProposalForm } from "@/components/community-proposal-form";
import { readWorkspaceContext } from "@/lib/services/workspace";
import { readCommunityTreasuries } from "@/lib/services/treasuries";
import { readProposalDetail, ProposalDiscussionError } from "@/lib/services/proposal-discussion";

export const dynamic = "force-dynamic";

export default async function EditCommunityProposalPage({ params }: { params: Promise<{ communityId: string; pollId: string }> }) {
  const { communityId, pollId } = await params;
  const context = await readWorkspaceContext(communityId);
  let proposal;
  try {
    proposal = await readProposalDetail(pollId, context.session, communityId);
  } catch (error) {
    if (error instanceof ProposalDiscussionError && error.status === 404) notFound();
    throw error;
  }
  if (!proposal.canEditDraft) notFound();
  const treasury = await readCommunityTreasuries(communityId, context.session.userId);
  return <WorkspaceFrame {...context} activeSection="proposals">
    <Link className="dao-back-link" href={`/communities/${communityId}/proposals/${pollId}`}>← Back to proposal</Link>
    <header className="dao-page-heading"><p className="dao-eyebrow">Before voting begins</p><h1>Edit your draft</h1><p>Clarify the request and funding before the community decides.</p></header>
    <CommunityProposalForm key={`${communityId}-${pollId}`} communityId={communityId} funds={treasury.funds} memberCount={0} initialProposal={{
      id: proposal.id, title: proposal.title, body: proposal.body, tags: proposal.tags,
      treasuryId: proposal.treasury?.id, requestedAmountZec: proposal.requestedAmountZec ?? undefined,
      requestedAmountUsd: proposal.requestedAmountUsd ?? undefined,
      opensAt: proposal.opensAt, closesAt: proposal.closesAt
    }} />
  </WorkspaceFrame>;
}
