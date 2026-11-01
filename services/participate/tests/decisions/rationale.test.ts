// @vitest-environment node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { signedReceiptFixture } from "@/tests/helpers/signed-decision";
import { verifyDecisionReceipt } from "@/lib/decisions/verify";
import { decisionHash } from "@/lib/decisions/format";

it("verifies signed reasons and retains compatibility with the original receipt", async () => {
  for (const version of [1, 2] as const) {
    const { receipt } = await signedReceiptFixture(["APPROVE", "APPROVE", "ABSTAIN"], version);
    expect(await verifyDecisionReceipt(receipt)).toMatchObject({ signatureStatus: "VERIFIED", outcome: "APPROVED" });
  }
});
it.each(["altered", "removed", "empty", "version-downgrade"])("rejects a %s reason even with a recomputed receipt fingerprint", async fault => {
  const { receipt } = await signedReceiptFixture(undefined, 2);
  const envelope = receipt.ballots[0].envelope as Record<string, unknown>;
  if (fault === "altered") envelope.rationale = "The attacker changed the original public feedback.";
  if (fault === "removed") delete envelope.rationale;
  if (fault === "empty") envelope.rationale = "";
  if (fault === "version-downgrade") { envelope.schema = "PARTICIPATE_DECISION_SIGNATURE_V1"; delete envelope.rationale; }
  await expect(verifyDecisionReceipt(receipt, await decisionHash(receipt))).rejects.toThrow();
});
it("verifies a reason-bearing receipt with the downloadable tool outside the app", async () => {
  const { receipt } = await signedReceiptFixture(undefined, 2);
  const folder = await mkdtemp(join(tmpdir(), "committee-receipt-"));
  try {
    const file = join(folder, "receipt.json"); await writeFile(file, JSON.stringify(receipt));
    const result = await promisify(execFile)(process.execPath, [resolve("public/verify/decision-verify.mjs"), file, "--round-hash", receipt.roundHash, "--hash", await decisionHash(receipt)], { cwd: folder });
    expect(JSON.parse(result.stdout)).toMatchObject({ signatureStatus: "VERIFIED", chainStatus: "NOT_ANCHORED" });
  } finally { await rm(folder, { recursive: true, force: true }); }
});
