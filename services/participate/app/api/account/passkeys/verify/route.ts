import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { requirePasskeyOrigin } from "@/lib/auth/passkey-policy";
import { finishPasskeyRegistration } from "@/lib/services/passkeys";
import { passkeyRegistrationInput, passkeyFailure, passkeyResponse, readPasskeyJson, readPasskeyToken, requirePasskeyAccount, writePasskeyToken } from "@/lib/http/passkeys";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const context = requirePasskeyOrigin(request);
    const userId = await requirePasskeyAccount();
    const credential = passkeyRegistrationInput.parse(await readPasskeyJson(request));
    const token = await readPasskeyToken();
    await writePasskeyToken("");
    const passkey = await finishPasskeyRegistration(userId, token, credential as RegistrationResponseJSON, context);
    return passkeyResponse({ passkey }, 201);
  } catch (error) { return passkeyFailure(error); }
}
