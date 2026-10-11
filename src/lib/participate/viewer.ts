import "server-only";

import { headers } from "next/headers";
import {
  participantCookies,
  participationConfigured,
  readParticipantSession,
  readProfile,
  type ParticipantSession,
} from "./service";
import type { AccountProfile } from "./workspace/domain/account-profile";

export type ViewerContext = {
  configured: boolean;
  cookie: string | null;
  session: ParticipantSession | null;
  profile: AccountProfile | null;
};

/** The signed-in participant for this request, if the service is configured and the cookie is valid. */
export async function readViewerContext(): Promise<ViewerContext> {
  const configured = participationConfigured();
  const cookie = participantCookies((await headers()).get("cookie"));
  const session = configured ? await readParticipantSession(cookie) : null;
  const profile = session ? await readProfile(cookie) : null;
  return { configured, cookie, session, profile };
}
