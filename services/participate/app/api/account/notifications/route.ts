import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { rejectIfUntrustedWriteOrigin } from "@/lib/http/write-origin";
import { markDiscussionNotificationsRead, NotificationError, readDiscussionNotifications } from "@/lib/services/discussion-notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers });
function failure(error: unknown) {
  if (error instanceof NotificationError) return json({ error: error.code }, error.status);
  if (error instanceof SyntaxError) return json({ error: "INVALID_NOTIFICATION_INPUT" }, 400);
  console.error("discussion_notifications_unavailable");
  return json({ error: "NOTIFICATIONS_UNAVAILABLE" }, 503);
}
async function readInput(request: Request) {
  if (!request.body || request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new NotificationError("INVALID_NOTIFICATION_INPUT");
  const reader = request.body.getReader();
  const bytes = new Uint8Array(16384);
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (size + value.byteLength > bytes.length) { await reader.cancel(); throw new NotificationError("INVALID_NOTIFICATION_INPUT", 413); }
      bytes.set(value, size); size += value.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes.subarray(0, size)));
  } finally { reader.releaseLock(); }
}
export async function GET(request: Request) {
  try {
    const session = await readSession();
    if (!session || session.subjectType !== "user") return json({ error: "unauthorized" }, 401);
    const query = new URL(request.url).searchParams;
    return json(await readDiscussionNotifications(session.userId, query.get("communityId") ?? "", query.get("cursor") ?? undefined, query.get("include") === "proposals"));
  } catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  const rejected = rejectIfUntrustedWriteOrigin(request);
  if (rejected) { Object.entries(headers).forEach(([key, value]) => rejected.headers.set(key, value)); return rejected; }
  try {
    const session = await readSession();
    if (!session || session.subjectType !== "user") return json({ error: "unauthorized" }, 401);
    const query = new URL(request.url).searchParams;
    const communityId = query.get("communityId") ?? "";
    return json(await markDiscussionNotificationsRead(session.userId, communityId, await readInput(request), query.get("include") === "proposals"));
  } catch (error) { return failure(error); }
}
