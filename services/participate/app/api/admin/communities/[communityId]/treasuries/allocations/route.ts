import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { rejectIfUntrustedWriteOrigin } from "@/lib/http/write-origin";
import { allocateTreasuryFunds, TreasuryServiceError } from "@/lib/services/treasuries";

export async function POST(request: Request, context: { params: Promise<{ communityId: string }> }) {
  const originError = rejectIfUntrustedWriteOrigin(request);
  if (originError) return originError;
  const session = await readSession();
  if (!session || session.subjectType !== "user") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const { communityId } = await context.params;
    const result = await allocateTreasuryFunds(communityId, session.userId, await request.json());
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof TreasuryServiceError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "INVALID_TREASURY_INPUT" }, { status: 400 });
    }
    return NextResponse.json({ error: "TREASURY_ALLOCATION_FAILED" }, { status: 500 });
  }
}
