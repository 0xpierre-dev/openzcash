// @vitest-environment node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { signedReceiptFixture } from "@/tests/helpers/signed-decision";
import { decisionHash, roundSchema, tallyDecisions } from "@/lib/decisions/format";
import { verifyDecisionReceipt } from "@/lib/decisions/verify";

it("checks actual ES256 assertions, proposal files, quorum and an exact receipt fingerprint", async () => {
  const { receipt, keys } = await signedReceiptFixture(["APPROVE", "APPROVE", "ABSTAIN"]);
  expect(await verifyDecisionReceipt(receipt, await decisionHash(receipt))).toMatchObject({ signatureStatus: "VERIFIED", signed: 3, approve: 2, abstain: 1, outcome: "APPROVED", chainStatus: "NOT_ANCHORED" });
  expect(JSON.stringify(receipt)).not.toContain(keys[0].credential.id);
  expect(JSON.stringify(receipt)).not.toContain(keys[0].userHandle);
});

it.each(["choice", "round", "voter", "signature", "key", "origin", "cross-origin", "user-verification", "file", "duplicate", "expired", "future", "rules", "removed-key"])("rejects damaged %s", async fault => {
  const { receipt } = await signedReceiptFixture();
  const ballot = receipt.ballots[0];
  if (fault === "choice") ballot.envelope.choice = "REJECT";
  if (fault === "round") ballot.envelope.roundHash = "a".repeat(64);
  if (fault === "voter") ballot.envelope.voterId = randomUUID();
  if (fault === "signature") ballot.assertion.signature = Buffer.alloc(64).toString("base64url");
  if (fault === "key") ballot.publicKey = receipt.ballots[1].publicKey;
  if (fault === "origin" || fault === "cross-origin") {
    const client = JSON.parse(Buffer.from(ballot.assertion.clientDataJSON, "base64url").toString());
    if (fault === "origin") client.origin = "https://wrong.example"; else client.crossOrigin = true;
    ballot.assertion.clientDataJSON = Buffer.from(JSON.stringify(client)).toString("base64url");
  }
  if (fault === "user-verification") { const bytes = Buffer.from(ballot.assertion.authenticatorData, "base64url"); bytes[32] = 1; ballot.assertion.authenticatorData = bytes.toString("base64url"); }
  if (fault === "file") receipt.proposal.files[0].data = Buffer.from("changed proposal").toString("base64");
  if (fault === "duplicate") receipt.ballots[1] = receipt.ballots[0];
  if (fault === "expired") ballot.recordedAt = ballot.envelope.expiresAt;
  if (fault === "future") receipt.asOf = receipt.round.opensAt;
  if (fault === "rules") { receipt.round.rules.quorum = 1; receipt.roundHash = await decisionHash(receipt.round); }
  if (fault === "removed-key") { receipt.round.members[0].keyHashes = ["b".repeat(64)]; receipt.roundHash = await decisionHash(receipt.round); }
  await expect(verifyDecisionReceipt(receipt)).rejects.toThrow();
});

it("does not round a near-threshold result or count abstention as approval", async () => {
  const { receipt } = await signedReceiptFixture(["APPROVE", "APPROVE", "REJECT"]);
  expect(tallyDecisions(receipt.round, receipt.ballots, true)).toMatchObject({ thresholdMet: false, outcome: "REJECTED" });
  expect(tallyDecisions(receipt.round, receipt.ballots, false).outcome).toBe("OPEN");
  expect(tallyDecisions(receipt.round, receipt.ballots.slice(0, 1), true).outcome).toBe("QUORUM_NOT_MET");
  const abstentions = receipt.ballots.map(b => ({ ...b, envelope: { ...b.envelope, choice: "ABSTAIN" as const } }));
  expect(tallyDecisions(receipt.round, abstentions, true)).toMatchObject({ quorumMet: true, thresholdMet: false });
});

it("rejects duplicate voter keys and impossible quorums", async () => {
  const { receipt } = await signedReceiptFixture();
  receipt.round.members[1].keyHashes = receipt.round.members[0].keyHashes;
  expect(() => roundSchema.parse(receipt.round)).toThrow();
  receipt.round.rules.quorum = 4;
  expect(() => roundSchema.parse(receipt.round)).toThrow();
});

it.each([1, 2, 3, 4] as const)("runs the V%s downloadable verifier outside the application; pinned hash detects an omitted ballot", async version => {
  const { receipt } = await signedReceiptFixture(version === 4 ? ["APPROVE", "APPROVE", "APPROVE", "REJECT", "ABSTAIN"] : undefined, version);
  const folder = await mkdtemp(join(tmpdir(), "participate-decision-"));
  try {
    const file = join(folder, "receipt.json"), hash = await decisionHash(receipt);
    await writeFile(file, JSON.stringify(receipt));
    const args = [resolve("public/verify/decision-verify.mjs"), file, "--round-hash", receipt.roundHash, "--hash", hash];
    const result = await promisify(execFile)(process.execPath, args, { cwd: folder });
    expect(JSON.parse(result.stdout)).toMatchObject({ signatureStatus: "VERIFIED", outcome: version === 4 ? "APPROVED" : "REJECTED", expectedReceiptChecked: true });
    receipt.ballots.pop(); await writeFile(file, JSON.stringify(receipt));
    await expect(promisify(execFile)(process.execPath, args, { cwd: folder })).rejects.toThrow();
  } finally { await rm(folder, { recursive: true, force: true }); }
});
