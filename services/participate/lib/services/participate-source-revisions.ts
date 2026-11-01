import { db } from "@/lib/db";
import { canonicalJson, decodeFile, verifyArchivePackage } from "@/lib/archive/format";
import { officialSourceIssue } from "@/lib/archive/source-identity";
import { buildSourceUpdate, verifySourceProposal } from "@/lib/archive/source-proposals";
import { discoverZcgUpdates, fetchZcgIssue, fetchZcgSourceEvidence, SourceDiscoveryError } from "@/lib/archive/source-discovery";
import { ZCG_REVIEW_SOURCE } from "@/lib/domain/zcg-review";
import { sourceIssueSchema } from "@/lib/archive/source-updates";
import { zcgSourceIntakeSkipReason } from "@/lib/archive/source-intake-policy";

type Scope = { hostId: string; committeeId: string };
type Checked = Awaited<ReturnType<typeof verifyArchivePackage>>;
type Candidate = { number: number; html_url: string; updated_at: string; state: string; labels: { name: string; color?: string; description?: string | null }[]; pull_request?: unknown };
type Log = (hostId: string, event: string, details?: Record<string, string | number | boolean | null>, level?: string, jobId?: string, code?: string) => Promise<void>;

function sameSourceRead(left: Candidate, right: Candidate) {
  // List and detail endpoints may contain different incidental API fields.
  const pick = (input: Candidate) => {
    const row = input as Candidate & { body?: string; title?: string; created_at?: string; state_reason?: string; user?: { login: string }; labels: { name: string; color?: string; description?: string | null }[] };
    return { number: row.number, url: row.html_url, body: row.body ?? null, title: row.title ?? null,
      state: row.state, reason: row.state_reason ?? null, created: row.created_at ?? null, updated: row.updated_at,
      author: row.user?.login ?? null, pullRequest: Object.hasOwn(row, "pull_request"),
      labels: row.labels.map(label => ({ name: label.name, color: label.color ?? null, description: label.description ?? null })).sort((a, b) => a.name.localeCompare(b.name)) };
  };
  return canonicalJson(pick(left)) === canonicalJson(pick(right));
}

function legacyChanged(previous: Checked, next: Awaited<ReturnType<typeof buildSourceUpdate>>) {
  const capture = next.capture;
  if (capture.schema !== "PARTICIPATE_SOURCE_CAPTURE_V2") throw new SourceDiscoveryError("SOURCE_CAPTURE_VERSION_INVALID");
  const source = previous.bundle.files.find(file => file.path === (previous.manifest.kind === "SOURCE_PROPOSAL" ? "source.json" : "record.json"));
  if (!source) throw new SourceDiscoveryError("SOURCE_PREDECESSOR_INVALID");
  const old = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decodeFile(source)));
  if (previous.manifest.kind === "HISTORICAL_SUMMARY") {
    if (old.outcome !== capture.proposal.outcome) return true;
  } else {
    const record = previous.manifest.kind === "SOURCE_PROPOSAL" ? old.proposal : old;
    if (record.state !== capture.proposal.state || canonicalJson([...record.labels].sort()) !== canonicalJson([...capture.proposal.labels].sort())) return true;
  }
  const after = Date.parse(previous.manifest.capturedAt);
  return capture.evidence.events.some(event => Date.parse(event.createdAt) > after)
    || capture.evidence.comments.some(comment => Date.parse(comment.updatedAt) > after);
}

