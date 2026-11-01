import { CommunityMembers } from "@/components/community-members";
import { db } from "@/lib/db";
import { readWorkspaceContext } from "@/lib/services/workspace";
import { readMembershipRequests } from "@/lib/services/account-membership";

export const dynamic = "force-dynamic";

export default async function CommunityMembersPage({ params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = await params;
  const context = await readWorkspaceContext(communityId);
  const requests = await readMembershipRequests(context.community.id, context.session.userId);
  const members = await db.daoMember.findMany({
    where: { communityId: context.community.id },
    orderBy: [{ status: "asc" }, { nick: "asc" }],
    select: {
      id: true,
      nick: true,
      signalUsername: true,
      userId: true,
      status: true,
      addedByPollId: true,
      removedByPollId: true
    }
  });

  return <CommunityMembers
    key={context.community.id}
    community={context.community}
    communities={context.communities}
    viewer={context.viewer}
    isDemo={context.isDemo}
    members={members}
    requests={requests}
  />;
}
