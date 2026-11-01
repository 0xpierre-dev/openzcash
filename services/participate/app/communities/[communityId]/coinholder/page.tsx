import { CoinholderWorkspace } from "@/components/coinholder-dashboard";
import { readBrowsingWorkspaceContext } from "@/lib/services/workspace";
import { readCoinholderDashboard } from "@/lib/services/coinholder";

export const dynamic = "force-dynamic";

export default async function CoinholderPage({ params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = await params;
  const context = await readBrowsingWorkspaceContext(communityId);
  const data = await readCoinholderDashboard();
  return <CoinholderWorkspace key={context.community.id} community={context.community} communities={context.communities} viewer={context.viewer} initialData={data} />;
}
