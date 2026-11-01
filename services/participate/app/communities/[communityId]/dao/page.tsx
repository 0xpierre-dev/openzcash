import { CommunityWorkspace } from "@/components/community-workspace";
import { db } from "@/lib/db";
import { pollManagementWhere } from "@/lib/auth/poll-ownership";
import { publicWorkspacePollWhere, readBrowsingWorkspaceContext } from "@/lib/services/workspace";
import { readCommunityTreasuries } from "@/lib/services/treasuries";

export const dynamic = "force-dynamic";

export default async function CommunityWorkspacePage({ params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = await params;
  const context = await readBrowsingWorkspaceContext(communityId);
  const [treasury, polls, memberCount] = await Promise.all([
    context.canManage && context.session?.subjectType === "user" ? readCommunityTreasuries(communityId, context.session.userId) : null,
    db.poll.findMany({
      where: { communityId, ...(context.canManage && context.session?.subjectType === "user" ? pollManagementWhere(context.session.userId) : publicWorkspacePollWhere()) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true, question: true, status: true, createdAt: true, opensAt: true, closesAt: true,
        requestedAmountZat: true, requestedAmountUsdCents: true, proposalTags: true,
        treasury: { select: { kind: true } },
        _count: context.canManage ? { select: { comments: true } } : false
      }
    }),
    context.canManage ? db.daoMember.count({ where: { communityId, status: "ACTIVE" } }) : null
  ]);
  return <CommunityWorkspace
    community={context.community}
    communities={context.communities}
    viewer={context.viewer}
    treasury={treasury}
    memberCount={memberCount}
    isDemo={false}
    proposals={polls.map(poll => ({
      id: poll.id, question: poll.question, status: poll.status, tags: poll.proposalTags,
      createdAt: poll.createdAt.toISOString(), opensAt: poll.opensAt.toISOString(), closesAt: poll.closesAt.toISOString(),
      commentCount: context.canManage ? poll._count.comments : null,
      treasuryName: poll.treasury ? (poll.treasury.kind === "COMMUNITY" ? "Community Treasury" : "Sustainability Treasury") : undefined,
      requestedAmountZat: poll.requestedAmountZat?.toString(),
      requestedAmountUsdCents: poll.requestedAmountUsdCents?.toString()
    }))}
  />;
}
