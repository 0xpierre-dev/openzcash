import "server-only";

import { headers } from "next/headers";
import {
  participantCookies,
  participationConfigured,
  readParticipantSession,
  type ParticipantSession,
} from "./service";

export type ViewerContext = {
  configured: boolean;
  cookie: string | null;
  session: ParticipantSession | null;
};

/**
 * The signed-in participant for this request, if the service is configured
 * and the cookie is valid. Only the session is read here: pages start the
 * profile, board and draft reads together once they know who is asking.
 */
export async function readViewerContext(): Promise<ViewerContext> {
  const configured = participationConfigured();
  const cookie = participantCookies((await headers()).get("cookie"));
  const session = configured ? await readParticipantSession(cookie) : null;
  return { configured, cookie, session };
}
