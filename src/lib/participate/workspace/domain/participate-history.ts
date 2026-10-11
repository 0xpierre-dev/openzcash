import { z } from "zod/v3";

const publicUrl = z.string().max(4000).url().refine(value => {
  const url = new URL(value);
  return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
});
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});

export const historyRecordSchema = z.object({
  id: z.string().min(1).max(200),
  date,
  process: z.literal("committee"),
  outcome: z.enum(["Approved", "Rejected", "Filtered", "Vetoed"]),
  subject: z.string().min(1).max(2000),
  subjectHref: z.string().max(4000).startsWith("/zcg/grant?g=").nullable(),
  detail: z.string().max(8000).nullable(),
  sources: z.array(z.object({ label: z.string().min(1).max(100), href: publicUrl })).max(20),
});

export const historyResponseSchema = z.object({
  version: z.literal(1),
  rows: z.array(historyRecordSchema).max(20000).refine(rows => new Set(rows.map(row => row.id)).size === rows.length),
});

export type HistoryRecord = z.infer<typeof historyRecordSchema>;
export type HistoryFilters = { outcome: string; year: string; query: string; order: "newest" | "oldest" };

export function filterHistory(rows: HistoryRecord[], filters: HistoryFilters) {
  const query = filters.query.trim().toLocaleLowerCase("en-US");
  return rows.filter(row =>
    (filters.outcome === "All" || row.outcome === filters.outcome)
    && (filters.year === "All" || row.date.startsWith(`${filters.year}-`))
    && `${row.subject} ${row.detail ?? ""}`.toLocaleLowerCase("en-US").includes(query),
  ).sort((a, b) => (filters.order === "newest" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)) || a.subject.localeCompare(b.subject, "en"));
}

/** Quote every cell and neutralize spreadsheet formulas in imported text. */
export function historyCsv(rows: HistoryRecord[]) {
  const cell = (value: string) => `"${(/^[\s]*[=+@-]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;
  return [["Date", "Outcome", "Proposal", "Details", "Sources"], ...rows.map(row => [
    row.date, row.outcome, row.subject, row.detail ?? "", row.sources.map(source => `${source.label}: ${source.href}`).join(" | "),
  ])].map(row => row.map(cell).join(",")).join("\r\n");
}
