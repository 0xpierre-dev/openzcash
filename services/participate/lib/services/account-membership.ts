import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { manageableCommunityWhere } from "@/lib/services/communities";
import { publicWorkspaceCommunityWhere } from "@/lib/services/workspace";
import { daoRosterSelection, snapshotDaoRoster } from "@/lib/domain/dao-roster";
import { DEFAULT_PASSING_THRESHOLD_PERCENT, DEFAULT_QUORUM_PERCENT, DEFAULT_VOTE_MODEL } from "@/lib/domain/governance";
import { MEMBERSHIP_CONTENT_VERSION, membershipContentHash } from "@/lib/domain/membership-content";
import { MIN_POLL_WINDOW_MS } from "@/lib/domain/poll-window";
import { getDefaultPollFeeZat } from "@/lib/config/polls";

export class AccountMembershipError extends Error {
  constructor(public readonly code: string, public readonly status: 400 | 404 | 409 | 429 = 409) {
    super(code); this.name = "AccountMembershipError";
  }
}

const requestSelection = {
  id: true, status: true, createdAt: true, updatedAt: true,
  user: { select: { nick: true } }, action: { select: { pollId: true } }
} satisfies Prisma.DaoMembershipRequestSelect;
type RequestRow = Prisma.DaoMembershipRequestGetPayload<{ select: typeof requestSelection }>;
function requestView(row: RequestRow) {
  return { id: row.id, nick: row.user.nick, status: row.status, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), proposalId: row.action?.pollId ?? null };
}
export type MembershipRequestView = ReturnType<typeof requestView>;
export type MyMembershipView = { memberStatus: "ACTIVE" | "REMOVED" | null; request: MembershipRequestView | null; canRequestAt: string | null };

async function transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await db.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) {
        if (attempt < 3) continue;
        throw new AccountMembershipError("MEMBERSHIP_CHANGED");
      }
      throw error;
    }
  }
  throw new Error("Unreachable transaction retry");
}

async function manage(tx: Prisma.TransactionClient, communityId: string, userId: string) {
  const community = await tx.community.findFirst({
    where: { id: communityId, ...manageableCommunityWhere(userId) },
    select: { id: true, memberships: { where: { userId, status: "ACTIVE" }, select: { role: true } } }
  });
  if (!community) throw new AccountMembershipError("COMMUNITY_NOT_FOUND", 404);
  return community;
}