/** Immutable archives establish identity. Mutable demo metadata and public links never do. */
async function knownSources(scope: Scope) {
  const rows = await db.proposalArchive.findMany({ where: { communityId: scope.hostId, committeeId: scope.committeeId }, select: {
    recordId: true, revisions: { orderBy: { revision: "desc" }, take: 1, select: { manifestHash: true, packageJson: true } }
  } });
  const known = new Map<number, Checked>();
  for (const row of rows) {
    const revision = row.revisions[0]; if (!revision) continue;
    const checked = await verifyArchivePackage(JSON.parse(revision.packageJson), revision.manifestHash);
    if (checked.manifest.recordId !== row.recordId) throw new SourceDiscoveryError("SOURCE_ARCHIVE_IDENTITY_MISMATCH");
    const issueNumber = officialSourceIssue(checked.manifest); if (!issueNumber) continue;
    if (known.has(issueNumber)) throw new SourceDiscoveryError("SOURCE_AMBIGUOUS_ARCHIVE");
    known.set(issueNumber, checked);
  }
  // Captured but not yet imported revisions are also immutable predecessors.
  const jobs = await db.participateAutomationJob.findMany({ where: { hostId: scope.hostId, committeeId: scope.committeeId }, orderBy: { revision: "asc" } });
  for (const job of jobs) {
    const checked = await verifySourceProposal(JSON.parse(job.packageJson), job.manifestHash);
    if (officialSourceIssue(checked.manifest) !== job.issueNumber || job.sourceUrl !== checked.capture.source.url || job.revision !== checked.manifest.revision)
      throw new SourceDiscoveryError("SOURCE_JOB_IDENTITY_MISMATCH");
    const current = known.get(job.issueNumber);
    if (current && current.manifest.recordId !== checked.manifest.recordId) throw new SourceDiscoveryError("SOURCE_AMBIGUOUS_ARCHIVE");
    if (!current || checked.manifest.revision > current.manifest.revision) known.set(job.issueNumber, checked);
    else if (checked.manifest.revision === current.manifest.revision && checked.manifestHash !== current.manifestHash) throw new SourceDiscoveryError("SOURCE_PREDECESSOR_INVALID");
  }
  return known;
}

/** One polling window plus a bounded reconciliation of existing archives. No wallet access. */
export async function captureOfficialSourceRevisions(scope: Scope, since: Date, until: Date, log: Log, fetcher: typeof fetch = fetch, token?: string) {
  return captureSourceRevisions(scope, since, until, log, fetcher, token);
}

/** Operator-selected reconciliation of existing official archives only. No discovery or wallet access. */
export async function reconcileOfficialSourceRevisions(scope: Scope, issueNumbers: readonly number[], log: Log, fetcher: typeof fetch = fetch, token?: string) {
  validateTargets(issueNumbers);
  const now = new Date();
  return captureSourceRevisions(scope, now, now, log, fetcher, token, { mode: "reconcile", issueNumbers });
}

/** Bounded catch-up of missed official applications, using the normal intake policy. No wallet access. */
export async function captureSelectedOfficialProposals(scope: Scope, issueNumbers: readonly number[], log: Log, fetcher: typeof fetch = fetch, token?: string) {
  validateTargets(issueNumbers);
  const now = new Date();
  return captureSourceRevisions(scope, now, now, log, fetcher, token, { mode: "intake", issueNumbers });
}

function validateTargets(issueNumbers: readonly number[]) {
  if (!Array.isArray(issueNumbers) || issueNumbers.length < 1 || issueNumbers.length > 10
    || issueNumbers.some(number => !Number.isSafeInteger(number) || number < 1)
    || new Set(issueNumbers).size !== issueNumbers.length) throw new SourceDiscoveryError("SOURCE_RECONCILIATION_TARGETS_INVALID");
}

