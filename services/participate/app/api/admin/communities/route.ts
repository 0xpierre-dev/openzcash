import { NextResponse, type NextRequest } from "next/server";
import { readSession } from "@/lib/auth/session";
import { rejectIfUntrustedWriteOrigin } from "@/lib/http/write-origin";
import { createCommunity, readManagedCommunities, CommunityServiceError } from "@/lib/services/communities";

export async function GET() {
  const session = await readSession();
  if (!session || session.subjectType !== "user") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ communities: await readManagedCommunities(session.userId) });
}

export async function POST(request: NextRequest) {
  const originError = rejectIfUntrustedWriteOrigin(request);
  if (originError) return originError;
  const session = await readSession();
  if (!session || session.subjectType !== "user") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const input = await request.json();
    const community = await createCommunity(input, session.userId);
    return NextResponse.json({ community }, { status: 201 });
  } catch (error) {
    if (error instanceof CommunityServiceError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "INVALID_COMMUNITY_INPUT" }, { status: 400 });
    }
    return NextResponse.json({ error: "COMMUNITY_CREATE_FAILED" }, { status: 500 });
  }
}