export async function readMyMembership(communityId: string, userId: string): Promise<MyMembershipView> {
  const activeUser = await db.user.findFirst({ where: { id: userId, status: "ACTIVE" }, select: { id: true } });
  if (!activeUser) throw new AccountMembershipError("ACCOUNT_UNAVAILABLE", 404);
  const [member, request] = await Promise.all([
    db.daoMember.findUnique({ where: { communityId_userId: { communityId, userId } }, select: { status: true } }),
    db.daoMembershipRequest.findFirst({ where: { communityId, userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: requestSelection })
  ]);
  return { memberStatus: member?.status ?? null, request: request ? requestView(request) : null,
    canRequestAt: request && ["WITHDRAWN", "DECLINED", "ADMITTED"].includes(request.status) ? new Date(+request.updatedAt + 86_400_000).toISOString() : null };
}

export async function requestDaoMembership(communityId: string, userId: string, input: unknown) {
  const parsed = z.object({ requestId: z.string().uuid() }).strict().safeParse(input);
  if (!parsed.success) throw new AccountMembershipError("INVALID_MEMBERSHIP_REQUEST", 400);
  return transaction(async tx => {
    const user = await tx.user.findFirst({ where: { id: userId, status: "ACTIVE" }, select: { id: true } });
    if (!user) throw new AccountMembershipError("ACCOUNT_UNAVAILABLE", 404);
    const community = await tx.community.findFirst({ where: { id: communityId, kind: "DAO", OR: [
      manageableCommunityWhere(userId), publicWorkspaceCommunityWhere(), { daoMembers: { some: { userId, status: "ACTIVE" } } }
    ] }, select: { id: true } });
    if (!community) throw new AccountMembershipError("COMMUNITY_NOT_FOUND", 404);
    const repeated = await tx.daoMembershipRequest.findFirst({ where: { id: parsed.data.requestId, communityId, userId }, select: requestSelection });
    if (repeated) return requestView(repeated);
    if (await tx.daoMember.findFirst({ where: { communityId, userId, status: "ACTIVE" }, select: { id: true } })) {
      throw new AccountMembershipError("ALREADY_A_MEMBER");
    }
    const open = await tx.daoMembershipRequest.findFirst({ where: { communityId, userId, status: { in: ["PENDING", "PROPOSED"] } }, select: requestSelection });
    if (open) return requestView(open);
    const recent = await tx.daoMembershipRequest.count({ where: { userId, OR: [
      { communityId, updatedAt: { gt: new Date(Date.now() - 86_400_000) } },
      { createdAt: { gt: new Date(Date.now() - 3_600_000) } }
    ] } });
    const localRecent = await tx.daoMembershipRequest.findFirst({ where: { userId, communityId, updatedAt: { gt: new Date(Date.now() - 86_400_000) } }, select: { id: true } });
    if (recent >= 10 || localRecent) throw new AccountMembershipError("REQUEST_COOLDOWN", 429);
    return requestView(await tx.daoMembershipRequest.create({ data: { id: parsed.data.requestId, communityId, userId }, select: requestSelection }));
  });
}

export async function readMembershipRequests(communityId: string, userId: string) {
  return transaction(async tx => {
    await manage(tx, communityId, userId);
    return (await tx.daoMembershipRequest.findMany({
      where: { communityId, status: { in: ["PENDING", "PROPOSED"] }, user: { status: "ACTIVE" } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 100, select: requestSelection
    })).map(requestView);
  });
}

export async function reviewMembershipRequest(communityId: string, userId: string, requestId: string, operation: "withdraw" | "decline") {
  return transaction(async tx => {
    if (operation === "decline") await manage(tx, communityId, userId);
    const request = await tx.daoMembershipRequest.findFirst({ where: {
      id: requestId, communityId,
      ...(operation === "withdraw" ? { userId, user: { status: "ACTIVE" } } : {})
    }, select: { id: true, status: true } });
    if (!request) throw new AccountMembershipError("REQUEST_NOT_FOUND", 404);
    const status = operation === "withdraw" ? "WITHDRAWN" : "DECLINED";
    if (request.status === status) return { status };
    if (request.status !== "PENDING" && !(operation === "withdraw" && request.status === "PROPOSED")) throw new AccountMembershipError("REQUEST_ALREADY_REVIEWED");
    await tx.daoMembershipRequest.update({ where: { id: request.id }, data: { status, ...(operation === "decline" ? { reviewedById: userId } : {}) } });
    return { status };
  });
}

export async function initializeAccountRoster(communityId: string, userId: string, input: unknown) {
  const parsed = z.object({ includeSelf: z.boolean(), requestIds: z.array(z.string().uuid()).max(99) }).strict().safeParse(input);
  if (!parsed.success || new Set(parsed.data.requestIds).size !== parsed.data.requestIds.length) throw new AccountMembershipError("INVALID_INITIAL_ROSTER", 400);
  return transaction(async tx => {
    const community = await manage(tx, communityId, userId);
    if (!community.memberships.some(member => member.role === "OWNER")) throw new AccountMembershipError("OWNER_REQUIRED", 404);
    if (await tx.daoMember.count({ where: { communityId } })) throw new AccountMembershipError("DAO_MEMBER_BOOTSTRAP_LOCKED");
    const requests = await tx.daoMembershipRequest.findMany({
      where: { id: { in: parsed.data.requestIds }, communityId, status: "PENDING", user: { status: "ACTIVE" } },
      select: { id: true, user: { select: { id: true, nick: true } } }
    });
    if (requests.length !== parsed.data.requestIds.length) throw new AccountMembershipError("REQUEST_ALREADY_REVIEWED");
    const users = new Map(requests.map(request => [request.user.id, request.user]));
    if (parsed.data.includeSelf) {
      const actor = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, nick: true } });
      users.set(actor.id, actor);
    }
    if (!users.size) throw new AccountMembershipError("INVALID_INITIAL_ROSTER", 400);
    await tx.daoMember.createMany({ data: [...users.values()].map(user => ({ communityId, userId: user.id, nick: user.nick })) });
    await tx.daoMembershipRequest.updateMany({ where: { communityId, userId: { in: [...users.keys()] }, status: "PENDING" }, data: { status: "ADMITTED", reviewedById: userId } });
    return { count: users.size };
  });
}

