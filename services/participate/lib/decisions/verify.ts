import { z } from "zod";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { archivePackageSchema, digestSchema, sha256, verifyArchivePackage } from "@/lib/archive/format";
import { ballotSchema, decisionChallenge, decisionHash, roundSchema, tallyDecisions, type DecisionRound } from "./format";

export const decisionReceiptSchema = z.object({
  schema: z.literal("PARTICIPATE_DECISION_RECEIPT_V1"), round: roundSchema, roundHash: digestSchema,
  proposal: archivePackageSchema, ballots: z.array(ballotSchema).max(200),
  asOf: z.string().datetime(), completeness: z.literal("SERVER_RECORDED_BALLOTS"),
  chain: z.null()
}).strict();
export type DecisionReceipt = z.infer<typeof decisionReceiptSchema>;

export async function verifyDecisionBallot(round: DecisionRound, input: unknown) {
  const ballot = ballotSchema.parse(input), envelope = ballot.envelope;
  if ((round.schema !== "PARTICIPATE_DECISION_ROUND_V1") !== (envelope.schema === "PARTICIPATE_DECISION_SIGNATURE_V2")) throw new Error("Signature format does not match the frozen round");
  const key = new Uint8Array(Buffer.from(ballot.publicKey, "base64url"));
  if (Buffer.from(key).toString("base64url") !== ballot.publicKey || await sha256(key) !== ballot.keyHash ||
    envelope.roundHash !== await decisionHash(round) ||
    !round.members.some(m => m.id === envelope.voterId && m.keyHashes.includes(ballot.keyHash))) throw new Error("Ballot is not bound to this round and member");
  const issued = Date.parse(envelope.issuedAt), expires = Date.parse(envelope.expiresAt), recorded = Date.parse(ballot.recordedAt);
  if (issued < Date.parse(round.opensAt) || expires <= issued || expires - issued > 300000 || (round.closesAt !== null && expires > Date.parse(round.closesAt)) || recorded < issued || recorded >= expires) throw new Error("Ballot outside signing window");
  const client = JSON.parse(Buffer.from(ballot.assertion.clientDataJSON, "base64url").toString("utf8"));
  if (client.crossOrigin === true || client.topOrigin) throw new Error("Cross-origin signing is disabled");
  // Credential IDs and user handles are not signed by WebAuthn. Omit them from the
  // public receipt and use a synthetic local ID to check the signed bytes only.
  const result = await verifyAuthenticationResponse({
    response: { id: ballot.keyHash, rawId: ballot.keyHash, type: "public-key", clientExtensionResults: {}, response: ballot.assertion },
    credential: { id: ballot.keyHash, publicKey: key, counter: 0 }, expectedOrigin: round.origin, expectedRPID: round.rpId,
    expectedChallenge: await decisionChallenge(envelope), requireUserVerification: true
  });
  if (!result.verified) throw new Error("Invalid decision signature");
  return ballot;
}

/** No database, session or server needed. The expected receipt hash must be obtained separately. */
export async function verifyDecisionReceipt(input: unknown, expectedHash?: string) {
  const receipt = decisionReceiptSchema.parse(input);
  if (expectedHash && (digestSchema.parse(expectedHash), await decisionHash(receipt) !== expectedHash)) throw new Error("Receipt fingerprint mismatch");
  if (await decisionHash(receipt.round) !== receipt.roundHash) throw new Error("Round fingerprint mismatch");
  const proposal = await verifyArchivePackage(receipt.proposal, receipt.round.proposal.manifestHash);
  if (proposal.manifest.recordId !== receipt.round.proposal.recordId || proposal.manifest.revision !== receipt.round.proposal.revision || proposal.manifest.title !== receipt.round.proposal.title) throw new Error("Proposal binding mismatch");
  if (new Set(receipt.ballots.map(b => b.envelope.voterId)).size !== receipt.ballots.length) throw new Error("Duplicate member ballot");
  if (Date.parse(receipt.asOf) < Date.parse(receipt.round.opensAt)) throw new Error("Invalid receipt time");
  for (const ballot of receipt.ballots) {
    await verifyDecisionBallot(receipt.round, ballot);
    if (Date.parse(ballot.recordedAt) > Date.parse(receipt.asOf)) throw new Error("Ballot recorded after receipt time");
  }
  return { signatureStatus: "VERIFIED", proposalStatus: "MATCHED", ...tallyDecisions(receipt.round, receipt.ballots, receipt.round.closesAt !== null && Date.parse(receipt.asOf) >= Date.parse(receipt.round.closesAt)),
    receiptHash: await decisionHash(receipt), authority: receipt.round.authority, completeness: receipt.completeness, chainStatus: "NOT_ANCHORED" };
}
