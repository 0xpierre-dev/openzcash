"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { OPEN_COMMENT_EVENT, type CommentDestination } from "@/lib/domain/discussion-notifications";
import { WorkspaceFrame, type WorkspaceFrameProps } from "@/components/community-workspace";
import { ZcgProposalExamples } from "@/components/zcg-proposal-examples";
import { ProposalEconomyProvider, ProposalEconomyNotice, ProposalEngagement } from "@/components/proposal-economy";
import { ProposalInlineDetails, type ProposalPanel } from "@/components/proposal-inline-details";
import { ZCG_PROPOSAL_EXAMPLES } from "@/lib/data/zcg-proposal-examples";
import { ZCG_REVIEW_PROPOSALS } from "@/lib/data/zcg-review-proposals";
import type { ProposalParticipation, ProposalParticipationBoard } from "@/lib/domain/proposal-participation";
import { ParticipateTour } from "@/components/participate-tour";
import type { SubmissionDraft } from "@/lib/domain/proposal-submission";
import { CommitteeLabels } from "@/components/committee-labels";
import { ZcgProposalLabels } from "@/components/zcg-proposal-labels";
import { AbandonmentNotice, SubmissionLifecycleAction } from "@/components/submission-lifecycle";
import { zcgApprovedBudget } from "@/lib/data/zcg-approved-budgets";
import { formatProposalUsd } from "@/lib/domain/proposal-funding";
import { ProposalZecEstimate, useProposalZecPrice } from "@/components/proposal-zec-estimate";

function proposalFilter(proposal?: ProposalParticipation) {
  return proposal?.sourceCapture?.proposal.outcome ?? (proposal?.abandonment ? "abandoned" : "under_review");
}

