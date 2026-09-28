import type { AnswerProvenance } from "./types";

/** Client-safe labels for the badge under each answer. Counts and names only; the discarded text never reaches the browser. */
export function modelLabel(model: string | null, provider?: string | null): string {
  const m = model?.match(/^(grok|gpt)-?(\d+(?:\.\d+)?)(?:-(.+))?$/i);
  if (m) return `${m[1].toLowerCase() === "grok" ? "Grok" : "GPT"}${m[1].toLowerCase() === "grok" ? " " : "-"}${m[2]}${m[3] ? ` ${m[3].replace(/-/g, " ")}` : ""}`;
  return model || provider || "AI model";
}
export function provenanceLabel(p: AnswerProvenance, sources: number, provider?: string | null): string {
  const pt = p.language === "pt";
  if (p.route === "local") return pt ? "Direto dos dados OpenZcash · sem IA" : "Direct from OpenZcash data · no AI";
  const count = pt ? `${sources} ${sources === 1 ? "fonte" : "fontes"}` : `${sources} ${sources === 1 ? "source" : "sources"}`;
  return [modelLabel(p.model, provider), ...(p.webSearch ? [pt ? "busca na web" : "web search"] : []), count, pt ? "confira" : "check them"].join(" · ");
}
export function fallbackNotice(p: AnswerProvenance): string | undefined {
  if (!p.groundingFallback) return;
  return p.language === "pt" ? "Alguns valores não puderam ser verificados e foram omitidos." : "Some figures could not be verified and were left out.";
}
/** Retrieval stamps carry their zone; the interface itself stays English. */
export function retrievedLabel(iso: string): string | undefined {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return;
  return `Retrieved ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(at)} UTC`;
}
