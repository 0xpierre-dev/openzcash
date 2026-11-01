import { TreasuryWorkspace } from "@/components/treasury-workspace";
import { readWorkspaceContext } from "@/lib/services/workspace";
import { readCommunityTreasuries } from "@/lib/services/treasuries";

export const dynamic = "force-dynamic";

export default async function CommunityTreasuryPage({ params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = await params;
  const context = await readWorkspaceContext(communityId);
  const treasury = await readCommunityTreasuries(context.community.id, context.session.userId);
  return <TreasuryWorkspace key={context.community.id} community={context.community} communities={context.communities} viewer={context.viewer} treasury={treasury} isDemo={context.isDemo} />;
}
