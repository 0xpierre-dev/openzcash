import type { AnswerProvenance, ZarvisSource } from "./types";
import { modelLabel } from "./provenance";
import { MAX_QUESTION_LENGTH } from "./context";

/** Sharing helpers. The page never writes a question into its own URL; a link exists only when the visitor copies one, and opening it fills the composer without sending. */
export const ZARVIS_PAGE_URL = "https://openzcash.org/zarvis";
export const SHARE_PARAM = "q";

export function questionLink(question: string, base = ZARVIS_PAGE_URL): string | null {
  const text = question.trim();
  if (!text || text.length > MAX_QUESTION_LENGTH) return null;
  const url = new URL(base);
  url.searchParams.set(SHARE_PARAM, text);
  return url.toString();
}
/** The question carried by a shared link, once; anything malformed or oversized is ignored. */
export function sharedQuestion(search: string): string | null {
  try {
    const value = new URLSearchParams(search).get(SHARE_PARAM)?.replace(/\s+/g, " ").trim() ?? "";
    return value && value.length <= MAX_QUESTION_LENGTH ? value : null;
  } catch { return null; }
}
/** The same URL without the shared question, so it never stays in the address bar or the history. */
export function withoutSharedQuestion(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(SHARE_PARAM);
  return url.pathname + url.search + url.hash;
}
const stamp = (iso?: string) => {
  const at = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(at) ? ` (retrieved ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(at)} UTC)` : "";
};
/** Plain text for the clipboard: the answer, its numbered sources with retrieval times, and who wrote it. */
export function answerClipboard(input: { question?: string; content: string; sources?: ZarvisSource[]; provenance?: AnswerProvenance; provider?: string | null; askedAt?: string }): string {
  const lines: string[] = [];
  if (input.question?.trim()) lines.push(`Q: ${input.question.trim()}`, "");
  lines.push(input.content.trim());
  const sources = input.sources ?? [];
  if (sources.length) {
    lines.push("", sources.length === 1 ? "Source:" : "Sources:");
    sources.forEach((source, index) => lines.push(`${index + 1}. ${source.title} — ${source.url}${stamp(source.retrievedAt)}`));
  }
  const p = input.provenance;
  const by = !p ? "Zarvis, OpenZcash's Zcash guide" : p.route === "local" ? "Zarvis (OpenZcash), direct from OpenZcash data, no AI model" : `Zarvis (OpenZcash) with ${modelLabel(p.model, input.provider)}${p.webSearch ? " and web search" : ""}; check the sources`;
  lines.push("", `— ${by} · ${ZARVIS_PAGE_URL}${input.askedAt ? ` · ${input.askedAt.slice(0, 10)}` : ""}`);
  return lines.join("\n");
}
