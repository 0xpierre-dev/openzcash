import { z } from "zod";

const date = z.iso.date();
const publicUrl = z.url().refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
});
export const evidenceSchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.array(z.object({
    id: z.string().min(1).max(100), projectId: z.string().min(1),
    kind: z.enum(["team_reported", "reviewed_delivery"]),
    title: z.string().min(1).max(160), summary: z.string().min(1).max(1200),
    date, sourceUrl: publicUrl, reviewedAt: date,
    reviewNote: z.string().min(20).max(1000),
    milestoneIds: z.array(z.string().min(1)),
    supersedes: z.string().nullable(),
  }).strict()).superRefine((entries, context) => {
    const byId = new Map(entries.map(entry => [entry.id, entry]));
    if (byId.size !== entries.length) context.addIssue({ code: "custom", message: "Evidence IDs must be unique" });
    const superseded = new Set<string>();
    for (const [index, entry] of entries.entries()) {
      if (entry.reviewedAt < entry.date) context.addIssue({ code: "custom", message: "Review predates the event" });
      if (entry.kind === "reviewed_delivery" && !entry.milestoneIds.length) context.addIssue({ code: "custom", message: "Delivery review must identify the accepted milestones" });
      if (entry.supersedes) {
        const previous = byId.get(entry.supersedes);
        if (!previous || previous.projectId !== entry.projectId || previous.reviewedAt > entry.reviewedAt || entries.indexOf(previous) >= index || superseded.has(entry.supersedes))
          context.addIssue({ code: "custom", message: "Corrections must point to an earlier, same-project, unsuperseded entry" });
        superseded.add(entry.supersedes);
      }
    }
  }),
}).strict();
export type ReviewedEvidence = z.infer<typeof evidenceSchema>["entries"][number];
