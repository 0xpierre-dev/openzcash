import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { findManagedCommunity } from "@/lib/services/communities";
import { db } from "@/lib/db";
import { publicWorkspaceCommunityWhere } from "@/lib/services/workspace";
import { readCoinholderDashboard } from "@/lib/services/coinholder";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ communityId: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  const session = await readSession();
  try {
    const { communityId } = await context.params;
    const managed = session?.subjectType === "user" ? await findManagedCommunity(communityId, session.userId) : null;
    const published = managed ?? await db.community.findFirst({
      where: { id: communityId, ...publicWorkspaceCommunityWhere() }, select: { id: true }
    });
    if (!published) return NextResponse.json({ error: "COMMUNITY_NOT_FOUND" }, { status: 404, headers });
    const dashboard = await readCoinholderDashboard();
    if (new URL(request.url).searchParams.get("history") === "omit") {
      const { activity, revealHistory, ...refresh } = dashboard;
      void activity;
      void revealHistory;
      return NextResponse.json({ ...refresh, activityOmitted: true }, { headers });
    }
    return NextResponse.json(dashboard, { headers });
  } catch {
    return NextResponse.json({ error: "COINHOLDER_READ_FAILED" }, { status: 503, headers });
  }
}
