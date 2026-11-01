import { z } from "zod";
import { proposalTagsSchema } from "@/lib/domain/proposal-tags";

export const ZCG_REVIEW_SOURCE = "https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues";
export const ZCG_REVIEW_API = "https://api.github.com/repos/ZcashCommunityGrants/zcashcommunitygrants/issues?state=open&per_page=100";

// Ready labels can remain on approved grants. A decision or payment takes precedence.
export function isZcgUnderReview(issue: { state: string; labels: readonly string[]; pullRequest?: boolean }) {
  return issue.state === "open" && !issue.pullRequest
    && issue.labels.includes("📋 Grant Application") && issue.labels.includes("👀 Ready For ZCG Review")
    && !issue.labels.some(label => /approved|rejected|declined|filtered|withdrawn|cancelled|canceled|vetoed|payment|milestone|complete|does not meet criteria|did not follow process/i.test(label));
}

export const zcgReviewProposalSchema = z.object({
  id: z.string().regex(/^zcg-github-\d+$/), issueNumber: z.number().int().positive(),
  title: z.string().trim().min(1).max(300), applicant: z.string().min(1).max(100),
  outcome: z.literal("under_review"), state: z.literal("open"),
  submittedAt: z.string().datetime(), sourceUpdatedAt: z.string().datetime(),
  requestedUsd: z.number().finite().nonnegative().max(100_000_000).nullable(),
  tags: proposalTagsSchema, labels: z.array(z.string()),
  proposalUrl: z.string().url().startsWith(`${ZCG_REVIEW_SOURCE}/`)
}).strict().superRefine((value, ctx) => {
  if (!isZcgUnderReview(value)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "The source does not establish a pending committee review" });
  if (value.id !== `zcg-github-${value.issueNumber}` || value.proposalUrl !== `${ZCG_REVIEW_SOURCE}/${value.issueNumber}`) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Source identity mismatch" });
});
export const zcgReviewSnapshotSchema = z.object({
  checkedAt: z.string().datetime(), source: z.literal(ZCG_REVIEW_API),
  proposals: z.array(zcgReviewProposalSchema)
}).strict().superRefine((value, ctx) => {
  if (new Set(value.proposals.map(proposal => proposal.id)).size !== value.proposals.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate proposal" });
});
export type ZcgReviewProposal = z.infer<typeof zcgReviewProposalSchema>;
