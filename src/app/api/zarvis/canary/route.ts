/**
 * Scheduled Zarvis canary. Gated by the shared CRON_SECRET like /api/cron/refresh,
 * not by an admin session. Runs the zero-cost starter checks (and one paid model
 * question only with ZARVIS_CANARY_MODEL=true), stores the result and alerts on failure.
 */
import { timingSafeEqual } from "node:crypto";
import { zarvisConfig } from "@/lib/zarvis/config";
import { runCanary } from "@/lib/zarvis/canary";
import { recordCanary } from "@/lib/zarvis/metrics-store";
import { sendAlert } from "@/lib/zarvis/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(req: Request, secret: string): boolean {
  const a = Buffer.from(req.headers.get("authorization") ?? "", "utf8");
  const b = Buffer.from(`Bearer ${secret}`, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 503 });
  if (!authorized(request, secret)) return new Response("Unauthorized", { status: 401 });
  const config = zarvisConfig();
  const result = await runCanary(AbortSignal.timeout(90_000), { model: config.canaryModel && config.enabled });
  const stored = await recordCanary(result);
  if (!result.ok) sendAlert("canary", `Zarvis canary failed: ${result.failed} of ${result.passed + result.failed} checks (${result.failedCases.join(", ")}).`);
  console.info(JSON.stringify({ event: "zarvis.canary", at: result.at, ok: result.ok, ms: result.ms, passed: result.passed, failed: result.failed, failedCases: result.failedCases, stored }));
  return Response.json({ ...result, stored }, { status: result.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
