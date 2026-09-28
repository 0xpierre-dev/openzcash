import { zarvisConfig } from "@/lib/zarvis/config";
import { latestCanary } from "@/lib/zarvis/metrics-store";
import { providerDegraded } from "@/lib/zarvis/alerts";
export const dynamic = "force-dynamic";
/** A failed canary counts against health for this long; an old failure with no newer run is stale, not proof of recovery. */
const CANARY_RELEVANT_MS = 6 * 3_600_000;
/** Public health: booleans and timestamps only, no configuration values or counters. */
export async function GET() {
  const canary = await latestCanary();
  const recentCanaryFailure = canary?.ok === false && Date.now() - Date.parse(canary.at) < CANARY_RELEVANT_MS;
  const degraded = recentCanaryFailure || providerDegraded();
  return Response.json({ ok: zarvisConfig().enabled && !degraded, lastCanaryAt: canary?.at ?? null, lastCanaryOk: canary?.ok ?? null, degraded }, { headers: { "Cache-Control": "no-store" } });
}