export function ProposalWorkspace({ community, communities, viewer, board, initialProfile, initialCreditSummary, embedded = false, drafts = [], initialRecordId, initialCommentId }: Omit<WorkspaceFrameProps, "children"> & { board: ProposalParticipationBoard; drafts?: SubmissionDraft[]; initialRecordId?: string; initialCommentId?: string }) {
  const [panels, setPanels] = useState<Record<string, ProposalPanel | null>>(initialRecordId ? { [initialRecordId]: initialCommentId ? "discussion" : "record" } : {});
  const [commentTarget, setCommentTarget] = useState({ recordId: initialRecordId, id: initialCommentId, request: 0 });
  useEffect(() => {
    function openComment(event: Event) {
      const target = (event as CustomEvent<CommentDestination>).detail;
      if (target?.communityId !== community.id || typeof target.commentId !== "string" || !board.proposals.some(proposal => proposal.recordId === target.recordId)) return;
      event.preventDefault();
      setPanels(previous => ({ ...previous, [target.recordId]: "discussion" }));
      setCommentTarget(previous => ({ recordId: target.recordId, id: target.commentId, request: previous.request + 1 }));
    }
    window.addEventListener(OPEN_COMMENT_EVENT, openComment);
    return () => window.removeEventListener(OPEN_COMMENT_EVENT, openComment);
  }, [community.id, board.proposals]);
  const ids = board.proposals.map(proposal => proposal.recordId);
  const examples = [...ZCG_REVIEW_PROPOSALS, ...ZCG_PROPOSAL_EXAMPLES].filter(proposal => ids.includes(proposal.id) && !board.proposals.find(row => row.recordId === proposal.id)?.sourceCapture);
  const other = board.proposals.filter(proposal => !examples.some(example => example.id === proposal.recordId));
  const price = useProposalZecPrice(other.some(proposal => proposal.sourceCapture?.proposal.outcome === "approved" && !!zcgApprovedBudget(proposal.recordId)));
  function toggle(recordId: string, panel: ProposalPanel) { setPanels(previous => ({ ...previous, [recordId]: previous[recordId] === panel ? null : panel })); }
  function close(recordId: string) {
    const trigger = document.getElementById(`proposal-${panels[recordId] === "discussion" ? "comments" : "read"}-${recordId}`);
    setPanels(previous => ({ ...previous, [recordId]: null }));
    trigger?.focus({ preventScroll: true });
  }
  const renderPanel = (recordId: string) => <ProposalInlineDetails communityId={community.id} recordId={recordId} active={panels[recordId] ?? null} sessionKey={viewer?.nick ?? "guest"} focusComment={commentTarget.recordId === recordId && commentTarget.id ? { id: commentTarget.id, request: commentTarget.request } : undefined} onClose={() => close(recordId)} preview={{ commentCount: board.proposals.find(proposal => proposal.recordId === recordId)?.commentCount ?? 0, canParticipate: board.canParticipate, participation: board.participation }} />;
  const renderActions = (recordId: string) => <ProposalEngagement recordId={recordId} onToggleComments={() => toggle(recordId, "discussion")} commentsOpen={panels[recordId] === "discussion"} />;
  const toolbar = embedded ? <div className="participate-submission-actions">{drafts.length ? <details className="participate-submission-menu"><summary>My proposals <span>{drafts.length}</span></summary><nav aria-label="My proposals">{drafts.map(draft => <div className="participate-submission-menu-item" key={draft.id}><Link href={draft.state === "DRAFT" ? `/participate?compose=${draft.id}` : `/participate?record=${draft.recordId}`}><span>{draft.payload.title || "Untitled proposal"}</span><small>{draft.state === "DRAFT" ? "Draft" : draft.state === "ABANDONED" ? "Abandoned" : "Published in demo"}</small></Link>{draft.state === "DRAFT" ? <SubmissionLifecycleAction draft={draft} /> : null}</div>)}</nav></details> : null}<Link href="/participate?compose=new" prefetch={false} className="dao-button dao-button--primary">+ New proposal</Link></div> : null;
  const nativeRecords = (filter: string) => other.filter(proposal => proposalFilter(proposal) === filter);
  const additionalRecords = (filter: string) => {
    const rows = nativeRecords(filter);
    return rows.length ? <ul className="dao-proposal-list participate-native-list">{rows.map(proposal => {
      const mine = drafts.find(draft => draft.recordId === proposal.recordId);
      const captured = proposal.sourceCapture;
      const requestedUsd = captured?.proposal.outcome === "under_review" ? proposal.sourceRequestedUsd ?? captured.proposal.requestedUsd : null;
      const approvedBudget = captured?.proposal.outcome === "approved" ? zcgApprovedBudget(proposal.recordId) : null;
      const requestedBudget = requestedUsd == null ? null : requestedUsd.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });
      return <li className={`dao-proposal-row${captured ? " dao-zcg-proposal" : ""}`} key={proposal.recordId}>
        <div className="dao-proposal-card-heading dao-zcg-card-heading"><h2 className="dao-proposal-heading"><button type="button" className="dao-proposal-title proposal-title-toggle" aria-expanded={panels[proposal.recordId] === "record"} aria-controls={`proposal-panel-${proposal.recordId}`} onClick={() => toggle(proposal.recordId, "record")}>{captured?.proposal.title ?? proposal.title}</button></h2>{approvedBudget ? <div className="dao-zcg-budget" data-approved role="group" aria-label={`Previously recorded approved budget: ${formatProposalUsd(approvedBudget.usdCents)}`}><div className="dao-zcg-budget-amount"><strong>{formatProposalUsd(approvedBudget.usdCents).replace(" USD", "").replace(/\.00$/, "")}</strong><span>USD</span></div><span>Previously approved budget</span><ProposalZecEstimate budget={approvedBudget} state={price} /></div> : requestedBudget !== null ? <div className="dao-zcg-budget" data-approved={false} role="group" aria-label={`Requested budget: ${requestedBudget} USD`}><div className="dao-zcg-budget-amount"><strong>{requestedBudget}</strong><span>USD requested</span></div></div> : !captured ? <span className={`dao-status${proposal.abandonment ? " dao-status--abandoned" : ""}`}>{proposal.abandonment ? "Abandoned" : "Published in demo"}</span> : null}</div>
        {captured ? <><p className="dao-proposal-created">Submitted {new Date(captured.proposal.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} · @{captured.proposal.applicant}</p><ZcgProposalLabels recordId={proposal.recordId} title={captured.proposal.title} tags={captured.proposal.tags} sourceOverride={captured.source} categoryOverride={proposal.sourceCategory} outcome={captured.proposal.outcome} committeeLabels={proposal.labels} /><p className="dao-proposal-created">Source checked <time dateTime={captured.checkedAt}>{new Date(captured.checkedAt).toLocaleString("en-US", { timeZone: "UTC", timeZoneName: "short" })}</time></p></> : <CommitteeLabels ids={proposal.labels} />}
        {proposal.abandonment ? <AbandonmentNotice value={proposal.abandonment} endpoint={`/api/communities/${encodeURIComponent(community.id)}/archives/${encodeURIComponent(proposal.recordId)}`} /> : null}
        <div className="dao-proposal-card-footer">{renderActions(proposal.recordId)}<button id={`proposal-read-${proposal.recordId}`} type="button" className="dao-text-button proposal-read-toggle" aria-expanded={panels[proposal.recordId] === "record"} aria-controls={`proposal-panel-${proposal.recordId}`} onClick={() => toggle(proposal.recordId, "record")}>Read & verify <span className="proposal-disclosure-arrow" aria-hidden="true">⌄</span></button></div>
        {mine && !proposal.abandonment ? <SubmissionLifecycleAction draft={mine} /> : null}
        {renderPanel(proposal.recordId)}
      </li>;
    })}</ul> : null;
  };
  return <WorkspaceFrame community={community} communities={communities} viewer={viewer} workspaceModule="proposals" creditScope={board.participation?.creditScope} initialProfile={initialProfile} initialCreditSummary={initialCreditSummary} embedded={embedded}>
    <ProposalEconomyProvider communityId={community.id} initial={board}>
      <h1 className="dao-sr-only">Proposals</h1>
      {embedded ? <ParticipateTour signedIn={Boolean(viewer)} canUseCredits={Boolean(viewer && viewer.canEditProfile !== false)} /> : null}
      <ProposalEconomyNotice />
      {ids.length ? <ZcgProposalExamples filterResetKey={commentTarget.request} filterTarget={commentTarget.recordId ? { recordId: commentTarget.recordId, fallback: proposalFilter(board.proposals.find(row => row.recordId === commentTarget.recordId)) } : undefined} committeeLabels={Object.fromEntries(board.proposals.map(row => [row.recordId, row.labels ?? []]))} proposals={examples} communityId={community.id} archiveRecordIds={ids} renderActions={renderActions} toolbar={toolbar} additionalRecords={additionalRecords} additionalCount={filter => nativeRecords(filter).length} inline={{ isRecordOpen: recordId => panels[recordId] === "record", toggleRecord: recordId => toggle(recordId, "record"), renderPanel }} /> : toolbar}
      {!ids.length ? <div className="dao-empty-state"><p>No public proposals yet.</p><Link href={`/communities/${encodeURIComponent(community.id)}/dao`} className="dao-text-button">Open DAO →</Link></div> : null}
    </ProposalEconomyProvider>
  </WorkspaceFrame>;
}
