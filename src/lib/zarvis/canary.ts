import "server-only";
import { generateAnswer } from "./openai";
import { STARTERS } from "./sources";
import { recordGeneration } from "./metrics";
import { classifyError, GenerationFailure } from "./errors";
import { links } from "./data";
import type { ZarvisEvent } from "./types";

const site = (path: string) => path.startsWith("https://") ? path : `https://openzcash.org${path}`;
/** Zero-cost checks: the direct-routable phrasing of each starter topic must finish locally with text and sources. Data-backed cases must also cite their live reader, which is absent when the feed fails. */
export const CANARY_CASES = [
  { id: "privacy_faq", question: STARTERS[0].question, liveSource: null },
  { id: "treasuries", question: STARTERS[1].question, liveSource: site(links.treasuries) },
  { id: "price", question: "What is the ZEC price?", liveSource: site(links.price) },
  { id: "zip", question: "What is ZIP 317?", liveSource: null },
] as const;
/** Optional paid check (ZARVIS_CANARY_MODEL=true): one starter that needs the model. */
export const CANARY_MODEL_CASE = { id: "model", question: STARTERS[2].question } as const;
export type CanaryCaseResult = { id: string; ok: boolean; ms: number; route: "local" | "model" | null; sources: number; errorClass: string | null };
export type CanaryResult = { at: string; ok: boolean; ms: number; passed: number; failed: number; failedCases: string[]; cases: CanaryCaseResult[] };

async function runCase(id: string, question: string, signal: AbortSignal, localOnly: boolean, liveSource: string | null = null): Promise<CanaryCaseResult> {
  const started = performance.now();
  let text = "", sources = 0, done = false, live = liveSource === null;
  const emit = (event: ZarvisEvent) => {
    if (event.type === "delta") text += event.text;
    if (event.type === "replace") text = event.text;
    if (event.type === "done") { done = true; sources = event.sources.length; live ||= event.sources.some((source) => source.url === liveSource); }
  };
  try {
    const metrics = await generateAnswer([{ role: "user", content: question }], signal, emit, {}, "quick", { localOnly });
    const ms = performance.now() - started;
    if (!localOnly) recordGeneration("completed", ms, metrics);
    // Local checks must carry sources; a model answer may legitimately cite none.
    const ok = done && live && text.trim().length > 0 && !/\bNaN\b|\bundefined\b/.test(text) && (!localOnly || (sources > 0 && metrics.route === "local" && metrics.modelCalls === 0));
    return { id, ok, ms: Math.round(ms), route: metrics.route, sources, errorClass: null };
  } catch (error) {
    const ms = performance.now() - started;
    const errorClass = classifyError(error, signal.aborted);
    if (!localOnly) recordGeneration("failed", ms, error instanceof GenerationFailure ? error.usage : undefined, errorClass);
    return { id, ok: false, ms: Math.round(ms), route: null, sources, errorClass };
  }
}
export async function runCanary(signal: AbortSignal, options: { model?: boolean } = {}): Promise<CanaryResult> {
  const started = performance.now(), at = new Date().toISOString();
  const cases: CanaryCaseResult[] = [];
  for (const { id, question, liveSource } of CANARY_CASES) cases.push(await runCase(id, question, signal, true, liveSource));
  if (options.model) cases.push(await runCase(CANARY_MODEL_CASE.id, CANARY_MODEL_CASE.question, signal, false));
  const failedCases = cases.filter((c) => !c.ok).map((c) => c.id);
  return { at, ok: failedCases.length === 0, ms: Math.round(performance.now() - started), passed: cases.length - failedCases.length, failed: failedCases.length, failedCases, cases };
}
