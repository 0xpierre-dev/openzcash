import { createHash } from "node:crypto";

export const MEMBERSHIP_CONTENT_VERSION = "MEMBERSHIP_ACCOUNT_V1";
type MembershipCommitment = {
  communityId: string | null;
  question: string;
  opensAt: Date;
  closesAt: Date;
  voteModel: string;
  quorumPercent: number;
  passingThresholdPercent: number;
  optionALabel: string | null;
  optionBLabel: string | null;
  optionCLabel: string | null;
  membershipAction: {
    type: string;
    nick: string;
    userId: string | null;
    requestId: string | null;
    targetMemberId: string | null;
  } | null;
};

/** Commits the stable target and consent request, not just a display name. */
export function membershipContentHash(poll: MembershipCommitment) {
  if (!poll.communityId || !poll.membershipAction) throw new Error("Missing membership commitment");
  const action = poll.membershipAction;
  return createHash("sha256").update(JSON.stringify({
    version: MEMBERSHIP_CONTENT_VERSION, communityId: poll.communityId,
    question: poll.question, opensAt: poll.opensAt.toISOString(), closesAt: poll.closesAt.toISOString(),
    voteModel: poll.voteModel, quorumPercent: poll.quorumPercent, passingThresholdPercent: poll.passingThresholdPercent,
    options: [poll.optionALabel, poll.optionBLabel, poll.optionCLabel],
    action: { type: action.type, nick: action.nick, userId: action.userId, requestId: action.requestId, targetMemberId: action.targetMemberId }
  })).digest("hex");
}

export function validMembershipCommitment(poll: MembershipCommitment & { contentHashVersion: string | null; questionHash: string }) {
  if (poll.contentHashVersion !== MEMBERSHIP_CONTENT_VERSION) return false;
  try { return membershipContentHash(poll) === poll.questionHash; } catch { return false; }
}
