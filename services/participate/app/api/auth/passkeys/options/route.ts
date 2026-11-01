import { requirePasskeyOrigin } from "@/lib/auth/passkey-policy";
import { beginPasskeyAuthentication } from "@/lib/services/passkeys";
import { passkeyFailure, passkeyResponse, readPasskeyToken, writePasskeyToken } from "@/lib/http/passkeys";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const context = requirePasskeyOrigin(request);
    const result = await beginPasskeyAuthentication(context, await readPasskeyToken());
    await writePasskeyToken(result.token);
    return passkeyResponse({ options: result.options });
  } catch (error) { return passkeyFailure(error); }
}
