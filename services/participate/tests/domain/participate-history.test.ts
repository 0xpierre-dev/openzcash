import { filterHistory, historyCsv, historyResponseSchema, type HistoryRecord } from "@/lib/domain/participate-history";

export const historyRow: HistoryRecord = { id: "proposal-a", date: "2026-09-28", process: "committee", outcome: "Approved", subject: "Wallet integration", subjectHref: "/zcg/grant?g=Wallet", detail: "A team · $8,000 requested", sources: [{ label: "Application", href: "https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/1" }] };
const defaults = { outcome: "All", year: "All", query: "", order: "newest" as const };

it("validates the public register, refusing private/invalid records and unsafe source URLs", () => {
  expect(historyResponseSchema.safeParse({ version: 1, rows: [historyRow] }).success).toBe(true);
  for (const row of [{ ...historyRow, process: "coinholders" }, { ...historyRow, date: "2026-02-31" }, { ...historyRow, subjectHref: "//evil.test" }, { ...historyRow, sources: [{ label: "Application", href: "javascript:alert(1)" }] }]) {
    expect(historyResponseSchema.safeParse({ version: 1, rows: [row] }).success).toBe(false);
  }
  expect(historyResponseSchema.safeParse({ version: 1, rows: [historyRow, historyRow] }).success).toBe(false);
});

it("combines outcome, year and applicant search without mutating or limiting source records", () => {
  const older = { ...historyRow, id: "b", date: "2025-04-01", outcome: "Rejected" as const };
  const rows = [older, historyRow];
  expect(filterHistory(rows, defaults).map(row => row.id)).toEqual(["proposal-a", "b"]);
  expect(rows[0]).toBe(older);
  expect(filterHistory(rows, { ...defaults, outcome: "Approved", year: "2026", query: " A TEAM " })).toEqual([historyRow]);
  expect(filterHistory(rows, { ...defaults, year: "2024" })).toEqual([]);
  expect(filterHistory(rows, { ...defaults, order: "oldest" })[0]).toBe(older);
});

it("exports every filtered record and escapes formulas and quoted text", () => {
  const rows = Array.from({ length: 30 }, (_, id) => ({ ...historyRow, id: String(id), subject: '=HYPERLINK("x")' }));
  const csv = historyCsv(rows);
  expect(csv.split("\r\n")).toHaveLength(31);
  expect(csv).toContain('"\'=HYPERLINK(""x"")"');
  expect(csv).toContain(historyRow.sources[0].href);
});
