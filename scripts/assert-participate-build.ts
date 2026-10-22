import { participationUpstream } from "../src/lib/participate/upstream";

if (!participationUpstream(process.env.PARTICIPATE_UPSTREAM_URL)) {
  throw new Error("A valid PARTICIPATE_UPSTREAM_URL build argument is required to preserve the Participate API rewrites");
}
console.log("[build] Participate upstream configured");
