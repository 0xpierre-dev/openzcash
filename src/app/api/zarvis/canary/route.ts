/**
 * On-demand Zarvis canary. Gated by the shared CRON_SECRET like /api/cron/refresh,
 * not by an admin session. The server process also runs the same check hourly
 * (src/lib/zarvis/canary-schedule.ts); a request during a scheduled run shares it.
 */
import { timingSafeEqual } from "node:crypto";
import { executeCanary } from "@/lib/zarvis/canary-schedule";

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
  const result = await executeCanary();
  return Response.json(result, { status: result.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
