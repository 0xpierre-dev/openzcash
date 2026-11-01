import { env as processEnvironment } from "node:process";
import { z } from "zod";
import { PasskeyError, requirePasskeyOrigin } from "@/lib/auth/passkey-policy";
import { readSession } from "@/lib/auth/session";
import {
  passkeyFailure,
  passkeyResponse,
  readPasskeyJson,
  requirePasskeyAccount,
} from "@/lib/http/passkeys";
import { DemoError, requireDemoEnvironment } from "@/lib/demo/environment";
import { demoOutcome, fillDemoSeats } from "@/lib/demo/fill";
import { resetDemoTester } from "@/lib/demo/reset";
import { startPracticeRound } from "@/lib/demo/practice";
import { readDemoStatus } from "@/lib/demo/seats";
import { throttleDemoAction } from "@/lib/demo/throttle";

// Demo-only endpoint. Every handler 404s unless the demo environment is active.
export const dynamic = "force-dynamic";
const action = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("fill"),
      recordId: z.string().min(1).max(128),
      outcome: demoOutcome,
      limit: z.number().int().min(1).max(4).optional(),
    })
    .strict(),
  z.object({ action: z.literal("practice"), fresh: z.boolean().optional() }).strict(),
  z.object({ action: z.literal("reset") }).strict(),
]);
function host() {
  const id = processEnvironment.PARTICIPATE_COMMUNITY_ID;
  if (!id) throw new DemoError("DEMO_UNAVAILABLE", 404);
  return id;
}
function failure(error: unknown) {
  if (error instanceof DemoError || error instanceof PasskeyError)
    return passkeyResponse({ error: error.code }, error.status);
  if (error instanceof z.ZodError)
    return passkeyResponse({ error: "DEMO_INVALID_INPUT" }, 400);
  return passkeyFailure(error);
}
export async function GET() {
  try {
    await requireDemoEnvironment();
    const session = await readSession();
    if (session?.subjectType !== "user") throw new PasskeyError("unauthorized", 401);
    return passkeyResponse(await readDemoStatus(host(), session.userId));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    await requireDemoEnvironment();
    const context = requirePasskeyOrigin(request);
    const userId = await requirePasskeyAccount();
    const input = action.parse(await readPasskeyJson(request));
    await throttleDemoAction(userId);
    return passkeyResponse(
      input.action === "fill"
        ? await fillDemoSeats(host(), input.recordId, userId, input.outcome, input.limit)
        : input.action === "practice"
          ? await startPracticeRound(host(), userId, context, input.fresh)
          : await resetDemoTester(host(), userId),
    );
  } catch (error) {
    return failure(error);
  }
}
