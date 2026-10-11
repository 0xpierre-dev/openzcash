import { z } from "zod/v3";
import { archiveIdSchema, archiveNetworkSchema, canonicalJson, digestSchema, sha256, utf8, type ArchiveNetwork } from "./format";
import { merkleProofSchema, verifyArchiveMerkleProof } from "./merkle";
import { abandonmentReasonSchema } from "@/lib/participate/workspace/domain/proposal-submission";

const id = z.string().min(1).max(128);
const labelSnapshot = z.object({ id: z.string().regex(/^\d{1,32}$/), name: z.string().min(1).max(100), color: z.string().regex(/^[0-9a-f]{6}$/) }).strict();
const labelsAction = z.object({ kind: z.literal("PROPOSAL_LABELS_SET"), authority: z.literal("COMMITTEE_ACCOUNT"),
  labelsVersion: z.number().int().positive(), catalogHash: digestSchema,
  previousLabels: z.array(z.string().regex(/^\d{1,32}$/)).max(100), labels: z.array(labelSnapshot).max(100) }).strict();
const base = z.object({
  schema: z.literal("PARTICIPATE_EVENT_V1"), id: z.string().uuid(),
  communityId: id, recordId: archiveIdSchema, proposalManifestHash: digestSchema,
  sequence: z.number().int().positive().max(2147483647), previousEventHash: digestSchema.nullable(),
  actor: z.string().uuid(), occurredAt: z.string().datetime(), recordedAt: z.string().datetime(),
  origin: z.enum(["LIVE", "IMPORTED"])
}).strict();

export const activityEventSchema = z.discriminatedUnion("kind", [
  base.extend({ kind: z.literal("COMMENT_POSTED"), commentId: id, parentId: id.nullable(), bodyHash: digestSchema }),
  base.extend({ kind: z.literal("COMMENT_HIDDEN"), commentId: id, reason: z.string().min(1).max(500) }),
  base.extend({ kind: z.literal("PROPOSAL_LIKE_SET"), liked: z.boolean() }),
  base.extend({ kind: z.literal("PROPOSAL_ABANDONED"), reason: abandonmentReasonSchema, authority: z.literal("AUTHOR_ACCOUNT") }),
  base.merge(labelsAction),
  base.extend({ kind: z.literal("COMMENT_LIKE_SET"), commentId: id, liked: z.boolean() })
]).superRefine((event, context) => {
  if ((event.sequence === 1) !== (event.previousEventHash === null)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid event sequence" });
  if (Date.parse(event.occurredAt) > Date.parse(event.recordedAt)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid event time" });
});
export type ActivityEvent = z.infer<typeof activityEventSchema>;
export type ActivityAction =
  | { kind: "COMMENT_POSTED"; commentId: string; parentId: string | null; bodyHash: string }
  | { kind: "COMMENT_HIDDEN"; commentId: string; reason: string }
  | { kind: "PROPOSAL_LIKE_SET"; liked: boolean }
  | { kind: "PROPOSAL_ABANDONED"; reason: string; authority: "AUTHOR_ACCOUNT" }
  | z.infer<typeof labelsAction>
  | { kind: "COMMENT_LIKE_SET"; commentId: string; liked: boolean };

export function activityBatchMemo(root: string, count: number, network: ArchiveNetwork) {
  digestSchema.parse(root); archiveNetworkSchema.parse(network);
  if (!Number.isInteger(count) || count < 1 || count > 10000) throw new Error("Invalid activity batch size");
  return `PARTICIPATE|ACTIVITY|v1|${network}|count:${count}|sha256:${root}`;
}

export const activityInclusionSchema = z.object({
  network: archiveNetworkSchema, memo: z.string().max(512), receiver: z.string().min(40).max(256), proof: merkleProofSchema
}).strict();
export const activityBundleSchema = z.object({
  schema: z.literal("PARTICIPATE_EVENT_RECEIPT_V1"), event: z.string().max(16000), eventHash: digestSchema,
  body: z.string().max(4000).nullable(), inclusion: activityInclusionSchema.nullable(),
  // A saved observation is not a fresh independent chain verification.
  chain: z.unknown().nullable()
}).strict();
export type ActivityBundle = z.infer<typeof activityBundleSchema>;

export async function verifyActivityEvent(eventJson: string, expectedHash: string) {
  digestSchema.parse(expectedHash);
  const event = activityEventSchema.parse(JSON.parse(eventJson));
  if (canonicalJson(event) !== eventJson || await sha256(utf8(eventJson)) !== expectedHash) throw new Error("Event fingerprint mismatch");
  return event;
}

export async function verifyActivityBundle(input: unknown, expectedHash: string) {
  const bundle = activityBundleSchema.parse(input);
  if (bundle.eventHash !== expectedHash) throw new Error("Receipt fingerprint mismatch");
  const event = await verifyActivityEvent(bundle.event, expectedHash);
  if (bundle.body !== null && (event.kind !== "COMMENT_POSTED" || await sha256(utf8(bundle.body)) !== event.bodyHash)) throw new Error("Comment contents mismatch");
  if (bundle.inclusion) {
    const { network, receiver, memo } = bundle.inclusion;
    const proof = verifyArchiveMerkleProof(expectedHash, bundle.inclusion.proof);
    if (memo !== activityBatchMemo(proof.root, proof.leafCount, network) || !receiver.startsWith(network === "mainnet" ? "zs1" : "ztestsapling1")) throw new Error("Activity commitment mismatch");
  }
  return { event, bundle };
}

export const activityLabel = (event: ActivityEvent) => event.kind === "COMMENT_POSTED" ? "Comment published"
  : event.kind === "COMMENT_HIDDEN" ? "Comment hidden"
  : event.kind === "PROPOSAL_ABANDONED" ? "Proposal abandoned by author"
  : event.kind === "PROPOSAL_LABELS_SET" ? "Committee labels updated"
  : event.kind === "PROPOSAL_LIKE_SET" ? (event.liked ? "Proposal liked" : "Proposal like removed")
  : event.liked ? "Comment liked" : "Comment like removed";
