// @vitest-environment node
import { roundSchema, tallyDecisions, type DecisionChoice } from "@/lib/decisions/format";
import { verifyDecisionBallot, verifyDecisionReceipt } from "@/lib/decisions/verify";
import { signedReceiptFixture } from "@/tests/helpers/signed-decision";

it.each([
  { choices: [], outcome: "OPEN" },
  { choices: ["APPROVE", "APPROVE", "ABSTAIN"], outcome: "OPEN" },
  { choices: ["ABSTAIN", "ABSTAIN", "ABSTAIN"], outcome: "OPEN" },
  { choices: ["APPROVE", "APPROVE", "APPROVE"], outcome: "OPEN" },
  { choices: ["REJECT", "REJECT", "REJECT"], outcome: "OPEN" },
  { choices: ["APPROVE", "APPROVE", "ABSTAIN", "ABSTAIN", "ABSTAIN"], outcome: "REJECTED" },
  { choices: ["ABSTAIN", "ABSTAIN", "ABSTAIN", "ABSTAIN", "ABSTAIN"], outcome: "REJECTED" },
  { choices: ["APPROVE", "APPROVE", "APPROVE", "REJECT", "REJECT"], outcome: "APPROVED" }
])("resolves an untimed committee by votes: $choices -> $outcome", async ({ choices, outcome }) => {
  const { receipt } = await signedReceiptFixture(choices as DecisionChoice[], 4);
  expect(receipt.round.closesAt).toBeNull();
  expect(await verifyDecisionReceipt(receipt)).toMatchObject({ outcome, signed: choices.length, eligible: 5 });
  expect(await verifyDecisionReceipt({ ...receipt, asOf: "2028-10-10T02:00:00.000Z" })).toMatchObject({ outcome });
  expect(tallyDecisions(receipt.round, receipt.ballots, true).outcome).toBe(outcome);
});

it("does not allow a deadline or a different closing rule inside an untimed manifest", async () => {
  const { receipt } = await signedReceiptFixture([], 4);
  expect(roundSchema.safeParse({ ...receipt.round, closesAt: "2026-10-11T01:00:00.000Z" }).success).toBe(false);
  expect(roundSchema.safeParse({ ...receipt.round, completion: "TIME_LIMIT" }).success).toBe(false);
  expect(roundSchema.safeParse({ ...receipt.round, schema: "PARTICIPATE_DECISION_ROUND_V3" }).success).toBe(false);
});

it("keeps individual passkey challenges short-lived even without a review deadline", async () => {
  const { receipt } = await signedReceiptFixture(["APPROVE"], 4);
  const ballot = structuredClone(receipt.ballots[0]);
  ballot.envelope.expiresAt = "2026-10-10T02:00:00.000Z";
  await expect(verifyDecisionBallot(receipt.round, ballot)).rejects.toThrow("Ballot outside signing window");
});
