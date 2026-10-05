import "server-only";
import { collectLegalDaily } from "./collector";

export const LEGAL_SCHEDULE_TIME_ZONE = "America/Sao_Paulo";
export const LEGAL_SCHEDULE_FIRST_RUN_MS = 30_000;
export const LEGAL_SCHEDULE_CHECK_MS = 15 * 60_000;

export type LegalCollectionTrigger = "scheduled" | "cron";
type Collector = typeof collectLegalDaily;
type CollectorOutcome = Awaited<ReturnType<Collector>>;
export type LegalCollectionOutcome = CollectorOutcome | { ok: true; outcome: "disabled"; day: string } | { ok: false; outcome: "unavailable"; day: string };

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: LEGAL_SCHEDULE_TIME_ZONE,
  year: "numeric", month: "2-digit", day: "2-digit",
});

/** A collection day follows São Paulo's calendar, not the server's UTC date. */
export function legalCollectionDay(at: number | Date): string {
  const parts = dayFormatter.formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

type Dependencies = {
  collect?: Collector;
  now?: () => number;
  disabled?: () => boolean;
  report?: (result: LegalCollectionOutcome) => void;
};

/** The collector owns the durable day checkpoint, lock and retry budget. */
export function createLegalSchedule({
  collect = collectLegalDaily,
  now = Date.now,
  disabled = () => process.env.DISABLE_AUTO_REFRESH === "true",
  report = () => {},
}: Dependencies = {}) {
  let running: Promise<LegalCollectionOutcome> | null = null;
  let first: ReturnType<typeof setTimeout> | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;

  function execute(trigger: LegalCollectionTrigger = "scheduled"): Promise<LegalCollectionOutcome> {
    const at = now();
    const day = legalCollectionDay(at);
    if (disabled()) return Promise.resolve({ ok: true, outcome: "disabled", day });
    if (running) return running;
    running = Promise.resolve().then(() => collect({ day, now: new Date(at).toISOString(), trigger }))
      .catch((): LegalCollectionOutcome => ({ ok: false, outcome: "unavailable", day }))
      .finally(() => { running = null; });
    return running;
  }

  const tick = () => { void execute().then(result => { report(result); }).catch(() => {}); };

  function start(): boolean {
    if (disabled()) return false;
    if (interval) return true;
    first = setTimeout(tick, LEGAL_SCHEDULE_FIRST_RUN_MS);
    interval = setInterval(tick, LEGAL_SCHEDULE_CHECK_MS);
    first.unref?.();
    interval.unref?.();
    return true;
  }

  function stop(): void {
    if (first) clearTimeout(first);
    if (interval) clearInterval(interval);
    first = interval = null;
  }

  return { execute, start, stop };
}

const schedule = createLegalSchedule({ report(result) {
  // No fetched content, credentials, URLs or raw exception messages enter logs.
  console.info(JSON.stringify({ event: "legal.collection", day: result.day, ok: result.ok, outcome: result.outcome }));
} });

/** Node production startup calls this once; repeated calls do not add timers. */
export const startLegalSchedule = schedule.start;
/** The authenticated cron route shares a run with an overlapping timer tick. */
export const executeLegalCollection = schedule.execute;
