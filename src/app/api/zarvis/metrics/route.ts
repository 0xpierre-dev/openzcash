import { getIsAdmin } from "@/lib/auth/admin";
import { zarvisConfig } from "@/lib/zarvis/config";
import { metricsSnapshot } from "@/lib/zarvis/metrics";
import { alertState } from "@/lib/zarvis/alerts";
import { dailyMetrics, LATENCY_BOUNDS_MS, spendTodayUsd } from "@/lib/zarvis/metrics-store";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!await getIsAdmin()) return new Response(null, { status: 403 });
  const config = zarvisConfig();
  // Durable rows are optional context: a slow or missing table never hides the live process counters.
  let daily = null;
  try { daily = await dailyMetrics(14); } catch { daily = null; }
  return Response.json({
    process: metricsSnapshot(),
    quota: {
      paused: config.quotaPause.active,
      resumesAt: config.quotaPause.until,
      dailyLimit: config.dailyLimit,
      hourlyLimit: config.hourlyLimit,
      networkDailyLimit: config.networkDailyLimit,
      networkWindowLimit: config.networkWindowLimit,
      dailyUsdCap: config.dailyUsdCap,
      estimatedSpendTodayUsd: spendTodayUsd(),
    },
    alerts: alertState(),
    daily,
    dailyLatencyBucketBoundsMs: LATENCY_BOUNDS_MS.map((b) => Number.isFinite(b) ? b : null),
  }, { headers: { "Cache-Control": "no-store" } });
}
