import "server-only";
import { z } from "zod";
import {
  applicationSections,
  requestedAmountFromBody,
  statusFromLabels,
  totalBudgetFromBody,
} from "@/lib/zcg/github-applications-parse";
import { ghHeaders } from "@/lib/zcg/github-headers";
import { boundedRead } from "./timeout";
import type { Evidence } from "./local";

/**
 * One ZCG grant application read first-hand from the public repository where
 * applications are filed as issues. The site's GitHub import covers the open
 * applications; a decided one (approved and still open, closed, or older than
 * the listing) is only readable here. Claude's web fetch cannot read it either:
 * fetch filtering matches hosts, never paths, and github.com as a whole is not
 * a reviewed source.
 */
const REPO = "ZcashCommunityGrants/zcashcommunitygrants";
export const ZCG_APPLICATION_URL = (issue: number) =>
  `https://github.com/${REPO}/issues/${issue}`;
const API_ISSUE = (issue: number) =>
  `https://api.github.com/repos/${REPO}/issues/${issue}`;
/** Closed applications do not change; an approved one gains payment labels at most a few times a year. */
const TTL_MS = 15 * 60_000;
const CACHE_ENTRIES = 200;
/** Enough for the form's summary, milestones and budget sections without one 40 kB application filling the context. */
export const SECTION_LIMITS = { perSection: 700, total: 9_000 };

export const grantApplicationQuerySchema = z
  .object({ issue: z.number().int().min(1).max(99_999) })
  .strict();
export const grantApplicationTool = {
  type: "function" as const,
  name: "read_grant_application",
  strict: true,
  description:
    "Read one ZCG grant application from the public GitHub repository ZcashCommunityGrants/zcashcommunitygrants by issue number (the number at the end of an Application link in decisions or proposals): title, applicant, repository labels, state, dates, the requested amount and total budget in USD parsed from the application form, and plain-text excerpts of each section. Use it for the amount an application asked for after decisions or proposals give its issue number. The text is the applicant's own statement; labels record the committee's verdict and completed payments; a request or an approval is not a payment or proof of delivery.",
  parameters: {
    type: "object",
    properties: { issue: { type: "integer" } },
    required: ["issue"],
    additionalProperties: false,
  },
};

type Issue = {
  number: number;
  title: string;
  html_url: string;
  state: string;
  created_at: string;
  closed_at: string | null;
  comments: number;
  body?: string | null;
  user?: { login?: string } | null;
  labels?: Array<{ name?: string }>;
  pull_request?: unknown;
};
type Reading = { issue: Issue | null; at: number };
const cache = new Map<number, Reading>();

async function fetchIssue(
  issue: number,
  signal: AbortSignal,
): Promise<Issue | null> {
  const hit = cache.get(issue);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.issue;
  const res = await fetch(API_ISSUE(issue), {
    headers: ghHeaders(),
    signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
    cache: "no-store",
  });
  if (res.status === 404) {
    remember(issue, null);
    return null;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as Issue;
  if (typeof json?.number !== "number" || typeof json.title !== "string")
    throw new Error("Invalid issue");
  remember(issue, json);
  return json;
}
function remember(issue: number, value: Issue | null) {
  if (cache.size >= CACHE_ENTRIES)
    cache.delete(cache.keys().next().value as number);
  cache.set(issue, { issue: value, at: Date.now() });
}
/** Tests reset the in-process cache between cases. */
export function forgetGrantApplications() {
  cache.clear();
}

const VERDICT_NOTE =
  "Labels are the committee's own markers on the issue: a decision label records the verdict, payment labels record completed payments. Closed without a decision label normally means the applicant withdrew. The sections are the applicant's statements, cut at the stated limits; a truncated budget or milestone section is incomplete, so do not total it. A requested amount is neither an approved nor a paid amount: approvals come from the decisions topic or the minutes, payments from the ledger.";

export async function lookupGrantApplication(
  raw: unknown,
  signal: AbortSignal,
): Promise<Evidence> {
  const parsed = grantApplicationQuerySchema.safeParse(raw);
  if (!parsed.success)
    return {
      content: JSON.stringify({
        error:
          "Use the issue number of a ZCG application on GitHub, a whole number.",
      }),
    };
  const { issue } = parsed.data;
  const url = ZCG_APPLICATION_URL(issue);
  try {
    const found = await boundedRead(
      () => fetchIssue(issue, signal),
      signal,
      9_000,
    );
    signal.throwIfAborted();
    const retrievedAt = new Date().toISOString();
    if (!found || found.pull_request)
      return {
        content: JSON.stringify({
          data: {
            kind: "grant_application",
            number: issue,
            url,
            missing: true,
            note: "No application has this issue number in the ZCG repository, or it was deleted. A missing issue is not a verdict.",
          },
          sourceUrl: url,
        }),
        source: { title: `ZCG application #${issue}`, url, retrievedAt },
      };
    const labels = (found.labels ?? [])
      .map((label) => label.name ?? "")
      .filter(Boolean);
    const sections = applicationSections(
      found.body ?? undefined,
      SECTION_LIMITS,
    );
    const data = {
      kind: "grant_application",
      number: found.number,
      url: found.html_url || url,
      title: found.title,
      applicant: found.user?.login ?? null,
      state: found.state,
      labels,
      labelStatus: statusFromLabels(labels),
      createdAt: found.created_at,
      closedAt: found.closed_at,
      comments: found.comments ?? 0,
      requestedUsd: requestedAmountFromBody(found.body ?? undefined),
      totalBudgetUsd: totalBudgetFromBody(found.body ?? undefined),
      sections,
      excerpt: {
        sectionsShown: sections.length,
        charactersPerSection: SECTION_LIMITS.perSection,
        totalCharacters: SECTION_LIMITS.total,
        truncatedSections: sections.filter((section) => section.truncated)
          .length,
        completeApplicationUrl: found.html_url || url,
      },
      note: VERDICT_NOTE,
    };
    return {
      content: JSON.stringify({ data, sourceUrl: data.url }),
      source: {
        title: `${found.title} · ZCG application #${found.number}`,
        url: data.url,
        retrievedAt,
      },
    };
  } catch {
    signal.throwIfAborted();
    return {
      content: JSON.stringify({
        error:
          "The GitHub application is unavailable right now; do not invent its amount, status or contents.",
      }),
      source: { title: `ZCG application #${issue}`, url },
    };
  }
}
