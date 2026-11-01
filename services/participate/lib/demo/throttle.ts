import { db } from "@/lib/db";
import { DemoError } from "./environment";

const LIMIT = 60;
const WINDOW_MS = 10 * 60_000;

/** Per-tester budget for demo fill/reset actions (the TEST seats are shared by everyone). */
export async function throttleDemoAction(userId: string) {
  const id = `demo:${userId}`, now = new Date();
  const saved = await db.passkeyThrottle.findUnique({ where: { id } });
  const live = saved && saved.resetsAt > now;
  if (live && saved.attempts >= LIMIT) throw new DemoError("DEMO_RATE_LIMITED", 429);
  await db.passkeyThrottle.upsert({ where: { id }, create: { id, attempts: 1, resetsAt: new Date(+now + WINDOW_MS) },
    update: { attempts: live ? saved.attempts + 1 : 1, resetsAt: live ? saved.resetsAt : new Date(+now + WINDOW_MS) } });
}

/** TEST seats sign for every tester; their per-user signing throttle is not a limit on any one tester. */
export async function clearSeatThrottle(seatId: string) {
  await db.passkeyThrottle.deleteMany({ where: { id: `decision:${seatId}` } });
}
