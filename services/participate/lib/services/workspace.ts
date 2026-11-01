import { publicPilotScope } from "@/lib/auth/public-pilot-policy";
import type { Prisma } from "@prisma/client";
import { formatTreasuryZec } from "@/lib/domain/treasury";
import { proposalUsdDecimal } from "@/lib/domain/proposal-funding";
import { normalizeProposalTags } from "@/lib/domain/proposal-tags";
import { normalizeGovernanceRules } from "@/lib/domain/governance";
import { notFound, redirect } from "next/navigation";
import { readSession } from "@/lib/auth/session";
import type { SessionPayload } from "@/lib/auth/guards";
import { demoPersonaForUser } from "@/lib/auth/demo-persona";
import { isParticipationCreditSandbox } from "@/lib/services/participation-credits";
import { db } from "@/lib/db";
import { manageableCommunityWhere, readManagedCommunities } from "@/lib/services/communities";

export async function readWorkspaceContext(communityId: string) {
  const session = await readSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(`/communities/${communityId}`)}`);
  if (session.subjectType !== "user") redirect(`/polls/${session.pollId}`);
  const [community, communities] = await Promise.all([
    db.community.findFirst({
      where: { id: communityId, ...manageableCommunityWhere(session.userId) },
      select: {
        id: true, name: true, slug: true,
        memberships: {
          where: { userId: session.userId, status: "ACTIVE" },
          select: { role: true }
        }
      }
    }),
    readManagedCommunities(session.userId)
  ]);
  if (!community || !community.memberships[0]) notFound();
  return {
    session,
    community: { id: community.id, name: community.name, slug: community.slug },
    communities,
    viewer: { nick: session.nick, role: community.memberships[0].role },
    isDemo: process.env.WORKSPACE_PREVIEW === "true" && process.env.NODE_ENV !== "production"
  };
}

/** Matches the existing public poll board; drafts and scheduled ballots stay private. */
export function publicWorkspacePollWhere(now = new Date()): Prisma.PollWhereInput {
  return { OR: [
    { status: "OPEN", closesAt: { gt: now } },
    { status: { in: ["CLOSED", "FINALIZED", "ARCHIVED"] } }
  ] };
}

export function publicWorkspaceCommunityWhere(now = new Date()): Prisma.CommunityWhereInput {
  return { kind: "DAO", OR: [{ polls: { some: publicWorkspacePollWhere(now) } }, { proposalArchives: { some: { revisions: { some: {} } } } }] };
}

/** Read-only workspace admission. Management routes continue using readWorkspaceContext. */
export async function readBrowsingWorkspaceContext(communityId: string) {
  return readBrowsingWorkspaceContextWithSession(communityId, await readSession());
}

/** Lets public pages overlap admission with other reads after one verified session lookup. */
export async function readBrowsingWorkspaceContextWithSession(communityId: string, session: SessionPayload | null) {
  const canPreviewCommittee = session?.subjectType === "user" && session.role === "ADMIN" && !session.userId.startsWith("preview_");
  const canModeratePilot = canPreviewCommittee && publicPilotScope()?.hostId === communityId;
  const demoPersona = session?.subjectType === "user" && isParticipationCreditSandbox() ? demoPersonaForUser(session.userId) : undefined;
  if (session?.subjectType === "user") {
    const managed = await db.community.findFirst({
      where: { id: communityId, ...manageableCommunityWhere(session.userId) },
      select: {
        id: true, name: true, slug: true,
        memberships: {
          where: { userId: session.userId, status: "ACTIVE", role: { in: ["OWNER", "MANAGER"] }, user: { status: "ACTIVE" } },
          select: { role: true }
        }
      }
    });
    if (managed?.memberships[0]) return {
      session,
      community: { id: managed.id, name: managed.name, slug: managed.slug },
      communities: await readManagedCommunities(session.userId),
      viewer: { nick: session.nick, role: managed.memberships[0].role, demoPersona, canPreviewCommittee, canModeratePilot },
      canManage: true,
      isDemo: process.env.WORKSPACE_PREVIEW === "true" && process.env.NODE_ENV !== "production"
    };
  }
  const community = await db.community.findFirst({
    where: { id: communityId, kind: "DAO", ...(session?.subjectType === "user" ? { OR: [publicWorkspaceCommunityWhere(), { daoMembers: { some: { userId: session.userId, status: "ACTIVE", user: { status: "ACTIVE" } } } }] } : publicWorkspaceCommunityWhere()) },
    select: { id: true, name: true, slug: true }
  });
  if (!community) notFound();
  const member = session?.subjectType === "user" ? await db.daoMember.findFirst({ where: { communityId, userId: session.userId, status: "ACTIVE", user: { status: "ACTIVE" } }, select: { id: true } }) : null;
  return {
    session,
    community,
    communities: [community],
    viewer: session ? { nick: session.nick, role: member ? "MEMBER" as const : "VISITOR" as const, canEditProfile: session.subjectType === "user", demoPersona, canPreviewCommittee, canModeratePilot } : null,
    canManage: false,
    // Positional preview fixtures apply only to the complete managed proposal list.
    isDemo: false
  };
}

export async function readPublicProposalDetail(pollId: string, communityId: string) {
  const poll = await db.poll.findFirst({
    where: { id: pollId, communityId, ...publicWorkspacePollWhere() },
    select: {
      id: true, question: true, proposalBody: true, proposalTags: true, status: true,
      opensAt: true, closesAt: true, requestedAmountZat: true, requestedAmountUsdCents: true,
      voteModel: true, quorumPercent: true, passingThresholdPercent: true,
      membershipAction: { select: { type: true, status: true } },
      community: { select: { id: true, name: true, slug: true } },
      treasury: { select: { id: true, kind: true, currency: true } }
    }
  });
  if (!poll?.community) return null;
  return {
    id: poll.id, community: poll.community, title: poll.question, body: poll.proposalBody ?? "",
    tags: normalizeProposalTags(poll.proposalTags), status: poll.status,
    opensAt: poll.opensAt.toISOString(), closesAt: poll.closesAt.toISOString(),
    treasury: poll.treasury,
    requestedAmountZec: poll.requestedAmountZat == null ? null : formatTreasuryZec(poll.requestedAmountZat),
    requestedAmountUsd: poll.requestedAmountUsdCents == null ? null : proposalUsdDecimal(poll.requestedAmountUsdCents),
    governance: normalizeGovernanceRules(poll),
    membershipChange: poll.membershipAction ?? null,
    canEditDraft: false
  };
}
