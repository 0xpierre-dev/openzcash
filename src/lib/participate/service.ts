import "server-only";

import { cached } from "@/lib/cache/memo";
import { archiveEndpoint, participationCommunityId } from "./config";
import { participationUpstream } from "./upstream";
import type { AccountProfile } from "./workspace/domain/account-profile";
import type { ProposalParticipationBoard } from "./workspace/domain/proposal-participation";
import type { SubmissionDraft } from "./workspace/domain/proposal-submission";
import type { CommitteeWorkspace } from "./workspace/domain/committee";

/**
 * Server-to-server reads from the private participation service. The browser
 * never learns the upstream origin; it only talks to the same-origin API paths
 * that next.config.ts forwards. A failed read is reported as `null` so a page
 * can show a retry state instead of failing while the service restarts.
 */
const TIMEOUT_MS = 8_000;
const BOARD_TTL_MS = 30_000;
export const SESSION_COOKIE = "zcap_session";
const FORWARDED_COOKIE =
  /^(?:__Host-)?(?:zcap_|participate_|participate-|committee-)/;

export type ParticipantSession = {
  userId: string;
  nick: string;
  role: "ADMIN" | "CREATOR" | "USER";
};

export type UpstreamResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string };

export function participationUpstreamOrigin(): string | null {
  return participationUpstream(process.env.PARTICIPATE_UPSTREAM_URL);
}

export function participationConfigured(): boolean {
  return participationUpstreamOrigin() !== null;
}

/** Only the service's own cookies cross the boundary, never the portal's. */
export function participantCookies(
  header: string | null | undefined,
): string | null {
  if (!header) return null;
  const kept = header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => FORWARDED_COOKIE.test(part));
  return kept.length ? kept.join("; ") : null;
}

export function hasParticipantSession(
  cookie: string | null | undefined,
): boolean {
  return Boolean(
    cookie && new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=`).test(cookie),
  );
}

export async function upstreamJson<T>(
  path: string,
  options: {
    cookie?: string | null;
    timeoutMs?: number;
    fetcher?: typeof fetch;
    origin?: string | null;
  } = {},
): Promise<UpstreamResult<T>> {
  const origin =
    options.origin === undefined
      ? participationUpstreamOrigin()
      : options.origin;
  if (!origin)
    return { ok: false, status: 503, error: "PARTICIPATION_NOT_CONFIGURED" };
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? TIMEOUT_MS,
  );
  try {
    const headers: Record<string, string> = { accept: "application/json" };
    if (options.cookie) headers.cookie = options.cookie;
    const response = await (options.fetcher ?? fetch)(`${origin}${path}`, {
      headers,
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error =
        data &&
        typeof data === "object" &&
        typeof (data as { error?: unknown }).error === "string"
          ? (data as { error: string }).error
          : `HTTP_${response.status}`;
      return { ok: false, status: response.status, error };
    }
    return { ok: true, status: response.status, data: data as T };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { ok: false, status: 0, error: aborted ? "TIMEOUT" : "UNREACHABLE" };
  } finally {
    clearTimeout(timer);
  }
}

const EMPTY_BOARD: ProposalParticipationBoard = {
  proposals: [],
  participation: null,
  canParticipate: false,
};

async function fetchBoard(
  cookie: string | null,
): Promise<ProposalParticipationBoard> {
  const result = await upstreamJson<{ board: ProposalParticipationBoard }>(
    `${archiveEndpoint(participationCommunityId())}/participation`,
    { cookie },
  );
  if (!result.ok) {
    if (result.status === 404) return EMPTY_BOARD;
    throw new Error(result.error);
  }
  if (!result.data?.board || !Array.isArray(result.data.board.proposals))
    throw new Error("INVALID_BOARD");
  return result.data.board;
}

/** Public counts are memoized briefly; a signed-in visitor always reads fresh likes and balances. */
export async function readBoard(
  cookie: string | null,
): Promise<ProposalParticipationBoard | null> {
  try {
    if (hasParticipantSession(cookie)) return await fetchBoard(cookie);
    return await cached(
      `participate:board:${participationCommunityId()}`,
      BOARD_TTL_MS,
      () => fetchBoard(null),
    );
  } catch {
    return null;
  }
}

export async function readParticipantSession(
  cookie: string | null,
): Promise<ParticipantSession | null> {
  if (!hasParticipantSession(cookie)) return null;
  const result = await upstreamJson<{
    session: Record<string, unknown> | null;
  }>("/api/auth/session", { cookie });
  if (!result.ok) return null;
  const session = result.data?.session;
  if (
    !session ||
    session.subjectType !== "user" ||
    typeof session.userId !== "string" ||
    typeof session.nick !== "string"
  )
    return null;
  const role =
    session.role === "ADMIN" || session.role === "CREATOR"
      ? session.role
      : "USER";
  return { userId: session.userId, nick: session.nick, role };
}

export async function readDrafts(
  cookie: string | null,
): Promise<SubmissionDraft[] | null> {
  const result = await upstreamJson<{ drafts: SubmissionDraft[] }>(
    "/api/participate/proposals",
    { cookie },
  );
  return result.ok && Array.isArray(result.data?.drafts)
    ? result.data.drafts
    : null;
}

export async function readProfile(
  cookie: string | null,
): Promise<AccountProfile | null> {
  const result = await upstreamJson<{ profile: AccountProfile }>(
    "/api/account/settings",
    { cookie },
  );
  return result.ok && result.data?.profile ? result.data.profile : null;
}

/** The committee view: access, queue, members and history as the service computes them for this visitor. */
export async function readCommitteeWorkspace(
  cookie: string | null,
): Promise<CommitteeWorkspace | null> {
  const result = await upstreamJson<CommitteeWorkspace>(
    "/api/participate/committee",
    { cookie },
  );
  return result.ok && typeof result.data?.access === "string"
    ? result.data
    : null;
}
