import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceSignInButton } from "@/components/workspace-auth";
import { WorkspaceFrame } from "@/components/community-workspace";
import { ProposalDiscussion } from "@/components/proposal-discussion";
import { ProposalMarkdown } from "@/components/proposal-markdown";
import { ProposalTags } from "@/components/proposal-tags";
import { ProposalFundingQuote } from "@/components/proposal-funding-quote";
import { ProposalCollectionCheck } from "@/components/proposal-collection-check";
import { readSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { readManagedCommunities } from "@/lib/services/communities";
import { readProposalDetail, readProposalDiscussion, ProposalDiscussionError, type ProposalDetail } from "@/lib/services/proposal-discussion";
import { readPublicProposalDetail } from "@/lib/services/workspace";
import { formatOfficialPollDateTime } from "@/lib/domain/poll-window";
import { formatProposalUsd, parseProposalUsdCents, PROPOSAL_SETTLEMENT_LABEL } from "@/lib/domain/proposal-funding";

export const dynamic = "force-dynamic";

export default async function CommunityProposalPage({ params }: { params: Promise<{ communityId: string; pollId: string }> }) {
  const { communityId, pollId } = await params;
  const session = await readSession();
  let proposal: ProposalDetail | null | undefined;
  let discussion = null;
  if (session) {
    try {
      proposal = await readProposalDetail(pollId, session, communityId);
      discussion = await readProposalDiscussion(pollId, session);
    } catch (error) {
      if (!(error instanceof ProposalDiscussionError && error.status === 404)) throw error;
    }
  }
  if (!proposal || !discussion) {
    proposal = await readPublicProposalDetail(pollId, communityId);
    if (!proposal) notFound();
  }
  const membership = session?.subjectType === "user" ? await db.communityMembership.findFirst({
    where: { communityId, userId: session.userId, status: "ACTIVE", user: { status: "ACTIVE" } },
    select: { role: true }
  }) : null;
  const accountMember = session?.subjectType === "user" && !membership ? await db.daoMember.findFirst({ where: { communityId, userId: session.userId, status: "ACTIVE", user: { status: "ACTIVE" } }, select: { id: true } }) : null;
  const viewer = session ? { nick: session.nick, canEditProfile: session.subjectType === "user", role: membership?.role ?? (accountMember ? "MEMBER" as const : session.subjectType === "poll_voter_access" && discussion ? "PARTICIPANT" as const : "VISITOR" as const) } : null;
  const communities = membership && session ? await readManagedCommunities(session.userId) : [proposal.community];
  const proposalPath = `/communities/${communityId}/proposals/${pollId}`;
  const isDemo = process.env.WORKSPACE_PREVIEW === "true" && process.env.NODE_ENV !== "production";
  const isOpen = proposal.status === "OPEN" && new Date(proposal.opensAt) <= new Date() && new Date(proposal.closesAt) > new Date();
  const statusLabel: Record<string, string> = { DRAFT: "Draft", ANCHORING: "Preparing vote", SCHEDULED: "Scheduled", OPEN: "Voting open", CLOSED: "Tally pending", FINALIZED: "Finalized", ARCHIVED: "Archived" };

  return <WorkspaceFrame community={proposal.community} communities={communities} viewer={viewer} isDemo={isDemo} activeSection="proposals">
    <Link className="dao-back-link" href={session?.subjectType === "user" || !discussion ? `/communities/${communityId}/dao` : "/polls"}>← {session?.subjectType === "user" || !discussion ? "All proposals" : "Back to polls"}</Link>
    <header className="dao-page-heading">
      <p className="dao-eyebrow">{proposal.community.name} · Proposal</p>
      <h1>{proposal.title}</h1>
      <ProposalTags tags={proposal.tags} />
      <div className="dao-form-actions"><span className={`dao-status dao-status--${proposal.status.toLowerCase()}`}>{statusLabel[proposal.status] ?? proposal.status}</span>{proposal.canEditDraft ? <Link className="dao-button" href={`/communities/${communityId}/proposals/${pollId}/edit`}>Edit draft</Link> : null}</div>
      {proposal.status === "CLOSED" ? <p className="dao-notice">Voting has ended. The tally awaits finalization; membership changes remain pending.</p> : null}
    </header>
    <div className="dao-detail-grid">
      <div>
        <article className="dao-panel dao-proposal-body">
          <h2>{proposal.membershipChange ? "Membership change" : "The proposal"}</h2>
          {proposal.membershipChange ? <div className="dao-membership-summary"><strong>{proposal.membershipChange.type === "ADD_MEMBER" ? "Add member" : "Remove member"}{"nick" in proposal.membershipChange && proposal.membershipChange.nick ? ` · ${proposal.membershipChange.nick}` : ""}</strong><span className="dao-status">{proposal.membershipChange.status === "APPLIED" ? "Applied" : proposal.membershipChange.status === "REJECTED" ? "Not approved" : "Pending"}</span><p>Membership changes apply only after an approved, finalized result. Existing ballot access is preserved.</p></div> : null}
          {proposal.membershipChange && "request" in proposal.membershipChange && proposal.membershipChange.request?.status === "WITHDRAWN" ? <p className="dao-notice">The applicant withdrew their request. This proposal can no longer admit that account.</p> : null}
          {proposal.body ? <ProposalMarkdown>{proposal.body}</ProposalMarkdown> : <p>No additional details have been added.</p>}
        </article>
        {discussion ? <ProposalDiscussion pollId={pollId} communityId={communityId} initialComments={discussion.comments} capabilities={discussion.capabilities} policy={discussion.policy} /> : <section id="discussion" className="dao-panel dao-discussion-gate" aria-labelledby="dao-discussion-gate-title">
          <h2 id="dao-discussion-gate-title">Join the discussion</h2>
          <p>Discussion is available to community leaders and this proposal’s eligible participants.</p>
          {!session ? <WorkspaceSignInButton className="dao-button dao-button--primary" next={`${proposalPath}#discussion`} label="Sign in to participate" /> : <p>Use your proposal invitation to participate.</p>}
        </section>}
      </div>
      <aside className="dao-panel dao-detail-meta" aria-label="Proposal information">
        <p className="dao-eyebrow">Funding request</p>
        <h2>{proposal.requestedAmountUsd ? formatProposalUsd(parseProposalUsdCents(proposal.requestedAmountUsd)) : proposal.requestedAmountZec ? `${proposal.requestedAmountZec} ZEC` : "No funding requested"}</h2>
        {proposal.requestedAmountUsd ? <p>{PROPOSAL_SETTLEMENT_LABEL}</p> : proposal.requestedAmountZec ? <p className="dao-notice">Legacy ZEC budget.</p> : null}
        {proposal.treasury ? <p>{proposal.treasury.kind === "COMMUNITY" ? "Community Treasury" : "Sustainability Treasury"}</p> : null}
        {proposal.treasury ? <p className="dao-notice">Requested funds. No payment has been authorized by this page.</p> : null}
        {proposal.requestedAmountUsd && (membership?.role === "OWNER" || membership?.role === "MANAGER") ? <ProposalFundingQuote key={`${pollId}:${proposal.requestedAmountUsd}`} communityId={communityId} pollId={pollId} usdCents={parseProposalUsdCents(proposal.requestedAmountUsd).toString()} /> : null}
        {(proposal.status === "CLOSED" || (proposal.status === "OPEN" && new Date(proposal.closesAt) <= new Date())) && (membership?.role === "OWNER" || membership?.role === "MANAGER") ? <ProposalCollectionCheck key={pollId} communityId={communityId} pollId={pollId} /> : null}
        <dl>
          <div><dt>Voting opens</dt><dd>{formatOfficialPollDateTime(proposal.opensAt)}</dd></div>
          <div><dt>Voting closes</dt><dd>{formatOfficialPollDateTime(proposal.closesAt)}</dd></div>
          <div><dt>Discussion</dt><dd>Leaders and eligible participants</dd></div>
        </dl>
        <details className="dao-rule-details"><summary>Voting rules</summary><p>Quorum: at least {proposal.governance.quorumPercent}% of eligible participants. Approval: at least {proposal.governance.passingThresholdPercent}% of valid votes.</p><p>Abstentions count toward quorum and the approval denominator. Results remain pending until finalization.</p></details>
        {isOpen && discussion ? <Link className="dao-button dao-button--primary" href={`/polls/${pollId}`}>Open ballot ↗</Link> : null}
        {membership?.role === "OWNER" || membership?.role === "MANAGER" ? <Link className="dao-button" href={`/admin/polls/${pollId}`}>Voting setup ↗</Link> : null}
        <p className="dao-notice">Comments contribute to the discussion. Your ballot is submitted separately.</p>
      </aside>
    </div>
  </WorkspaceFrame>;
}