async function captureSourceRevisions(scope: Scope, since: Date, until: Date, log: Log, fetcher: typeof fetch, token?: string,
  targets?: { mode: "reconcile" | "intake"; issueNumbers: readonly number[] }) {
  const known = await knownSources(scope);
  // Validate the complete selection before any fetch, checkpoint, job, or log is written.
  if (targets?.mode === "reconcile" && targets.issueNumbers.some(number => !known.has(number))) throw new SourceDiscoveryError("SOURCE_RECONCILIATION_TARGET_UNKNOWN");
  const candidates = targets ? [] : await discoverZcgUpdates(since, until, fetcher, token) as Candidate[];
  const checkpoints = await db.participateSourceCheckpoint.findMany({ where: { hostId: scope.hostId } });
  const checkpointByIssue = new Map(checkpoints.map(row => [row.issueNumber, row]));
  const touched = new Set<number>();
  let queued = 0, reconciled = 0;
  let failure: SourceDiscoveryError | undefined;

  const capture = async (candidate: Candidate, reconcile = false) => {
    const previous = known.get(candidate.number);
    if (candidate.html_url !== `${ZCG_REVIEW_SOURCE}/${candidate.number}` || Object.hasOwn(candidate, "pull_request")) throw new SourceDiscoveryError("SOURCE_IDENTITY_MISMATCH");
    if (!previous) {
      const issue = sourceIssueSchema.parse(candidate);
      const reason = zcgSourceIntakeSkipReason({ ...issue, labels: issue.labels.map(label => label.name) });
      if (reason) {
        await log(scope.hostId, "source_candidate_skipped", { issueNumber: candidate.number }, "info", undefined, reason);
        return false;
      }
    }
    const checkpoint = checkpointByIssue.get(candidate.number);
    if (checkpoint && previous && checkpoint.recordId !== previous.manifest.recordId) throw new SourceDiscoveryError("SOURCE_CHECKPOINT_IDENTITY_MISMATCH");
    touched.add(candidate.number);
    if (!reconcile && checkpoint && checkpoint.sourceUpdatedAt.toISOString() === new Date(candidate.updated_at).toISOString()) return;
    const evidence = await fetchZcgSourceEvidence(candidate.number, fetcher, token);
    // Do not combine the old issue state with events/comments from a newer edit.
    const confirmed = await fetchZcgIssue(candidate.number, fetcher, token) as Candidate;
    if (!sameSourceRead(confirmed, candidate)) throw new SourceDiscoveryError("SOURCE_CHANGED_DURING_CAPTURE");
    const next = await buildSourceUpdate(candidate, candidate.number, new Date().toISOString(), previous ? {
      recordId: previous.manifest.recordId, revision: previous.manifest.revision, manifestHash: previous.manifestHash
    } : null, evidence);
    if (next.capture.schema !== "PARTICIPATE_SOURCE_CAPTURE_V2") throw new SourceDiscoveryError("SOURCE_CAPTURE_VERSION_INVALID");
    const observationHash = next.capture.observationHash;
    let changed = !previous;
    if (previous) {
      if (previous.manifest.kind === "SOURCE_PROPOSAL") {
        const old = await verifySourceProposal(previous.bundle, previous.manifestHash);
        changed = old.capture.schema === "PARTICIPATE_SOURCE_CAPTURE_V2" ? old.capture.observationHash !== observationHash : legacyChanged(previous, next);
      } else changed = legacyChanged(previous, next);
    }
    const event = previous ? "source_revision_captured" : "proposal_captured";
    const details = { issueNumber: candidate.number, recordId: next.manifest.recordId, revision: next.manifest.revision,
      manifestHash: next.manifestHash, previousManifestHash: next.manifest.previousManifestHash, outcome: next.capture.proposal.outcome };
    const job = await db.$transaction(async tx => {
      const job = changed ? await tx.participateAutomationJob.create({ data: { ...scope, issueNumber: candidate.number, revision: next.manifest.revision,
        sourceUrl: next.capture.source.url, sourceFingerprint: observationHash, manifestHash: next.manifestHash, packageJson: canonicalJson(next.bundle) } }) : null;
      await tx.participateSourceCheckpoint.upsert({ where: { hostId_issueNumber: { hostId: scope.hostId, issueNumber: candidate.number } },
        create: { hostId: scope.hostId, issueNumber: candidate.number, recordId: next.manifest.recordId, sourceUpdatedAt: new Date(candidate.updated_at), checkedAt: new Date() },
        update: { sourceUpdatedAt: new Date(candidate.updated_at), checkedAt: new Date() } });
      if (job) await tx.participateAutomationLog.create({ data: { hostId: scope.hostId, jobId: job.id, event, level: "info", details } });
      return job;
    });
    if (job) {
      queued++; known.set(candidate.number, next);
      console.log(JSON.stringify({ time: new Date().toISOString(), level: "info", event, hostId: scope.hostId, jobId: job.id, ...details }));
    }
    return true;
  };

  if (targets) {
    const eventPrefix = targets.mode === "intake" ? "source_target_intake" : "source_target_reconciliation";
    for (const issueNumber of targets.issueNumbers) {
      try { if (await capture(await fetchZcgIssue(issueNumber, fetcher, token) as Candidate, true)) reconciled++; }
      catch (error) {
        const currentFailure = error instanceof SourceDiscoveryError ? error : new SourceDiscoveryError("SOURCE_CAPTURE_INVALID");
        await log(scope.hostId, `${eventPrefix}_failed`, { issueNumber }, "error", undefined, currentFailure.code);
        failure ??= currentFailure;
        if (["SOURCE_RATE_LIMITED", "SOURCE_UNAVAILABLE"].includes(currentFailure.code)) throw currentFailure;
      }
    }
    // This separate event leaves the regular polling reconciliation budget unchanged.
    await log(scope.hostId, `${eventPrefix}_completed`, { attempted: targets.issueNumbers.length, reconciled, queued });
    if (failure) throw failure;
    return { candidates: targets.issueNumbers.length, queued, reconciled };
  }

  for (const candidate of candidates) {
    if (!known.has(candidate.number) && !sourceIssueSchema.safeParse(candidate).success) {
      await log(scope.hostId, "source_candidate_quarantined", { issueNumber: candidate.number }, "warn", undefined, "SOURCE_CANDIDATE_INVALID");
      continue;
    }
    try { await capture(candidate); }
    catch (error) {
      await log(scope.hostId, "source_capture_failed", { issueNumber: candidate.number }, "error", undefined,
        error instanceof SourceDiscoveryError ? error.code : "SOURCE_CAPTURE_INVALID");
      const currentFailure = error instanceof SourceDiscoveryError ? error : new SourceDiscoveryError("SOURCE_CAPTURE_INVALID");
      failure ??= currentFailure;
      // A malformed known source must not prevent independent valid captures.
      // Rate limiting and unavailable upstreams do stop further API requests.
      if (["SOURCE_RATE_LIMITED", "SOURCE_UNAVAILABLE"].includes(currentFailure.code)) throw currentFailure;
    }
  }
  // A bounded scan catches changes the former one-shot worker
  // skipped. Hourly reconciliation also detects comment edits/deletions when an
  // upstream issue.updated_at timestamp is not bumped. Never backfill unknown issues.
  // Unauthenticated GitHub has a much smaller hourly budget. Reserve room for
  // normal discovery and new updates instead of exhausting it on reconciliation.
  const lastReconciliation = token ? null : await db.participateAutomationLog.findFirst({ where: { hostId: scope.hostId, event: "source_reconciliation_completed" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const reconciliationAllowed = !lastReconciliation || until.getTime() - lastReconciliation.createdAt.getTime() >= 900_000;
  const due = [...known.keys()].filter(number => reconciliationAllowed && !touched.has(number) && (!checkpointByIssue.has(number)
    || checkpointByIssue.get(number)!.checkedAt.getTime() < until.getTime() - 3_600_000))
    .sort((a, b) => (checkpointByIssue.get(a)?.checkedAt.getTime() ?? 0) - (checkpointByIssue.get(b)?.checkedAt.getTime() ?? 0) || a - b).slice(0, token ? 2 : 1);
  for (const issueNumber of due) {
    try { await capture(await fetchZcgIssue(issueNumber, fetcher, token) as Candidate, true); reconciled++; }
    catch (error) {
      await log(scope.hostId, "source_reconciliation_failed", { issueNumber }, "error", undefined,
        error instanceof SourceDiscoveryError ? error.code : "SOURCE_CAPTURE_INVALID");
      const currentFailure = error instanceof SourceDiscoveryError ? error : new SourceDiscoveryError("SOURCE_CAPTURE_INVALID");
      failure ??= currentFailure;
      if (["SOURCE_RATE_LIMITED", "SOURCE_UNAVAILABLE"].includes(currentFailure.code)) throw currentFailure;
    }
  }
  if (due.length) await log(scope.hostId, "source_reconciliation_completed", { attempted: due.length, reconciled, queued });
  if (failure) throw failure;
  return { candidates: candidates.length, queued, reconciled };
}
