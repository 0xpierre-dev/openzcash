import { z } from "zod";
import editions from "./editions.json";
import readingSets from "./reading-sets.json";

const date = z.iso.date();
const asset = z.string().regex(/^\/monthly\/editions\/[a-z0-9-]+\/[a-f0-9]{12}\/[A-Za-z0-9.-]+$/);
export const editionSchema = z.object({
  id: z.string().regex(/^\d{4}-\d{2}(?:-\d{2}-to-\d{2})?$/),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  label: z.string().min(1),
  kind: z.enum(["monthly", "period", "reference"]),
  periodStart: date,
  periodEnd: date,
  financialMonth: z.string().regex(/^\d{4}-\d{2}$/),
  designVersion: z.string().min(1),
  pdf: asset,
  cover: asset,
  manifest: asset,
  assetBase: z.string().regex(/^\/monthly\/editions\/[a-z0-9-]+\/[a-f0-9]{12}$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive(),
  pageCount: z.number().int().positive(),
  pageWidth: z.literal(1200),
  pageHeight: z.literal(675),
}).refine((e) => e.periodStart <= e.periodEnd && e.periodEnd.startsWith(e.month), "Invalid reporting period");

export type MonthlyEdition = z.infer<typeof editionSchema>;
const registerEntry = z.object({
  name: z.string().min(1),
  detail: z.string(),
  url: z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  }),
  amount: z.number().nonnegative().nullable().optional(),
  amountLabel: z.string().optional(),
});
export const readingSetSchema = z.object({
  id: z.string(),
  evidenceCutoff: date,
  documents: z.object({ monthly: editionSchema, operations: editionSchema }),
  sources: z.array(registerEntry).min(1),
  communities: z.array(registerEntry),
  requests: z.array(registerEntry),
  zcg: z.array(registerEntry),
}).superRefine((set, ctx) => {
  const { monthly, operations } = set.documents;
  for (const doc of [monthly, operations]) {
    if (doc.id !== set.id || doc.periodEnd !== set.evidenceCutoff
      || doc.month !== monthly.month || doc.periodStart !== monthly.periodStart
      || doc.financialMonth !== monthly.financialMonth) {
      ctx.addIssue({ code: "custom", message: "Publications must share an issue and reporting cutoff." });
    }
  }
  if (monthly.pageCount !== 10 || monthly.sha256 === operations.sha256) {
    ctx.addIssue({ code: "custom", message: "Expected the ten-page Monthly and a distinct Operations PDF." });
  }
});
export type MonthlyReadingSet = z.infer<typeof readingSetSchema>;
export const monthlyReadingSets = z.array(readingSetSchema).parse(readingSets);
const currentIds = new Set(monthlyReadingSets.map((set) => set.id));
if (currentIds.size !== monthlyReadingSets.length) throw new Error("Duplicate monthly reading-set IDs.");
export const monthlyEditions = [
  ...monthlyReadingSets.map((set) => set.documents.monthly),
  ...z.array(editionSchema).min(1).parse(editions).filter((edition) => !currentIds.has(edition.id)),
].sort((a, b) => b.month.localeCompare(a.month)
  || ({ monthly: 2, period: 1, reference: 0 }[b.kind] - { monthly: 2, period: 1, reference: 0 }[a.kind])
  || b.periodEnd.localeCompare(a.periodEnd));

export function monthLabel(month: string) {
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
}

export function statusLabel(edition: MonthlyEdition) {
  return edition.kind === "period" ? "Partial period" : edition.kind === "reference" ? "Reference edition" : "Monthly edition";
}
