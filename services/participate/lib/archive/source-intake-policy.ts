import { isZcgUnderReview } from "@/lib/domain/zcg-review";

type Application = { state: string; title: string; body: string; labels: readonly string[]; pullRequest?: boolean };

/** Recognize the actual grant form, including applications with a custom title. */
export function hasZcgApplicationFields(markdown: string) {
  const fields = new Map<string, string[]>();
  let current: string | undefined;
  let fence: { character: string; length: number } | undefined;
  for (const line of markdown.replace(/<!--[\s\S]*?(?:-->|$)/g, "").split(/\r?\n/)) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) fence = { character: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.character && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      continue;
    }
    if (fence) continue;
    const heading = line.match(/^ {0,3}#{1,6}[ \t]+(.+?)\s*$/);
    if (heading) {
      current = heading[1].toLowerCase();
      if (!fields.has(current)) fields.set(current, []);
    } else if (current && line.trim() && !/^_?No response_?$/i.test(line.trim())) {
      fields.get(current)!.push(line.trim());
    }
  }
  return ["requested grant amount (usd)", "project summary", "project description"].every(field => fields.get(field)?.length)
    && [...fields].some(([heading, lines]) => /^application owners(?:\s|$)/.test(heading) && lines.length > 0);
}

/** Initial intake only. Existing archives continue tracking decisions and status changes. */
export function zcgSourceIntakeSkipReason(issue: Application): string | null {
  if (issue.pullRequest || /\bv12\s+credits\s+application\b/i.test(issue.title)
    || issue.labels.some(label => /\bv12\s+credits\s+application\b/i.test(label))) return "SOURCE_NOT_GRANT_APPLICATION";
  if (issue.state !== "open" || issue.labels.some(label => /approved|rejected|declined|filtered|withdrawn|cancelled|canceled|vetoed|payment|milestone|complete|does not meet criteria|did not follow process/i.test(label)))
    return "SOURCE_NOT_PENDING";
  // Preserve the established path and validation of older, officially triaged applications.
  if (isZcgUnderReview(issue)) return null;
  // The applicant can rename an issue before committee labels are assigned.
  // Complete grant-form fields establish intake eligibility independently of its title.
  if (hasZcgApplicationFields(issue.body)) return null;
  return issue.labels.includes("📋 Grant Application") || /^\s*(?:zcg\s+)?grant\s+application\b/i.test(issue.title)
    ? "SOURCE_APPLICATION_TEMPLATE_INCOMPLETE" : "SOURCE_NOT_GRANT_APPLICATION";
}
