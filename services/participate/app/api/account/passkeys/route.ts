import { readEmailToken, writeEmailToken } from "@/lib/http/email-auth";
import { passkeyEmailAccess } from "@/lib/services/email-auth";
import { passkeyContext, requirePasskeyOrigin } from "@/lib/auth/passkey-policy";
import { beginPasskeyRegistration, listPasskeys } from "@/lib/services/passkeys";
import { recentPasskeyEmailAccess } from "@/lib/services/passkey-enrollment";
import { passkeyFailure, passkeyManagementInput, passkeyResponse, readPasskeyJson, readPasskeyToken, readRecentPasskeyEmailProof, requirePasskeyAccount, writePasskeyToken, writeRecentPasskeyEmailToken } from "@/lib/http/passkeys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const userId = await requirePasskeyAccount();
    const context = passkeyContext(request);
    const recent = await recentPasskeyEmailAccess(userId, await readRecentPasskeyEmailProof(), context);
    return passkeyResponse({ passkeys: await listPasskeys(userId, context), ...await passkeyEmailAccess(userId), canEnrollWithRecentEmail: Boolean(recent), recentEmailExpiresAt: recent?.expiresAt ?? null });
  } catch (error) { return passkeyFailure(error); }
}

export async function POST(request: Request) {
  try {
    const context = requirePasskeyOrigin(request);
    const userId = await requirePasskeyAccount();
    const input = passkeyManagementInput.parse(await readPasskeyJson(request));
    const result = await beginPasskeyRegistration(userId, input, context, await readPasskeyToken(), await readEmailToken(true), await readRecentPasskeyEmailProof());
    await writeEmailToken("", true);
    await writeRecentPasskeyEmailToken("");
    await writePasskeyToken(result.token);
    return passkeyResponse({ options: result.options });
  } catch (error) { return passkeyFailure(error); }
}
