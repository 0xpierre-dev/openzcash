import { NextResponse, type NextRequest } from "next/server";
import { readActivityReceipt } from "@/lib/services/activity-anchors";
import { canonicalJson } from "@/lib/archive/format";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
export async function GET(request: NextRequest, context: { params: Promise<{ communityId: string; recordId: string; eventId: string }> }) {
  const { communityId, recordId, eventId } = await context.params;
  if (!/^[a-f0-9-]{36}$/.test(eventId)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers });
  try {
    const result = await readActivityReceipt(communityId, recordId, eventId);
    if (!result) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers });
    if (request.nextUrl.searchParams.get("download") === "1") return new NextResponse(canonicalJson(result.bundle), { headers: {
      ...headers, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="activity-${eventId}.json"`
    } });
    return NextResponse.json({ receipt: result.bundle, proof: result.proof }, { headers });
  } catch { return NextResponse.json({ error: "ACTIVITY_UNAVAILABLE" }, { status: 503, headers }); }
}
