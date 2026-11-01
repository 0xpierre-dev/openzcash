import { generateInviteToken } from "@/lib/domain/invites";

type RosterMember = {
  nick: string;
  signalUsername: string | null;
  userId?: string | null;
  user?: { status: string } | null;
};

/** An account gets one account entitlement; only unlinked legacy rows get an invite. */
export function snapshotDaoRoster(members: RosterMember[], closesAt: Date) {
  const accounts = new Set<string>();
  const legacy: Array<{ nick: string; signalUsername: string; inviteToken: string; expiresAt: Date }> = [];
  for (const member of members) {
    if (member.userId) {
      if (member.user?.status === "ACTIVE") accounts.add(member.userId);
    } else if (member.signalUsername) {
      legacy.push({ nick: member.nick, signalUsername: member.signalUsername, inviteToken: generateInviteToken(), expiresAt: closesAt });
    }
  }
  return {
    eligibility: { create: [...accounts].map(userId => ({ userId })) },
    voterAccesses: { create: legacy }
  };
}

export const daoRosterSelection = { nick: true, signalUsername: true, userId: true, user: { select: { status: true } } } as const;
