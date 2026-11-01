import { z } from "zod";
import { activityInclusionSchema } from "./activity";
import { archiveChainEvidenceSchema, ARCHIVE_CHECK_MAX_AGE_MS } from "./proof";

export const activityChainReceiptSchema = z.object({
  status: z.enum(["VERIFIED", "CONFIRMING"]), observedAt: z.string().datetime(), evidence: archiveChainEvidenceSchema
}).strict();
export type ActivityChainReceipt = z.infer<typeof activityChainReceiptSchema>;
export type ActivityProofState = "RECORDED" | "PREPARED" | "CONFIRMING" | "VERIFIED" | "CHECK_REQUIRED";
export const activityProofLabel: Record<ActivityProofState, string> = {
  RECORDED: "Recorded · Not anchored", PREPARED: "Ready to anchor", CONFIRMING: "Confirming",
  VERIFIED: "Verified at last check", CHECK_REQUIRED: "Check required"
};

/** Verify a dated observation's bindings, not the current blockchain itself. */
export function validateActivityChainReceipt(input: unknown, inclusion: z.infer<typeof activityInclusionSchema>, txid?: string | null, now = Date.now()) {
  const receipt = activityChainReceiptSchema.parse(input), e = receipt.evidence;
  const checked = Date.parse(e.checkedAt), observed = Date.parse(receipt.observedAt);
  if (e.network !== inclusion.network || e.memo !== inclusion.memo || e.receiver !== inclusion.receiver
    || txid && e.txid !== txid || e.blockHeight < e.birthdayHeight
    || e.confirmations !== e.tipHeight - e.blockHeight + 1
    || e.network === "mainnet" && e.requiredConfirmations < 10
    || (receipt.status === "VERIFIED") !== (e.confirmations >= e.requiredConfirmations)
    || checked > now || observed > now || checked > observed || Date.parse(e.blockTime) > checked + 120000
    || e.pool !== (inclusion.pool ?? "sapling")) throw new Error("Activity chain evidence mismatch");
  return receipt;
}

export function activityProof(inclusion: z.infer<typeof activityInclusionSchema> | null, batch?: {
  txid: string | null; checks: { status: string; createdAt: Date; evidence: unknown }[]
}, now = Date.now()): { state: ActivityProofState; label: string; chain: ActivityChainReceipt | null } {
  const result = (state: ActivityProofState, chain: ActivityChainReceipt | null = null) => ({ state, label: activityProofLabel[state], chain });
  if (!inclusion || !batch) return result("RECORDED");
  const check = batch.checks[0];
  if (!check) return result(batch.txid ? "CHECK_REQUIRED" : "PREPARED");
  if (!batch.txid || !["VERIFIED", "CONFIRMING"].includes(check.status)) return result("CHECK_REQUIRED");
  try {
    const chain = validateActivityChainReceipt({ status: check.status, observedAt: check.createdAt.toISOString(), evidence: check.evidence }, inclusion, batch.txid, now);
    if (now - Date.parse(chain.evidence.checkedAt) >= ARCHIVE_CHECK_MAX_AGE_MS) return result("CHECK_REQUIRED", chain);
    return result(chain.status, chain);
  } catch { return result("CHECK_REQUIRED"); }
}