const proposalSchema = z.object({
  requestKey: z.string().uuid(), question: z.string().trim().min(12).max(200),
  opensAt: z.string().datetime(), closesAt: z.string().datetime(),
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("ADD_MEMBER"), requestId: z.string().uuid() }).strict(),
    z.object({ type: z.literal("REMOVE_MEMBER"), targetMemberId: z.string().min(1).max(100) }).strict()
  ])
}).strict().refine(value => Date.parse(value.closesAt) - Date.parse(value.opensAt) >= MIN_POLL_WINDOW_MS);

export async function createAccountMembershipProposal(communityId: string, userId: string, input: unknown) {
  const parsed = proposalSchema.safeParse(input);
  if (!parsed.success) throw new AccountMembershipError("INVALID_MEMBERSHIP_PROPOSAL", 400);
  const value = parsed.data;
  return transaction(async tx => {
    await manage(tx, communityId, userId);
    const repeated = await tx.poll.findFirst({ where: { id: value.requestKey, communityId, createdById: userId }, include: { membershipAction: true } });
    if (repeated) {
      if (repeated.question !== value.question || repeated.opensAt.toISOString() !== new Date(value.opensAt).toISOString() || repeated.closesAt.toISOString() !== new Date(value.closesAt).toISOString() ||
        repeated.membershipAction?.type !== value.action.type || (value.action.type === "ADD_MEMBER" ? repeated.membershipAction.requestId !== value.action.requestId : repeated.membershipAction.targetMemberId !== value.action.targetMemberId)) {
        throw new AccountMembershipError("REQUEST_KEY_REUSED");
      }
      return { pollId: repeated.id };
    }
    let action: { type: "ADD_MEMBER" | "REMOVE_MEMBER"; nick: string; signalUsername: string | null; userId: string | null; requestId: string | null; targetMemberId: string | null };
    if (value.action.type === "ADD_MEMBER") {
      const request = await tx.daoMembershipRequest.findFirst({ where: { id: value.action.requestId, communityId, status: "PENDING", user: { status: "ACTIVE" } }, include: { user: { select: { id: true, nick: true } } } });
      if (!request) throw new AccountMembershipError("REQUEST_ALREADY_REVIEWED");
      const collision = await tx.daoMember.findFirst({ where: { communityId, OR: [
        { userId: request.userId, status: "ACTIVE" },
        { nick: request.user.nick, OR: [{ userId: null }, { userId: { not: request.userId } }] }
      ] }, select: { id: true } });
      if (collision) throw new AccountMembershipError("MEMBER_IDENTITY_CONFLICT");
      action = { type: "ADD_MEMBER", nick: request.user.nick, userId: request.userId, requestId: request.id, signalUsername: null, targetMemberId: null };
    } else {
      const member = await tx.daoMember.findFirst({ where: { id: value.action.targetMemberId, communityId, status: "ACTIVE" } });
      if (!member) throw new AccountMembershipError("MEMBER_NOT_FOUND", 404);
      action = { type: "REMOVE_MEMBER", nick: member.nick, userId: member.userId, requestId: null, targetMemberId: member.id, signalUsername: member.signalUsername };
    }
    const roster = snapshotDaoRoster(await tx.daoMember.findMany({ where: { communityId, status: "ACTIVE" }, select: daoRosterSelection }), new Date(value.closesAt));
    if (!roster.eligibility.create.length && !roster.voterAccesses.create.length) throw new AccountMembershipError("DAO_MEMBER_BASKET_EMPTY");
    const pollData = {
      communityId, question: value.question, opensAt: new Date(value.opensAt), closesAt: new Date(value.closesAt),
      voteModel: DEFAULT_VOTE_MODEL, quorumPercent: DEFAULT_QUORUM_PERCENT, passingThresholdPercent: DEFAULT_PASSING_THRESHOLD_PERCENT,
      optionALabel: "Approve", optionBLabel: "Reject", optionCLabel: "Abstain"
    };
    const poll = await tx.poll.create({ data: {
      ...pollData, id: value.requestKey, createdById: userId, audience: "DAO_MEMBERS", feeZat: getDefaultPollFeeZat(),
      contentHashVersion: MEMBERSHIP_CONTENT_VERSION, questionHash: membershipContentHash({ ...pollData, membershipAction: action }),
      membershipAction: { create: action }, ...roster, tally: { create: {} }
    }, select: { id: true } });
    if (action.requestId) await tx.daoMembershipRequest.update({ where: { id: action.requestId }, data: { status: "PROPOSED", reviewedById: userId } });
    return { pollId: poll.id };
  });
}
