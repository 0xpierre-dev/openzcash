"use client";

import { useEffect, useRef, useState } from "react";
import { ProposalDiscussion, type DiscussionCapabilities, type DiscussionComment, type DiscussionPolicy } from "@/components/participate/workspace/proposal-discussion";
import { ProposalMarkdown } from "@/components/participate/workspace/proposal-markdown";
import { ArchiveFileVerifier } from "@/components/participate/workspace/archive-file-verifier";
import { ArchiveRecoveryGuide } from "@/components/participate/workspace/archive-recovery-guide";
import { WorkspaceSignInButton } from "@/components/participate/workspace/workspace-auth";
import type { ProposalRecord } from "@/lib/participate/workspace/domain/proposal-record";
import { ArchiveActivity } from "@/components/participate/workspace/archive-activity";
import { SignedDecision } from "@/components/participate/workspace/signed-decision";
import { AbandonmentNotice } from "@/components/participate/workspace/submission-lifecycle";
import { CommitteeLabels } from "@/components/participate/workspace/committee-labels";

export type ProposalPanel = "discussion" | "record";
type Discussion = { comments: DiscussionComment[]; capabilities: DiscussionCapabilities; policy: DiscussionPolicy };
type DiscussionPreview = { commentCount: number; canParticipate: boolean; participation: DiscussionPolicy["participation"] | null };
const date = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " UTC";

// Keep loaded children mounted when folded so closing a panel preserves drafts.
// Reopening refreshes public evidence and permissions without navigating away.
function useDisclosureData<T>(url: string, open: boolean, refreshKey = "", refreshRequest = 0) {
  const [snapshot, setSnapshot] = useState<{ url: string; refreshKey: string; value?: T; failed?: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetch(url, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Unavailable");
      const value = await response.json() as T;
      if (!controller.signal.aborted) setSnapshot({ url, refreshKey, value });
    }).catch(() => { if (!controller.signal.aborted) setSnapshot(previous => ({ url, refreshKey, value: previous?.url === url && previous.refreshKey === refreshKey ? previous.value : undefined, failed: true })); });
    return () => controller.abort();
  }, [url, open, attempt, refreshKey, refreshRequest]);
  const current = snapshot?.url === url && snapshot.refreshKey === refreshKey ? snapshot : null;
  return { value: current?.value, failed: current?.failed, retry: () => { setSnapshot(previous => previous ? { ...previous, failed: false } : null); setAttempt(count => count + 1); } };
}

function LoadState({ failed, retry, label }: { failed?: boolean; retry: () => void; label: string }) {
  return failed ? <div className="proposal-inline-state" role="alert"><span>Could not load {label.toLowerCase()}.</span><button type="button" className="dao-text-button" onClick={retry}>Try again</button></div>
    : <p className="proposal-inline-state" role="status">Loading {label.toLowerCase()}…</p>;
}

export function ProposalInlineDetails({ communityId, recordId, active, sessionKey, onClose, focusComment, preview }: { communityId: string; recordId: string; active: ProposalPanel | null; sessionKey?: string; onClose: () => void; focusComment?: { id: string; request: number }; preview?: DiscussionPreview }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    panel.current?.focus({ preventScroll: true });
    panel.current?.scrollIntoView?.({ block: "nearest", behavior: "auto" });
  }, [active]);
  const [revision, setRevision] = useState<number | null>(null);
  const endpoint = `/api/communities/${encodeURIComponent(communityId)}/archives/${encodeURIComponent(recordId)}`;
  const discussion = useDisclosureData<Discussion>(`${endpoint}/comments`, active === "discussion", sessionKey, focusComment?.request);
  const record = useDisclosureData<{ record: ProposalRecord }>(`${endpoint}${revision ? `?revision=${revision}` : ""}`, active === "record");
  const discussionReady = Boolean(discussion.value || preview);
  const pendingPreview: Discussion | null = active === "discussion" && preview ? { comments: [],
    capabilities: { canPost: preview.canParticipate && preview.commentCount < 500, canReact: preview.canParticipate, canModerate: false },
    policy: { visibility: "PUBLIC", immutable: true, maxLength: 4000, readOnly: false, participation: preview.participation ?? undefined } } : null;
  const shownDiscussion = discussion.value ?? pendingPreview;
  useEffect(() => {
    // A lazy-loaded composer can grow below the viewport after the initial open.
    // Bring it into view without opening the mobile keyboard or losing a draft.
    if (active !== "discussion" || !discussionReady || focusComment) return;
    const composer = panel.current?.querySelector(".dao-comment-composer");
    if (!composer) return;
    const bounds = composer.getBoundingClientRect();
    const viewport = composer.ownerDocument.defaultView?.innerHeight ?? 0;
    if (bounds.bottom > viewport - 80 || bounds.top < 120) composer.scrollIntoView?.({ block: "center" });
  }, [active, discussionReady, focusComment]);
  const focusedId = focusComment?.id, focusRequest = focusComment?.request;
  useEffect(() => {
    if (active !== "discussion" || !focusedId || !discussion.value) return;
    const target = document.getElementById(`comment-${focusedId}`);
    if (!target || !panel.current?.contains(target)) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView?.({ block: "center", behavior: "auto" });
  }, [active, focusedId, focusRequest, discussion.value]);
  return <div ref={panel} tabIndex={-1} className={`proposal-inline${active === "discussion" ? " proposal-inline--comments" : ""}`} id={`proposal-panel-${recordId}`} hidden={!active}>
    <div className="proposal-inline-toolbar"><button type="button" className="dao-text-button" onClick={onClose}>Close <span aria-hidden="true">×</span></button></div>
    <div hidden={active !== "discussion"}>
      {shownDiscussion ? <>
        {discussion.failed ? <LoadState failed retry={discussion.retry} label="Comments" /> : null}
        {!shownDiscussion.capabilities.canReact && !shownDiscussion.policy.readOnly ? <div className="proposal-inline-signin"><WorkspaceSignInButton label="Sign in to participate" className="dao-button" /></div> : null}
        <ProposalDiscussion pollId={recordId} sectionId={`discussion-${recordId}`} embedded showBalance={false} commentsEndpoint={`${endpoint}/comments`} communityId={communityId} initialComments={shownDiscussion.comments} capabilities={shownDiscussion.capabilities} policy={shownDiscussion.policy} loading={!discussion.value} expectedCommentCount={preview?.commentCount} />
      </> : active === "discussion" ? <LoadState failed={discussion.failed} retry={discussion.retry} label="Comments" /> : null}
    </div>
    <div hidden={active !== "record"}>
      {record.value ? <>{record.failed ? <LoadState failed retry={record.retry} label="Record" /> : null}<InlineRecord record={record.value.record} endpoint={endpoint} onRevision={setRevision} /><SignedDecision key={`${record.value.record.manifestHash}:${sessionKey}`} endpoint={endpoint} revision={record.value.record.revision} sessionKey={sessionKey} /></> : active === "record" ? <LoadState failed={record.failed} retry={record.retry} label="Record" /> : null}
    </div>
    {active === "record" ? <ArchiveActivity endpoint={endpoint} /> : null}
  </div>;
}

