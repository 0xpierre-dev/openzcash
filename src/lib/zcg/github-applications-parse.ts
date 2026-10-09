/**
 * Pure parsing helpers for ZCG grant-application issue bodies. Kept free of
 * "server-only" so the logic can be unit-tested directly.
 */

/** A whole trimmed line that is nothing but a dollar amount. Applicants write
 * "$477,658", "24,500", "US$64,430" (issue #355) or "64,430 USD". */
const AMOUNT_LINE = /^(?:US)?\$?\s?\d[\d,]*(\.\d+)?(?:\s?USD)?$/i;

/** A markdown section header at any of the levels applications use. The issue
 * form renders "###", but hand-written re-applications use "##" (e.g. #341). */
const HEADER = /^#{2,4}\s+/;

/** First pure-amount line inside the "<header>" section of an issue body. */
function sectionAmount(body: string, header: string): number | null {
  const lines = body.split(/\r?\n/);
  const target = header.toLowerCase();
  const i = lines.findIndex((l) => {
    const t = l.trim();
    return (
      HEADER.test(t) && t.replace(HEADER, "").trim().toLowerCase() === target
    );
  });
  if (i < 0) return null;
  for (let j = i + 1; j < lines.length; j++) {
    const t = lines[j].trim();
    if (!t) continue;
    if (HEADER.test(t)) break; // section ended, no amount
    if (AMOUNT_LINE.test(t)) {
      const n = Number(t.replace(/[^0-9.]/g, ""));
      return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    }
  }
  return null;
}

/**
 * The requested grant amount from an application's issue body, in whole USD.
 * Applicants sometimes leave the "Requested Grant Amount (USD)" field blank or
 * fill it with prose, so fall back to the "Total Budget (USD)" field (the same
 * figure in well-formed applications).
 */
export function requestedAmountFromBody(
  body: string | undefined,
): number | null {
  if (!body) return null;
  return (
    sectionAmount(body, "Requested Grant Amount (USD)") ??
    sectionAmount(body, "Total Budget (USD)")
  );
}

/** The "Total Budget (USD)" field alone, in whole USD, or null when blank or prose. */
export function totalBudgetFromBody(body: string | undefined): number | null {
  if (!body) return null;
  return sectionAmount(body, "Total Budget (USD)");
}

export type ApplicationStatus = "review" | "approved" | "paid" | "other";

/** The committee's verdict as the repository labels record it. Only OPEN issues
 * are listed by the importer, so an unlabelled application is still awaiting
 * judgement (e.g. #341, KeepKey, was filed with no labels at all). */
export function statusFromLabels(labels: string[]): ApplicationStatus {
  const has = (s: string) => labels.some((l) => l.includes(s));
  if (has("Payment Completed")) return "paid";
  if (has("Grant Approved") || has("Approved")) return "approved";
  if (has("Declined") || has("Rejected") || has("Withdrawn")) return "other";
  if (has("Ready For ZCG Review") || has("Review")) return "review";
  return "review";
}

export type ApplicationSection = {
  heading: string;
  text: string;
  truncated: boolean;
};

/** HTML comments, images, code fences and Markdown marks dropped; links keep their label. */
function plainText(markdown: string): string {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/[*`~]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/**
 * Every section of an issue body (the form renders "###" headers; hand-written
 * re-applications use "##"), as plain text cut at `perSection` characters, up
 * to `total` characters over the whole list. Text before the first header is
 * returned under an empty heading. A cut section is marked truncated so the
 * reader never mistakes an excerpt for the whole budget or milestone list.
 */
export function applicationSections(
  body: string | undefined,
  limits: { perSection: number; total: number },
): ApplicationSection[] {
  if (!body) return [];
  const sections: ApplicationSection[] = [];
  let heading = "",
    lines: string[] = [],
    used = 0;
  const flush = () => {
    const text = plainText(lines.join("\n"));
    lines = [];
    // The form's checkbox boilerplate is not application content.
    if (/^terms and conditions$/i.test(heading)) return;
    // The issue form renders an unanswered field as "_No response_".
    if (!text || /^_*(?:no response|n\/a|none)\.?_*$/i.test(text)) return;
    if (used >= limits.total) return;
    const room = Math.min(limits.perSection, limits.total - used);
    const cut = text.length > room;
    const excerpt = cut ? text.slice(0, room).trimEnd() : text;
    used += excerpt.length;
    sections.push({ heading, text: excerpt, truncated: cut });
  };
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (HEADER.test(trimmed)) {
      flush();
      heading = trimmed
        .replace(HEADER, "")
        .replace(/\s*#+\s*$/, "")
        .trim();
    } else lines.push(line);
  }
  flush();
  return sections;
}

/** A short, plain-text excerpt of the applicant's own project summary. */
export function projectSummaryFromBody(
  body: string | null | undefined,
): string | null {
  if (!body) return null;
  const lines = body.split(/\r?\n/);
  const heading = /^#{1,6}\s+/;
  for (const section of ["project summary", "project description"]) {
    const start = lines.findIndex(
      (line) =>
        heading.test(line.trim()) &&
        line
          .trim()
          .replace(heading, "")
          .replace(/\s*#+\s*$/, "")
          .trim()
          .toLowerCase() === section,
    );
    if (start < 0) continue;
    const end = lines.findIndex(
      (line, index) => index > start && heading.test(line.trim()),
    );
    const text = lines
      .slice(start + 1, end < 0 ? undefined : end)
      .join("\n")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
      .replace(/<[^>]*>/g, "")
      .replace(/^\s*(?:[-*+]\s+|\d+\.\s+|>\s*)/gm, "")
      .replace(/[*`~]/g, "")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/(^|\s)_([^_]+)_(?=\s|[.,;:!?]|$)/g, "$1$2")
      .replace(/\s+/g, " ")
      .trim();
    if (!text || /^(?:no response|n\/a|none)\.?$/i.test(text)) continue;
    if (text.length <= 480) return text;
    const excerpt = text.slice(0, 479);
    const boundary = excerpt.lastIndexOf(" ");
    return `${excerpt.slice(0, boundary > 0 ? boundary : undefined).trimEnd()}…`;
  }
  return null;
}
