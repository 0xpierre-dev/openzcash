import { historyResponseSchema } from "@/lib/domain/participate-history";
import { participateParentOrigin } from "@/lib/domain/participate-embed";

/** Read only the configured portal's public register; never forward cookies or session state. */
export async function readParticipationHistory() {
  const origin = participateParentOrigin(process.env.PARTICIPATE_PARENT_ORIGIN);
  if (!origin) return null;
  try {
    const response = await fetch(`${origin}/api/participate/history`, {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000), headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const result = historyResponseSchema.safeParse(await response.json());
    return result.success ? { rows: result.data.rows, origin } : null;
  } catch { return null; }
}