function InlineRecord({ record, endpoint, onRevision }: { record: ProposalRecord; endpoint: string; onRevision: (revision: number) => void }) {
  const download = `${endpoint}/revisions/${record.revision}`;
  const { proof } = record;
  return <section className="proposal-inline-record" aria-label="Preserved proposal and verification">
    <CommitteeLabels ids={record.labels} />
    {record.abandonment ? <AbandonmentNotice value={record.abandonment} endpoint={endpoint} /> : null}
    <header className="proposal-inline-record-heading"><div><h3>Preserved record</h3><p>{record.kind === "NATIVE_PROPOSAL" ? `Pilot publication · ${date(record.capturedAt)}` : record.kind === "SOURCE_PROPOSAL" ? `Full application captured · ${date(record.capturedAt)}` : record.originalDecisionDate ? `Summary snapshot · ${record.originalDecisionDate}` : `Review snapshot · ${date(record.capturedAt)}`}</p>{record.application ? <p>{record.application.applicant} · {record.application.requestedAmountUsd} USD requested</p> : null}</div>
      {record.revisions.length > 1 ? <label className="dao-comment-sort"><span className="dao-sr-only">Record revision</span><select value={record.revision} onChange={event => onRevision(Number(event.target.value))}>{record.revisions.map(item => <option key={item.revision} value={item.revision}>Revision {item.revision}{item.revision === record.revisions[0].revision ? " · Latest" : ""}</option>)}</select></label> : <span className="dao-eyebrow">Revision {record.revision}</span>}
    </header>
    <ProposalMarkdown>{record.markdown.replace(/^# [^\n]+\n\n/, "")}</ProposalMarkdown>
    <details className="proposal-inline-verification"><summary>Files & verification <span>{proof.label}</span></summary>
      <div className="proposal-inline-proof"><div><strong>{record.fileCount} files · Fingerprint checked</strong><p>SHA-256 checks the preserved contents.</p></div><div><strong>{proof.label}</strong><p>{proof.detail}</p>{proof.evidence ? <p>Checked {date(proof.evidence.checkedAt)}</p> : null}</div></div>
      <div className="proposal-inline-downloads"><a className="dao-button" href={download}>Download revision ↓</a><a className="dao-text-button" href={`${download}?file=proposal.md`}>Markdown ↓</a>{proof.hasReceipt ? <a className="dao-text-button" href={`${download}?file=verification.json`}>Chain receipt ↓</a> : null}</div>
      <ArchiveFileVerifier key={record.manifestHash} manifestHash={record.manifestHash} />
      <details className="dao-archive-details"><summary>Fingerprint & evidence</summary><dl><div><dt>Manifest SHA-256</dt><dd><code>{record.manifestHash}</code></dd></div><div><dt>Snapshot captured</dt><dd>{date(record.capturedAt)}</dd></div>{proof.evidence ? <><div><dt>Transaction</dt><dd><code>{proof.evidence.txid}</code></dd></div><div><dt>Block</dt><dd>{proof.evidence.blockHeight.toLocaleString("en-US")} · {date(proof.evidence.blockTime)}</dd></div><div><dt>Memo</dt><dd><code>{proof.evidence.memo}</code></dd></div></> : null}</dl></details>
      <ArchiveRecoveryGuide download={download} />
    </details>
  </section>;
}
