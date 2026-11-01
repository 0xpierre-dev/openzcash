import { canonicalJson } from "@/lib/archive/format";
import { ballotSchema, decisionHash, roundSchema, tallyDecisions } from "./format";
import { verifyDecisionReceipt, type DecisionReceipt } from "./verify";

export type StoredDecision = { manifestJson: string; manifestHash: string; ballots: { ballotJson: string; ballotHash: string }[] };

/** Completed V4 receipts have a fixed timestamp and byte representation. */
export async function decisionReceiptFromRows(saved: StoredDecision, proposal: unknown, now = new Date()): Promise<DecisionReceipt> {
  const round = roundSchema.parse(JSON.parse(saved.manifestJson));
  const ballots = await Promise.all(saved.ballots.map(async row => {
    const ballot = ballotSchema.parse(JSON.parse(row.ballotJson));
    if (canonicalJson(ballot) !== row.ballotJson || await decisionHash(ballot) !== row.ballotHash) throw new Error("Ballot integrity failure");
    return ballot;
  }));
  ballots.sort((a,b) => a.envelope.voterId.localeCompare(b.envelope.voterId, "en"));
  const complete = round.schema === "PARTICIPATE_DECISION_ROUND_V4" && ballots.length === round.members.length;
  const asOf = complete ? new Date(Math.max(...ballots.map(b => Date.parse(b.recordedAt)))) : new Date(Math.min(+now, round.closesAt ? Date.parse(round.closesAt) : Infinity));
  const receipt = { schema: "PARTICIPATE_DECISION_RECEIPT_V1" as const, round, roundHash: saved.manifestHash,
    proposal: proposal as DecisionReceipt["proposal"], ballots, asOf: asOf.toISOString(), completeness: "SERVER_RECORDED_BALLOTS" as const, chain: null };
  await verifyDecisionReceipt(receipt);
  return receipt;
}

export function reviewIsPublic(receipt: DecisionReceipt) {
  return receipt.round.schema !== "PARTICIPATE_DECISION_ROUND_V4" || receipt.ballots.length === receipt.round.members.length;
}

export function reviewSummary(receipt: DecisionReceipt) {
  if (receipt.round.schema !== "PARTICIPATE_DECISION_ROUND_V4") return null;
  const tally = tallyDecisions(receipt.round, receipt.ballots, false);
  const base = { roundId: receipt.round.id, revision: receipt.round.proposal.revision, signed: tally.signed, eligible: tally.eligible };
  if (!reviewIsPublic(receipt)) return { ...base, state: "COLLECTING" as const };
  return { ...base, state: "PUBLISHED" as const, outcome: tally.outcome, publishedAt: receipt.asOf,
    approve: tally.approve, reject: tally.reject, abstain: tally.abstain,
    positions: receipt.round.members.map(member => { const ballot = receipt.ballots.find(b => b.envelope.voterId === member.id)!;
      return { name: member.label, choice: ballot.envelope.choice, rationale: "rationale" in ballot.envelope ? ballot.envelope.rationale : "" }; }) };
}
