import "server-only";
import { ghHeaders } from "./github-headers";

const REPO = "ZcashCommunityGrants/zcashcommunitygrants";
const TTL_MS = 6 * 60 * 60_000;

type CachedIssueDate = { at: number; createdAt: string };
const cache = new Map<number, CachedIssueDate>();

type GitHubIssueDateResponse = {
  created_at?: string;
};

/** Creation timestamp for one issue in the official ZCG application repo. */
export async function getZcgIssueCreatedAt(
  issueNumber: number,
): Promise<string | null> {
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) return null;

  const now = Date.now();
  const hit = cache.get(issueNumber);
  if (hit && now - hit.at < TTL_MS) return hit.createdAt;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/issues/${issueNumber}`,
      {
        headers: ghHeaders(),
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      },
    );
    if (!res.ok) return null;

    const issue = (await res.json()) as GitHubIssueDateResponse;
    const createdAt = issue.created_at;
    if (!createdAt || Number.isNaN(Date.parse(createdAt))) return null;

    cache.set(issueNumber, { at: now, createdAt });
    return createdAt;
  } catch {
    return null;
  }
}
