import { NextResponse } from "next/server";
import { ParticipationCreditError } from "@/lib/services/participation-credits";

export function privateCreditResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
}

export function participationCreditResponseError(error: unknown) {
  if (error instanceof ParticipationCreditError) return privateCreditResponse({ error: error.code, message: error.message }, error.status);
  return privateCreditResponse({ error: "PARTICIPATION_REQUEST_FAILED" }, 500);
}

export async function readParticipationJson(request: Request): Promise<unknown> {
  const maxBytes = 16 * 1024;
  if (!request.body || !/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) {
    throw new ParticipationCreditError("Submit participation settings as JSON", 400, "INVALID_PARTICIPATION_INPUT");
  }
  const reader = request.body.getReader();
  const bytes = new Uint8Array(maxBytes);
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (chunk.value.byteLength > maxBytes - length) {
        await reader.cancel().catch(() => undefined);
        throw new Error("Request is too large");
      }
      bytes.set(chunk.value, length);
      length += chunk.value.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length)));
  } catch {
    throw new ParticipationCreditError("Enter valid participation settings", 400, "INVALID_PARTICIPATION_INPUT");
  } finally { reader.releaseLock(); }
}
