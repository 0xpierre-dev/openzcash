// Deployment opt-in after the committee authorizes operation. This never
// replaces verified accounts, invitations, membership or signed ballots.
export function committeeOperationsEnabled() {
  return !publicPilotRequested() && process.env.PARTICIPATE_COMMITTEE_ENABLED === "true";
}
import { publicPilotRequested } from "./public-pilot-policy";
