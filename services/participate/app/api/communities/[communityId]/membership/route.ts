import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth/session";
import { rejectIfUntrustedWriteOrigin } from "@/lib/http/write-origin";
import { AccountMembershipError, createAccountMembershipProposal, initializeAccountRoster, requestDaoMembership, reviewMembershipRequest } from "@/lib/services/account-membership";

const command = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("request"), requestId: z.string().uuid() }).strict(),
  z.object({ operation: z.literal("withdraw"), requestId: z.string().uuid() }).strict(),
  z.object({ operation: z.literal("decline"), requestId: z.string().uuid() }).strict(),
  z.object({ operation: z.literal("initialize"), includeSelf: z.boolean(), requestIds: z.array(z.string().uuid()).max(99) }).strict(),
  z.object({ operation: z.literal("propose"), proposal: z.unknown() }).strict()
]);

export async function POST(request: NextRequest, context: { params: Promise<{ communityId: string }> }) {
  const rejected = rejectIfUntrustedWriteOrigin(request);
  if (rejected) return rejected;
  const session = await readSession();
  if (session?.subjectType !== "user") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = command.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_MEMBERSHIP_REQUEST" }, { status: 400 });
  const { communityId } = await context.params;
  const value = parsed.data;
  try {
    if (value.operation === "request") return NextResponse.json({ request: await requestDaoMembership(communityId, session.userId, { requestId: value.requestId }) });
    if (value.operation === "withdraw" || value.operation === "decline") return NextResponse.json(await reviewMembershipRequest(communityId, session.userId, value.requestId, value.operation));
    if (value.operation === "initialize") return NextResponse.json(await initializeAccountRoster(communityId, session.userId, { includeSelf: value.includeSelf, requestIds: value.requestIds }));
    return NextResponse.json(await createAccountMembershipProposal(communityId, session.userId, value.proposal));
  } catch (error) {
    if (error instanceof AccountMembershipError) return NextResponse.json({ error: error.code }, { status: error.status });
    return NextResponse.json({ error: "MEMBERSHIP_UNAVAILABLE" }, { status: 503 });
  }
}
