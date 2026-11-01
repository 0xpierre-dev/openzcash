import { z } from "zod";
import { requireEmailOrigin } from "@/lib/auth/email-policy";
import { requestPasskeyEmailCode } from "@/lib/services/email-auth";
import { emailFailure, emailResponse, readEmailJson, readEmailToken, requireEmailAccount, writeEmailToken } from "@/lib/http/email-auth";
export const runtime = "nodejs";
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), label: z.string().trim().min(1).max(60) }).strict(),
  z.object({ action: z.literal("remove"), passkeyId: z.string().min(1).max(128) }).strict()
]);
export async function POST(request: Request) {
  try {
    const origin = requireEmailOrigin(request);
    const userId = await requireEmailAccount();
    const input = inputSchema.parse(await readEmailJson(request));
    const { token, expiresIn, retryAfter } = await requestPasskeyEmailCode(userId, input.action, input.action === "add" ? input.label : input.passkeyId, origin, await readEmailToken(true));
    await writeEmailToken(token, true);
    return emailResponse({ sent: true, expiresIn, retryAfter });
  } catch (error) { return emailFailure(error); }
}
