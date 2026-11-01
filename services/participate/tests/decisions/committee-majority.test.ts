// @vitest-environment node
import { randomUUID } from "node:crypto";
import { roundSchema, tallyDecisions, type DecisionChoice } from "@/lib/decisions/format";
import { verifyDecisionReceipt } from "@/lib/decisions/verify";
import { signedReceiptFixture } from "@/tests/helpers/signed-decision";

it.each([
  { choices: ["APPROVE", "APPROVE", "APPROVE", "REJECT", "REJECT"], outcome: "APPROVED" },
  { choices: ["APPROVE", "APPROVE", "APPROVE"], outcome: "APPROVED" },
  { choices: ["APPROVE", "APPROVE", "ABSTAIN", "ABSTAIN", "ABSTAIN"], outcome: "REJECTED" },
  { choices: ["APPROVE", "APPROVE", "ABSTAIN"], outcome: "REJECTED" },
  { choices: ["REJECT", "REJECT", "REJECT"], outcome: "REJECTED" },
  { choices: ["ABSTAIN", "ABSTAIN", "ABSTAIN"], outcome: "REJECTED" },
  { choices: ["APPROVE", "APPROVE"], outcome: "QUORUM_NOT_MET" },
  { choices: [], outcome: "QUORUM_NOT_MET" }
])("counts the full five-member roster: $choices -> $outcome", async ({ choices, outcome }) => {
  const { receipt } = await signedReceiptFixture(choices as DecisionChoice[], 3);
  expect(await verifyDecisionReceipt(receipt)).toMatchObject({ outcome, eligible: 5, signed: choices.length });
  expect(tallyDecisions(receipt.round, receipt.ballots, false).outcome).toBe("OPEN");
});

it("rejects a weakened threshold, missing seat or extra seat in a committee receipt", async () => {
  const { receipt } = await signedReceiptFixture([], 3);
  for (const rules of [{ ...receipt.round.rules, quorum: 1 }, { ...receipt.round.rules, approvalPercent: 51 }]) {
    expect(roundSchema.safeParse({ ...receipt.round, rules }).success).toBe(false);
  }
  expect(roundSchema.safeParse({ ...receipt.round, members: receipt.round.members.slice(0, 4) }).success).toBe(false);
  expect(roundSchema.safeParse({ ...receipt.round, members: [...receipt.round.members, { id: randomUUID(), label: "Extra", keyHashes: ["c".repeat(64)] }] }).success).toBe(false);
});

it("keeps the original denominator for legacy signed reviews", async () => {
  for (const version of [1, 2] as const) {
    const { receipt } = await signedReceiptFixture(["APPROVE", "APPROVE", "ABSTAIN"], version);
    expect(await verifyDecisionReceipt(receipt)).toMatchObject({ outcome: "APPROVED", eligible: 3 });
  }
});
