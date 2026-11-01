import { NextResponse, type NextRequest } from "next/server";
import { readArchiveActivity } from "@/lib/services/activity-anchors";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
export async function GET(request: NextRequest, context: { params: Promise<{ communityId: string; recordId: string }> }) {
  const before = request.nextUrl.searchParams.get("before");
  if (before !== null && (!/^[1-9]\d{0,9}$/.test(before) || Number(before) > 2147483647)) return NextResponse.json({ error: "INVALID_CURSOR" }, { status: 400, headers });
  const round = request.nextUrl.searchParams.get("round");
  if (round !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(round)) return NextResponse.json({ error: "INVALID_REVIEW" }, { status: 400, headers });
  try {
    const { communityId, recordId } = await context.params;
    const cursor = before ? Number(before) : undefined;
    const result = round ? await readArchiveActivity(communityId, recordId, cursor, round) : await readArchiveActivity(communityId, recordId, cursor);
    return NextResponse.json(result ?? { error: "NOT_FOUND" }, { status: result ? 200 : 404, headers });
  } catch { return NextResponse.json({ error: "ACTIVITY_UNAVAILABLE" }, { status: 503, headers }); }
}
