import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { readCommunityTreasuries, TreasuryServiceError } from "@/lib/services/treasuries";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ communityId: string }> }) {
  const session = await readSession();
  if (!session || session.subjectType !== "user") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const { communityId } = await context.params;
    const treasuries = await readCommunityTreasuries(communityId, session.userId);
    return NextResponse.json({ treasuries }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof TreasuryServiceError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "TREASURY_READ_FAILED" }, { status: 500 });
  }
}
