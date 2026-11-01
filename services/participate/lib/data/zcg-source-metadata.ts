import snapshot from "@/data/zcg-source-metadata.json";
import { githubProposalOutcome, zcgSourceMetadataSchema } from "@/lib/domain/zcg-source-metadata";

// Current source annotations are separate from the preserved archive revision.
const checked = zcgSourceMetadataSchema.parse(snapshot);
export const ZCG_SOURCE_CHECKED_AT = checked.checkedAt;
export const ZCG_SOURCE_METADATA = checked.proposals;
const byRecord = new Map(checked.proposals.map(entry => [entry.recordId, entry]));
export const zcgSourceMetadata = (recordId: string) => byRecord.get(recordId);

/** A dated source annotation, never an author-signed abandonment or a new archive revision. */
export function zcgSourceWithdrawal(manifest: { kind: string; recordId: string }) {
  if (manifest.kind !== "REVIEW_SNAPSHOT") return null;
  const source = zcgSourceMetadata(manifest.recordId);
  return source && githubProposalOutcome(source) === "abandoned" ? { url: source.url, checkedAt: ZCG_SOURCE_CHECKED_AT } : null;
}
