import { timingSafeEqual } from "node:crypto";
import { executeLegalCollection } from "@/lib/legal/schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const headers = { "Cache-Control": "no-store" };

function authorized(request: Request, secret: string): boolean {
  const actual = Buffer.from(request.headers.get("authorization") ?? "", "utf8");
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Dedicated public-source collection only. No URL, day or force override from callers. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ ok: false, error: "Collection trigger unavailable" }, { status: 503, headers });
  if (!authorized(request, secret)) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401, headers });
  try {
    const result = await executeLegalCollection("cron");
    // Deliberately project safe fields; collector exceptions and payloads are not exposed.
    const body = {
      ok: result.ok, outcome: result.outcome, day: result.day,
      nextRetryAt: "nextRetryAt" in result ? result.nextRetryAt : null,
      sources: "sources" in result ? result.sources.map(source => ({
        sourceId: source.sourceId, status: source.status, itemCount: source.itemCount, lastSuccessAt: source.lastSuccessAt,
      })) : [],
    };
    const status = result.outcome === "locked" || result.outcome === "retry-later" ? 202 : result.ok ? 200 : 503;
    return Response.json(body, { status, headers });
  } catch {
    return Response.json({ ok: false, error: "Collection unavailable" }, { status: 503, headers });
  }
}
