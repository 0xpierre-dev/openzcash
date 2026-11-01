import { randomBytes, randomUUID } from "node:crypto";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { testAuthenticator } from "./passkey-authenticator";
import { buildNativeProposalPackage } from "@/lib/archive/native-proposals";
import { EMPTY_SUBMISSION } from "@/lib/domain/proposal-submission";
import { sha256 } from "@/lib/archive/format";
import { decisionChallenge, decisionHash, roundSchema, type DecisionChoice, type DecisionEnvelope } from "@/lib/decisions/format";
import type { DecisionReceipt } from "@/lib/decisions/verify";

export const signingContext = { origin: "http://localhost:4411", rpId: "localhost" };
export async function signingKey() {
  const authenticator = testAuthenticator(), challenge = randomBytes(32).toString("base64url");
  const result = await verifyRegistrationResponse({ response: authenticator.registration(challenge), expectedChallenge: challenge,
    expectedOrigin: signingContext.origin, expectedRPID: signingContext.rpId, requireUserVerification: true });
  if (!result.verified) throw new Error("Test registration failed");
  return { authenticator, credential: result.registrationInfo.credential, userHandle: randomBytes(32).toString("base64url") };
}
export const decisionPackage = (recordId = "pilot-signed-review") => buildNativeProposalPackage(recordId, { ...EMPTY_SUBMISSION, title: "Independent signed review test", applicant: "Isolated test team", requestedAmountUsd: "1250",
  forumUrl: "https://forum.zcashcommunity.com/t/isolated-test-proposal/12345",
  body: "## Work\n\nTest a preserved proposal and passkey signatures with a fixed roster, reproducible receipts, and explicit quorum rules.\n" }, "2026-10-10T00:00:00.000Z");

export async function signedReceiptFixture(choices: DecisionChoice[] = ["APPROVE", "REJECT", "ABSTAIN"], version: 1 | 2 | 3 | 4 = 1) {
  const proposal = await decisionPackage(), keys = await Promise.all(Array.from({ length: version >= 3 ? 5 : 3 }, () => signingKey()));
  const round = roundSchema.parse({ ...(version >= 3 ? { schema: `PARTICIPATE_DECISION_ROUND_V${version}`, rationale: "PUBLIC_REQUIRED", policy: "ZCG_MAJORITY", approvalBasis: "FULL_ROSTER", ...(version === 4 ? { completion: "ALL_RESPONSES" } : {}) } : version === 2 ? { schema: "PARTICIPATE_DECISION_ROUND_V2", rationale: "PUBLIC_REQUIRED" } : { schema: "PARTICIPATE_DECISION_ROUND_V1" }), id: randomUUID(), purpose: "INDEPENDENT_PILOT_REVIEW", authority: "APPLICATION_MANAGED_ROSTER", ...signingContext,
    proposal: { recordId: proposal.manifest.recordId, revision: 1, manifestHash: proposal.manifestHash, title: proposal.manifest.title },
    opensAt: "2026-10-10T01:00:00.000Z", closesAt: version === 4 ? null : "2026-10-10T02:00:00.000Z",
    rules: { quorum: version === 4 ? 5 : version === 3 ? 3 : 2, approvalPercent: version >= 3 ? 60 : 67, abstentions: "COUNT_FOR_QUORUM_ONLY", changes: "ONE_FINAL_BALLOT" },
    members: await Promise.all(keys.map(async (key, i) => ({ id: randomUUID(), label: `Test reviewer ${i + 1}`, keyHashes: [await sha256(key.credential.publicKey)] }))) });
  const roundHash = await decisionHash(round);
  const ballots = await Promise.all(choices.map(async (choice, i) => {
    const envelope: DecisionEnvelope = { ...(version >= 2 ? { schema: "PARTICIPATE_DECISION_SIGNATURE_V2" as const, rationale: "The preserved milestones and public budget support my decision." } : { schema: "PARTICIPATE_DECISION_SIGNATURE_V1" as const }), roundHash, voterId: round.members[i].id, choice,
      nonce: randomBytes(32).toString("base64url"), issuedAt: "2026-10-10T01:01:00.000Z", expiresAt: "2026-10-10T01:06:00.000Z" };
    const assertion = keys[i].authenticator.authentication(await decisionChallenge(envelope), keys[i].userHandle);
    return { envelope, keyHash: round.members[i].keyHashes[0], publicKey: Buffer.from(keys[i].credential.publicKey).toString("base64url"),
      assertion: { clientDataJSON: assertion.response.clientDataJSON, authenticatorData: assertion.response.authenticatorData, signature: assertion.response.signature }, recordedAt: "2026-10-10T01:01:01.000Z" };
  }));
  const receipt: DecisionReceipt = { schema: "PARTICIPATE_DECISION_RECEIPT_V1", round, roundHash, proposal: proposal.bundle, ballots,
    asOf: round.closesAt ?? "2026-10-10T02:00:00.000Z", completeness: "SERVER_RECORDED_BALLOTS", chain: null };
  return { receipt, keys };
}
