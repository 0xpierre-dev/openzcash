import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceFrame } from "@/components/community-workspace";
import { WorkspaceSignInButton } from "@/components/workspace-auth";
import { ProposalMarkdown } from "@/components/proposal-markdown";
import { ProposalDiscussion } from "@/components/proposal-discussion";
import { ProposalEconomyProvider, ProposalEconomyNotice, ProposalEngagement } from "@/components/proposal-economy";
import { ArchiveFileVerifier } from "@/components/archive-file-verifier";
import { ArchiveRecoveryGuide } from "@/components/archive-recovery-guide";
import { ArchiveActivity } from "@/components/archive-activity";
import { SignedDecision } from "@/components/signed-decision";
import { readBrowsingWorkspaceContext } from "@/lib/services/workspace";
import { readArchiveRevision } from "@/lib/services/proposal-archives";
import { readArchiveDiscussion } from "@/lib/services/archive-discussion";
import { decodeFile } from "@/lib/archive/format";
import { buildArchiveProof, selectArchiveAnchor } from "@/lib/archive/proof";

export const dynamic = "force-dynamic";
const date = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " UTC";
export default async function ArchivePage({ params, searchParams }: { params: Promise<{ communityId: string; recordId: string }>; searchParams: Promise<{ revision?: string }> }) {
  const { communityId, recordId } = await params;
  const query = await searchParams;
  if (query.revision && !/^(?:[1-9]\d{0,3}|10000)$/.test(query.revision)) notFound();
  const context = await readBrowsingWorkspaceContext(communityId);
  const row = await readArchiveRevision(communityId, recordId, query.revision ? Number(query.revision) : undefined);
  if (!row) notFound();
  const discussion = await readArchiveDiscussion(communityId, recordId, context.session);
  const path = `/communities/${encodeURIComponent(communityId)}/archives/${encodeURIComponent(recordId)}`;
  const download = `/api/communities/${encodeURIComponent(communityId)}/archives/${encodeURIComponent(recordId)}/revisions/${row.revision}`;
  const textFile = row.bundle.files.find(file => file.path === "proposal.md");
  const body = textFile ? new TextDecoder().decode(decodeFile(textFile)) : "";
  const anchor = selectArchiveAnchor(row.anchors);
  const proof = buildArchiveProof(row, anchor);
  const { evidence, verified } = proof;
  const latestRevision = row.archive.revisions[0].revision;
  const selectedPath = `${path}?revision=${row.revision}`;
  const recordType = row.manifest.kind === "NATIVE_PROPOSAL" ? "Pilot proposal" : row.manifest.kind === "SOURCE_PROPOSAL" ? "Official ZCG application" : row.manifest.kind === "REVIEW_SNAPSHOT" ? "ZCG application" : "Historical ZCG record";
  const recordTiming = row.manifest.kind === "NATIVE_PROPOSAL" ? `Published in demo · ${date(row.manifest.submittedAt)}` : row.manifest.kind === "SOURCE_PROPOSAL" ? `Official source captured · ${date(row.manifest.capturedAt)}` : row.manifest.kind === "REVIEW_SNAPSHOT" ? `Under review at capture · ${date(row.manifest.capturedAt)}` : `Summary snapshot · Original decision ${row.manifest.originalDecisionDate}`;
  return <WorkspaceFrame community={context.community} communities={context.communities} viewer={context.viewer} activeSection="proposals" workspaceModule="proposals" creditScope={discussion.policy.participation?.creditScope}>
    <ProposalEconomyProvider communityId={communityId} initial={{ canParticipate: discussion.capabilities.canReact, participation: discussion.policy.participation ?? null, proposals: [discussion.proposal] }}>
    <Link className="dao-back-link" href={`/communities/${encodeURIComponent(communityId)}#proposals`}>← Proposals</Link>
    <header className="dao-archive-heading"><p className="dao-eyebrow">{recordType} <span>· Revision {row.revision}</span></p><h1>{row.manifest.title}</h1><p>{recordTiming}</p><a className="dao-text-button dao-archive-jump" href="#verification">Files & verification ↓</a></header>
    <ProposalEconomyNotice />
    <div className="proposal-record-engagement"><ProposalEngagement recordId={recordId} /></div>
    {row.revision !== latestRevision ? <p className="dao-archive-version-notice">You’re reading revision {row.revision}. <Link href={path}>Read the latest revision →</Link></p> : null}
    <div className="dao-archive-layout">
      <div className="dao-archive-content">
        <article className="dao-panel dao-archive-document"><div className="dao-section-heading"><h2>Preserved record</h2><a className="dao-text-button" href={`${download}?file=proposal.md`}>Download Markdown ↓</a></div><ProposalMarkdown>{body.replace(/^# [^\n]+\n\n/, "")}</ProposalMarkdown></article>
        <details className="dao-archive-history"><summary>Revision history <span>{row.archive.revisions.length}</span></summary><nav aria-label="Revision history">{row.archive.revisions.map(revision => <Link key={revision.revision} href={`${path}?revision=${revision.revision}`} aria-current={revision.revision === row.revision ? "page" : undefined}><strong>Revision {revision.revision}{revision.revision === latestRevision ? " · Latest" : ""}</strong><span>Published {date(revision.createdAt.toISOString())}</span></Link>)}</nav><p>Each revision preserves its own files and fingerprint. Discussion is shared across this record’s revisions.</p></details>
        {!context.session ? <div className="dao-archive-join"><span>Add your perspective to the community discussion.</span><WorkspaceSignInButton className="dao-button" next={`${selectedPath}#discussion`} label="Sign in" /></div> : null}
        <ProposalDiscussion pollId={row.archive.id} showBalance={false} commentsEndpoint={`/api/communities/${encodeURIComponent(communityId)}/archives/${encodeURIComponent(recordId)}/comments`} communityId={communityId} initialComments={discussion.comments} capabilities={discussion.capabilities} policy={discussion.policy} />
        <ArchiveActivity endpoint={`/api/communities/${encodeURIComponent(communityId)}/archives/${encodeURIComponent(recordId)}`} />
        <SignedDecision key={`${row.manifestHash}:${context.session?.userId ?? "guest"}`} endpoint={`/api/communities/${encodeURIComponent(communityId)}/archives/${encodeURIComponent(recordId)}`} revision={row.revision} sessionKey={context.session?.userId} />
      </div>
      <aside className="dao-panel dao-archive-proof" id="verification" aria-label="Revision verification">
        <div className="dao-archive-proof-top"><span className="dao-eyebrow">Publication proof</span><span className="dao-archive-network">{anchor?.network ?? "No network record"}</span></div>
        <h2>Files & verification</h2>
        <ol className="dao-archive-steps"><li data-complete="true"><span>01</span><div><strong>Files preserved</strong><p>{row.manifest.files.length} files · Revision {row.revision}</p></div><b aria-label="Complete">✓</b></li><li data-complete="true"><span>02</span><div><strong>Fingerprint checked</strong><p>SHA-256 · Exact file contents</p></div><b aria-label="Complete">✓</b></li><li data-complete={verified}><span>03</span><div><strong>{proof.label}</strong><p>{proof.detail}</p>{evidence ? <p>Checked {date(evidence.checkedAt)}</p> : null}</div><b aria-label={verified ? "Verified at last check" : "Pending"}>{verified ? "✓" : "○"}</b></li></ol>
        <a className="dao-button dao-button--primary dao-archive-download" href={download}>Download revision ↓</a>
        {proof.receipt ? <a className="dao-text-button dao-archive-receipt" href={`${download}?file=verification.json`}>Download chain receipt ↓</a> : null}
        <ArchiveFileVerifier manifestHash={row.manifestHash} />
        <details className="dao-archive-details"><summary>Fingerprint & evidence</summary><dl><div><dt>Manifest SHA-256</dt><dd><code>{row.manifestHash}</code></dd></div><div><dt>Snapshot captured</dt><dd>{date(row.manifest.capturedAt)}</dd></div>{evidence ? <><div><dt>Transaction</dt><dd><code>{evidence.txid}</code></dd></div><div><dt>Block</dt><dd>{evidence.blockHeight.toLocaleString("en-US")} · {date(evidence.blockTime)}</dd></div><div><dt>Last check</dt><dd>{date(evidence.checkedAt)}</dd></div><div><dt>Memo</dt><dd><code>{evidence.memo}</code></dd></div></> : <div><dt>Chain evidence</dt><dd>No verified receipt yet.</dd></div>}</dl><p>The block timestamp records inclusion, separately from the original decision date. New versions receive new fingerprints.</p></details>
        <ArchiveRecoveryGuide download={download} />
      </aside>
    </div>
    </ProposalEconomyProvider>
  </WorkspaceFrame>;
}
