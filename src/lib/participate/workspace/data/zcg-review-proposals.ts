import snapshot from "@/lib/participate/workspace/data/zcg-review-queue.json";
import { zcgReviewSnapshotSchema } from "@/lib/participate/workspace/domain/zcg-review";

// Dated, manually refreshed source snapshot. No live status or committee vote is inferred.
const checked = zcgReviewSnapshotSchema.parse(snapshot);
export const ZCG_REVIEW_CHECKED_AT = checked.checkedAt;
export const ZCG_REVIEW_PROPOSALS = checked.proposals;
