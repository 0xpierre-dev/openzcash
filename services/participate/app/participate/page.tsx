import { readCommitteePreviewToken } from "@/lib/auth/committee-admin-cookie";
import { ProposalWorkspace } from "@/components/proposal-workspace";
import { ParticipateBridge } from "@/components/participate-bridge";
import { participateParentOrigin } from "@/lib/domain/participate-embed";
import { readBrowsingWorkspaceContextWithSession } from "@/lib/services/workspace";
import { readSession } from "@/lib/auth/session";
import { readProposalParticipationBoard } from "@/lib/services/archive-discussion";
import Link from "next/link";
import { WorkspaceFrame } from "@/components/community-workspace";
import { ParticipateProposalForm } from "@/components/participate-proposal-form";
import { listOwnSubmissions } from "@/lib/services/proposal-submissions";
import "@/app/participate-compose.css";
import { readCommitteeEntry } from "@/lib/services/committee-access";
import { readParticipationHistory } from "@/lib/services/participate-history";
import { ParticipateHistory } from "@/components/participate-history";
import { publicPilotScope } from "@/lib/auth/public-pilot-policy";
import { db } from "@/lib/db";
import { readAccountProfile } from "@/lib/services/account-profile";
import "@/app/participate-history.css";

export const dynamic = "force-dynamic";

export default async function ParticipatePage({ searchParams }: { searchParams: Promise<{ compose?: string; record?: string; comment?: string; view?: string }> }) {
  const search = await searchParams;
  const communityId = process.env.PARTICIPATE_COMMUNITY_ID;
  if (!communityId) return <main className="dao-main"><h1>Participate</h1><p>The proposal workspace is being prepared. Please return shortly.</p></main>;
  const history = search.view === "history" ? readParticipationHistory() : null;
  const session = await readSession();
  const contextPromise = readBrowsingWorkspaceContextWithSession(communityId, session);
  const userId = session?.subjectType === "user" ? session.userId : null;
  const entryPromise = readCommitteePreviewToken().then(token => readCommitteeEntry(communityId, userId ?? undefined, token));
  const profilePromise = userId ? readAccountProfile(userId).catch(() => null) : Promise.resolve(null);
  if (search.view === "history") {
    const scope = publicPilotScope();
    const [context, entry, data, creditScope, initialProfile] = await Promise.all([contextPromise, entryPromise, history,
      scope?.hostId === communityId ? db.community.findUnique({ where: { id: scope.committeeId }, select: { id: true, name: true, kind: true } }) : Promise.resolve(null), profilePromise]);
    const viewer = context.viewer ? { ...context.viewer, committeeEntry: entry ?? undefined } : null;
    return <ParticipateBridge parentOrigin={participateParentOrigin(process.env.PARTICIPATE_PARENT_ORIGIN)}><WorkspaceFrame {...context} viewer={viewer} workspaceModule="proposals" creditScope={creditScope?.kind === "COMMITTEE" ? creditScope : undefined} initialProfile={initialProfile} embedded embeddedSection="history"><ParticipateHistory data={data} /></WorkspaceFrame></ParticipateBridge>;
  }
  const [context, entry, board, drafts, initialProfile] = await Promise.all([
    contextPromise,
    entryPromise,
    readProposalParticipationBoard(communityId, session),
    userId ? listOwnSubmissions(communityId, userId) : Promise.resolve([]),
    profilePromise
  ]);
  const participation = board.participation;
  const initialCreditSummary = userId && participation?.creditScope && participation.availableCredits != null
    ? { communityId: participation.creditScope.id, communityName: participation.creditScope.name, kind: participation.creditScope.kind,
      balance: participation.availableCredits, mode: participation.mode, commentCost: participation.commentCost,
      reactionCost: participation.reactionCost, sandbox: participation.sandbox, paymentReview: participation.paymentReview ?? false }
    : null;
  const viewer = context.viewer ? { ...context.viewer, committeeEntry: entry ?? undefined } : null;
  const initial = drafts.find(draft => draft.id === search.compose);
  return <ParticipateBridge parentOrigin={participateParentOrigin(process.env.PARTICIPATE_PARENT_ORIGIN)}>{search.compose ?
    <WorkspaceFrame {...context} viewer={viewer} workspaceModule="proposals" creditScope={board.participation?.creditScope} initialProfile={initialProfile} initialCreditSummary={initialCreditSummary} embedded>
      {search.compose !== "new" && !initial ? <div className="dao-empty-state"><h1>Draft unavailable</h1><p>Sign in with its author’s account to open it.</p><Link className="dao-button" href="/participate">Back to proposals</Link></div> :
        <ParticipateProposalForm key={search.compose} initial={initial} drafts={drafts} signedIn={session?.subjectType === "user"} sandbox={board.participation?.sandbox ?? false} publicationMode={board.publicationMode ?? "demo"} balance={board.participation?.availableCredits ?? null} communityId={communityId} creditScopeId={board.participation?.creditScope?.id ?? ""} />}
    </WorkspaceFrame> : <ProposalWorkspace key={`${search.record ?? "board"}:${search.comment ?? ""}`} embedded community={context.community} communities={context.communities} viewer={viewer} board={board} initialProfile={initialProfile} initialCreditSummary={initialCreditSummary} drafts={drafts} initialRecordId={search.record} initialCommentId={search.comment} />}</ParticipateBridge>;
}
