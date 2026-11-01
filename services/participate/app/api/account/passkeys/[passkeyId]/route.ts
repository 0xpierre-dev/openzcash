import { readEmailToken, writeEmailToken } from "@/lib/http/email-auth";
import { z } from "zod";
import { requirePasskeyOrigin } from "@/lib/auth/passkey-policy";
import { revokePasskey } from "@/lib/services/passkeys";
import { passkeyFailure, passkeyResponse, readPasskeyJson, requirePasskeyAccount } from "@/lib/http/passkeys";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ passkeyId: string }> }) {
  try {
    const context = requirePasskeyOrigin(request);
    const userId = await requirePasskeyAccount();
    const { code } = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(await readPasskeyJson(request));
    const { passkeyId } = await params;
    await revokePasskey(userId, passkeyId, { code, token: await readEmailToken(true) }, context);
    await writeEmailToken("", true);
    return passkeyResponse({ removed: true });
  } catch (error) { return passkeyFailure(error); }
}
