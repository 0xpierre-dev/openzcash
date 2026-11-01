import { ProposalWorkspace } from "@/components/proposal-workspace";
import { readBrowsingWorkspaceContext } from "@/lib/services/workspace";
import { readProposalParticipationBoard } from "@/lib/services/archive-discussion";

export const dynamic = "force-dynamic";
export default async function ProposalsPage({ params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = await params;
  const context = await readBrowsingWorkspaceContext(communityId);
  const board = await readProposalParticipationBoard(communityId, context.session);
  return <ProposalWorkspace community={context.community} communities={context.communities} viewer={context.viewer} board={board} />;
}
