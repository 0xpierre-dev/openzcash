import { isDemoAccount } from "./email-policy";

/** Explicit, scope-bound free pilot. Never enables the local shared persona. */
export function publicPilotRequested() {
  return process.env.PARTICIPATE_PUBLIC_DEMO === "true";
}

export function publicPilotScope() {
  if (!publicPilotRequested()) return null;
  const hostId = process.env.PARTICIPATE_COMMUNITY_ID?.trim();
  const committeeId = process.env.PARTICIPATE_DEMO_COMMITTEE_ID?.trim();
  if (!hostId || !committeeId || hostId === committeeId || hostId.length > 128 || committeeId.length > 128) return null;
  if (process.env.NODE_ENV === "production") {
    try {
      const origin = new URL(process.env.APP_BASE_URL ?? "");
      if (origin.protocol !== "https:" || origin.username || origin.password || ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) return null;
    } catch { return null; }
  }
  return { hostId, committeeId };
}

export function isPublicPilotCommittee(community: { id: string; kind: string }) {
  return community.kind === "COMMITTEE" && publicPilotScope()?.committeeId === community.id;
}

export function isVerifiedPilotAccount(user: { id: string; email?: string | null; emailVerifiedAt?: Date | null }) {
  return !isDemoAccount(user.id) && Boolean(user.email && user.emailVerifiedAt);
}

/** Publication maturity is independent of the free/demo credit and committee policies. */
export function participantPublicationMode(): "production" | "demo" {
  return publicPilotScope() && process.env.PARTICIPATE_PUBLICATION_MODE === "production" ? "production" : "demo";
}
