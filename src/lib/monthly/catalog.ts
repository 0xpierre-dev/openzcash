import { z } from "zod";
import editions from "./editions.json";

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
export const monthlyEditions = z.array(editionSchema).min(1).parse(editions);

export function monthLabel(month: string) {
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
}

export function statusLabel(edition: MonthlyEdition) {
  return edition.kind === "period" ? "Partial period" : edition.kind === "reference" ? "Reference edition" : "Monthly edition";
}
