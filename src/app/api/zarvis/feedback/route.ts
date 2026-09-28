import { sameOrigin } from "@/lib/zarvis/validation";
import { readBoundedJson } from "@/lib/zarvis/request-body";
import { recordFeedback } from "@/lib/zarvis/metrics";
import { FEEDBACK_REASON_IDS } from "@/lib/zarvis/feedback";
import { z } from "zod";
/** A reason is a fixed id and only accompanies a "Needs work" vote; no free text is accepted. */
const schema = z.object({ ticket: z.string().max(400), helpful: z.boolean(), reason: z.enum(FEEDBACK_REASON_IDS).optional() }).strict().refine((d) => !(d.helpful && d.reason), { message: "reason only with helpful: false" });
export async function POST(request: Request) {
  const respond = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });
  if (!sameOrigin(request)) return respond(403);
  try {
    const data = schema.safeParse(await readBoundedJson(request, 1024));
    if (!data.success) return respond(400);
    return respond(recordFeedback(data.data.ticket, data.data.helpful, Date.now(), data.data.reason) ? 204 : 409);
  } catch { return respond(400); }
}
