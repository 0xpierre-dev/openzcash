import { z } from "zod";
import { canonicalJson, digestSchema, sha256, utf8 } from "@/lib/archive/format";

const encoded = z.string().min(1).max(16000).regex(/^[A-Za-z0-9_-]+$/);
export const decisionChoice = z.enum(["APPROVE", "REJECT", "ABSTAIN"]);
export type DecisionChoice = z.infer<typeof decisionChoice>;
export const decisionRules = z.object({
  quorum: z.number().int().min(1).max(200), approvalPercent: z.number().int().min(1).max(100),
  abstentions: z.literal("COUNT_FOR_QUORUM_ONLY"), changes: z.literal("ONE_FINAL_BALLOT")
}).strict();
// A committee decision is a majority of all five seats, never a percentage
// recalculated from only the members who chose approve or reject.
export const ZCG_REVIEW_RULES = {
  quorum: 5, approvalPercent: 60,
  abstentions: "COUNT_FOR_QUORUM_ONLY", changes: "ONE_FINAL_BALLOT"
} as const;
const roundBase = z.object({
  id: z.string().uuid(),
  purpose: z.literal("INDEPENDENT_PILOT_REVIEW"), authority: z.literal("APPLICATION_MANAGED_ROSTER"),
  proposal: z.object({ recordId: z.string().max(96), revision: z.number().int().positive(), manifestHash: digestSchema, title: z.string().max(300) }).strict(),
  origin: z.string().url(), rpId: z.string().min(1).max(253),
  opensAt: z.string().datetime(), closesAt: z.string().datetime(), rules: decisionRules,
  members: z.array(z.object({ id: z.string().uuid(), label: z.string().min(1).max(80), keyHashes: z.array(digestSchema).min(1).max(10) }).strict()).min(1).max(200)
}).strict();
export const roundSchema = z.discriminatedUnion("schema", [
  roundBase.extend({ schema: z.literal("PARTICIPATE_DECISION_ROUND_V1") }).strict(),
  roundBase.extend({ schema: z.literal("PARTICIPATE_DECISION_ROUND_V2"), rationale: z.literal("PUBLIC_REQUIRED") }).strict(),
  roundBase.extend({ schema: z.literal("PARTICIPATE_DECISION_ROUND_V3"), rationale: z.literal("PUBLIC_REQUIRED"),
    policy: z.literal("ZCG_MAJORITY"), approvalBasis: z.literal("FULL_ROSTER") }).strict(),
  roundBase.extend({ schema: z.literal("PARTICIPATE_DECISION_ROUND_V4"), rationale: z.literal("PUBLIC_REQUIRED"),
    policy: z.literal("ZCG_MAJORITY"), approvalBasis: z.literal("FULL_ROSTER"),
    closesAt: z.null(), completion: z.literal("ALL_RESPONSES") }).strict()
]).superRefine((r, ctx) => {
  const keys = r.members.flatMap(m => m.keyHashes);
  const origin = new URL(r.origin);
  if ((r.schema === "PARTICIPATE_DECISION_ROUND_V3" || r.schema === "PARTICIPATE_DECISION_ROUND_V4") &&
    (r.members.length !== 5 || r.rules.quorum !== (r.schema === "PARTICIPATE_DECISION_ROUND_V4" ? 5 : 3) || r.rules.approvalPercent !== 60)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Committee reviews require five members and three approvals" });
  }
  if (new Set(r.members.map(m => m.id)).size !== r.members.length || new Set(keys).size !== keys.length ||
    r.rules.quorum > r.members.length || (r.closesAt !== null && Date.parse(r.closesAt) <= Date.parse(r.opensAt)) ||
    origin.origin !== r.origin || origin.hostname !== r.rpId || (origin.protocol !== "https:" && !(r.rpId === "localhost" && origin.protocol === "http:"))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid frozen round" });
  }
});
export const decisionRationale = z.string().min(10).max(4000).refine(value => value === value.trim() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "Use 10–4,000 visible characters");
const envelopeBase = z.object({
  roundHash: digestSchema,
  voterId: z.string().uuid(), choice: decisionChoice, nonce: encoded.max(64),
  issuedAt: z.string().datetime(), expiresAt: z.string().datetime()
}).strict();
export const envelopeSchema = z.discriminatedUnion("schema", [
  envelopeBase.extend({ schema: z.literal("PARTICIPATE_DECISION_SIGNATURE_V1") }).strict(),
  envelopeBase.extend({ schema: z.literal("PARTICIPATE_DECISION_SIGNATURE_V2"), rationale: decisionRationale }).strict()
]);
export const ballotSchema = z.object({
  envelope: envelopeSchema, publicKey: encoded, keyHash: digestSchema,
  assertion: z.object({ clientDataJSON: encoded, authenticatorData: encoded, signature: encoded }).strict(),
  recordedAt: z.string().datetime()
}).strict();
export type DecisionRound = z.infer<typeof roundSchema>;
export type DecisionEnvelope = z.infer<typeof envelopeSchema>;
export type DecisionBallot = z.infer<typeof ballotSchema>;
export const decisionHash = (value: unknown) => sha256(utf8(canonicalJson(value)));
export async function decisionChallenge(envelope: DecisionEnvelope) {
  const hex = await decisionHash(envelopeSchema.parse(envelope));
  return btoa(String.fromCharCode(...hex.match(/../g)!.map(byte => parseInt(byte, 16)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function tallyDecisions(round: DecisionRound, ballots: Pick<DecisionBallot, "envelope">[], closed: boolean) {
  const approve = ballots.filter(b => b.envelope.choice === "APPROVE").length;
  const reject = ballots.filter(b => b.envelope.choice === "REJECT").length;
  const abstain = ballots.filter(b => b.envelope.choice === "ABSTAIN").length;
  const quorumMet = ballots.length >= round.rules.quorum;
  const denominator = round.schema === "PARTICIPATE_DECISION_ROUND_V3" || round.schema === "PARTICIPATE_DECISION_ROUND_V4" ? round.members.length : approve + reject;
  const thresholdMet = denominator > 0 && approve * 100 >= denominator * round.rules.approvalPercent;
  // Untimed committee decisions wait for every member, even when a majority
  // has already formed. Passage still requires three approvals of five seats.
  const resolved = round.schema === "PARTICIPATE_DECISION_ROUND_V4"
    ? ballots.length === round.members.length
    : closed;
  return { approve, reject, abstain, signed: ballots.length, eligible: round.members.length, quorumMet, thresholdMet,
    outcome: !resolved ? "OPEN" : !quorumMet ? "QUORUM_NOT_MET" : thresholdMet ? "APPROVED" : "REJECTED" };
}
