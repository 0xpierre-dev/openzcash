import "server-only";
/** Operator alerts: counts and labels only, at most one per type per ten minutes per process. */
export type AlertType = "provider_failures" | "rejection_spike" | "spend_cap" | "canary";
export const ALERT_INTERVAL_MS = 600_000;
const WINDOW = 20, STREAK = 3, RATIO = 0.25, MIN_SAMPLE = 8, SPIKE = 20;
type AlertState = { lastSent: Map<AlertType, number>; outcomes: boolean[]; streak: number; rejections: number[]; sent: number; failed: number; lastErrorClass: string | null };
const globalState = globalThis as typeof globalThis & { __zarvisAlertsV1?: AlertState };
const state: AlertState = globalState.__zarvisAlertsV1 ??= { lastSent: new Map(), outcomes: [], streak: 0, rejections: [], sent: 0, failed: 0, lastErrorClass: null };
function webhook(): string | null {
  const raw = process.env.ZARVIS_ALERT_WEBHOOK_URL?.trim(); if (!raw) return null;
  try { return new URL(raw).protocol === "https:" ? raw : null; } catch { return null; }
}
/** Posts a Discord/Slack-compatible payload. Returns whether a delivery was attempted. */
export function sendAlert(type: AlertType, message: string, now = Date.now()): boolean {
  const url = webhook(); if (!url) return false;
  const last = state.lastSent.get(type); if (last !== undefined && now - last < ALERT_INTERVAL_MS) return false;
  state.lastSent.set(type, now); state.sent++;
  const body = JSON.stringify({ content: message, text: message });
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(5_000) })
    .then((response) => { if (!response.ok) state.failed++; }, () => { state.failed++; });
  return true;
}
const failures = () => state.outcomes.filter((failed) => failed).length;
export const providerDegraded = () => state.streak >= STREAK || (state.outcomes.length >= MIN_SAMPLE && failures() / state.outcomes.length >= RATIO);
export function noteOutcome(outcome: "completed" | "failed" | "aborted", errorClass?: string | null, now = Date.now()) {
  if (outcome === "aborted") return;
  const failed = outcome === "failed";
  state.outcomes.push(failed); if (state.outcomes.length > WINDOW) state.outcomes.shift();
  state.streak = failed ? state.streak + 1 : 0;
  if (failed) state.lastErrorClass = errorClass ?? "unknown";
  if (failed && providerDegraded()) sendAlert("provider_failures", `Zarvis: ${failures()} of the last ${state.outcomes.length} answers failed (${state.streak} in a row; latest class ${state.lastErrorClass}).`, now);
}
export function noteRejection(kind: "quota" | "busy" | "spend_cap", now = Date.now()) {
  state.rejections = state.rejections.filter((at) => now - at < ALERT_INTERVAL_MS); state.rejections.push(now);
  if (kind === "spend_cap") sendAlert("spend_cap", "Zarvis: the daily estimated spend cap was reached; answers are declined until 00:00 UTC.", now);
  if (state.rejections.length >= SPIKE) sendAlert("rejection_spike", `Zarvis: ${state.rejections.length} requests declined (quota/busy/spend cap) in the last 10 minutes.`, now);
}
export function alertState() {
  return { configured: webhook() !== null, sent: state.sent, failed: state.failed, providerDegraded: providerDegraded(), recentFailures: failures(), recentSample: state.outcomes.length, failureStreak: state.streak, rejectionsLast10Min: state.rejections.length, lastErrorClass: state.lastErrorClass };
}
export function resetAlertsForTests() { state.lastSent.clear(); state.outcomes = []; state.streak = 0; state.rejections = []; state.sent = 0; state.failed = 0; state.lastErrorClass = null; }
