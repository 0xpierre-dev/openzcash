import { z } from "zod";
import { isZcgUnderReview } from "@/lib/domain/zcg-review";
import { parseZcgSourceEvidence, sourceIssueSchema, ZCG_ISSUES_API, type SourceEvidence } from "./source-updates";

export type { SourceEvidence } from "./source-updates";
export class SourceDiscoveryError extends Error {
  constructor(readonly code: string, readonly retryAfterMs = 300_000) { super(code); }
}

const candidateSchema = z.object({ number: z.number().int().positive().safe(), state: z.string(),
  updated_at: z.string().datetime(), labels: z.array(z.object({ name: z.string() }).passthrough()), pull_request: z.unknown().optional() }).passthrough();
const PAGE_LIMIT = 20;

/** Only fixed repository URLs reach this helper, never upstream links or user-supplied URLs. */
async function fetchSourceJson(url: URL, fetcher: typeof fetch, token?: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20_000), headers: {
      Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "OpenZcash-Participate-discovery",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    } });
  } catch { throw new SourceDiscoveryError("SOURCE_UNAVAILABLE"); }
  if (!response.ok) {
    const retry = Number(response.headers.get("retry-after")) * 1000;
    const reset = Number(response.headers.get("x-ratelimit-reset")) * 1000 - Date.now();
    throw new SourceDiscoveryError(response.status === 403 || response.status === 429 ? "SOURCE_RATE_LIMITED" : "SOURCE_HTTP_ERROR",
      Math.min(86_400_000, Math.max(300_000, Number.isFinite(retry) ? retry : 0, Number.isFinite(reset) ? reset : 0)));
  }
  const reader = response.body?.getReader(); if (!reader) throw new SourceDiscoveryError("SOURCE_INVALID_RESPONSE");
  let bytes = 0; const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break; bytes += part.value.length;
      if (bytes > 8 * 1024 * 1024) throw new SourceDiscoveryError("SOURCE_RESPONSE_TOO_LARGE");
      chunks.push(part.value);
    }
  } catch (error) {
    if (error instanceof SourceDiscoveryError) throw error;
    throw new SourceDiscoveryError("SOURCE_UNAVAILABLE");
  } finally { void reader.cancel().catch(() => undefined); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new SourceDiscoveryError("SOURCE_INVALID_RESPONSE"); }
}

async function discover(since: Date, until: Date, includeUpdates: boolean, fetcher: typeof fetch, token?: string) {
  if (!Number.isFinite(since.getTime()) || !Number.isFinite(until.getTime()) || since > until)
    throw new SourceDiscoveryError("SOURCE_WINDOW_INVALID");
  const issues: unknown[] = [], seen = new Set<number>();
  for (let page = 1; page <= PAGE_LIMIT; page++) {
    const url = new URL(ZCG_ISSUES_API);
    url.search = new URLSearchParams({ state: includeUpdates ? "all" : "open", sort: "updated", direction: "asc", per_page: "100", page: String(page), since: since.toISOString() }).toString();
    const payload = await fetchSourceJson(url, fetcher, token);
    const parsed = z.array(candidateSchema).max(100).safeParse(payload);
    if (!parsed.success) throw new SourceDiscoveryError("SOURCE_INVALID_RESPONSE");
    for (const row of parsed.data) {
      if (seen.has(row.number)) continue; seen.add(row.number);
      const updated = new Date(row.updated_at);
      if (updated < since || updated > until || Object.hasOwn(row, "pull_request")) continue;
      if (!includeUpdates && !isZcgUnderReview({ state: row.state, labels: row.labels.map(label => label.name) })) continue;
      issues.push(row);
    }
    if (parsed.data.length < 100) return issues;
  }
  throw new SourceDiscoveryError("SOURCE_PAGINATION_LIMIT");
}

/** Legacy intake remains conservative for callers that accept only new pending applications. */
export async function discoverZcgProposals(since: Date, until: Date, fetcher: typeof fetch = fetch, token?: string) {
  return discover(since, until, false, fetcher, token);
}

/** Known official archives may close or lose review labels; scope authorization remains with the worker. */
export async function discoverZcgUpdates(since: Date, until: Date, fetcher: typeof fetch = fetch, token?: string) {
  return discover(since, until, true, fetcher, token);
}

export async function fetchZcgIssue(issueNumber: number, fetcher: typeof fetch = fetch, token?: string) {
  z.number().int().positive().safe().parse(issueNumber);
  const parsed = sourceIssueSchema.safeParse(await fetchSourceJson(new URL(`${ZCG_ISSUES_API}/${issueNumber}`), fetcher, token));
  if (!parsed.success || parsed.data.number !== issueNumber) throw new SourceDiscoveryError("SOURCE_INVALID_RESPONSE");
  return parsed.data;
}

/** Full serial scans are bounded and fail as a unit, so no partial evidence becomes an anchor. */
export async function fetchZcgSourceEvidence(issueNumber: number, fetcher: typeof fetch = fetch, token?: string): Promise<SourceEvidence> {
  z.number().int().positive().safe().parse(issueNumber);
  async function pages(resource: "events" | "comments") {
    const rows: unknown[] = [];
    const seen = new Map<number, string>();
    let totalBytes = 0;
    for (let page = 1; page <= 10; page++) {
      const url = new URL(`${ZCG_ISSUES_API}/${issueNumber}/${resource}`);
      url.search = new URLSearchParams({ per_page: "100", page: String(page) }).toString();
      const payload = await fetchSourceJson(url, fetcher, token);
      const parsed = z.array(z.object({ id: z.number().int().positive().safe() }).passthrough()).max(100).safeParse(payload);
      if (!parsed.success) throw new SourceDiscoveryError("SOURCE_INVALID_RESPONSE");
      for (const row of parsed.data) {
        const encoded = JSON.stringify(row); totalBytes += Buffer.byteLength(encoded);
        if (totalBytes > 8 * 1024 * 1024) throw new SourceDiscoveryError("SOURCE_RESPONSE_TOO_LARGE");
        const before = seen.get(row.id);
        if (before && before !== encoded) throw new SourceDiscoveryError("SOURCE_CHANGED_DURING_CAPTURE");
        if (before) continue;
        seen.set(row.id, encoded); rows.push(row);
      }
      if (parsed.data.length < 100) return rows;
    }
    throw new SourceDiscoveryError("SOURCE_PAGINATION_LIMIT");
  }
  const events = await pages("events");
  const comments = await pages("comments");
  try { return parseZcgSourceEvidence(issueNumber, events, comments); }
  catch { throw new SourceDiscoveryError("SOURCE_EVIDENCE_INVALID"); }
}
