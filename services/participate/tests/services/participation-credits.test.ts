import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { isCreditFundingConfigured } from "@/lib/zcash/credit-receivers";
vi.mock("@/lib/zcash/credit-receivers", () => ({ isCreditFundingConfigured: vi.fn(() => false) }));

const tx = vi.hoisted(() => ({
  user: { findFirst: vi.fn() }, community: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  communityMembership: { findFirst: vi.fn() }, pollVoterAccess: { findFirst: vi.fn() }, poll: { findFirst: vi.fn() },
  pollComment: { findFirst: vi.fn() }, creditAccount: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
  creditOperation: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() }
}));
vi.mock("@/lib/db", () => ({ db: { $transaction: vi.fn(async callback => callback(tx)) } }));
import {
  claimPreviewCredits, debitParticipationCredits, debitParticipationCreditsAtCurrentPrice, getParticipationContext, isParticipationCreditSandbox,
  readAccountCredits, readParticipationPolicy, updateParticipationPolicy
} from "@/lib/services/participation-credits";

const client = tx as unknown as Prisma.TransactionClient;
const community = { id: "community-a", name: "Alpha", participationMode: "CREDITS", commentCost: 4, reactionCost: 1, participationPolicyVersion: 2 };
const hash = createHash("sha256").update("action intent").digest("hex");
const debit = { communityId: "community-a", userId: "alice", kind: "COMMENT" as const, cost: 4, policyVersion: 2, targetId: "poll-a", requestKey: "comment:request-a", payloadHash: hash };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isCreditFundingConfigured).mockReturnValue(false);
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("WORKSPACE_PREVIEW", "true");
  vi.stubEnv("PARTICIPATE_TEST_PORT", "55438");
  vi.stubEnv("DATABASE_URL", "postgresql://dao_test@127.0.0.1:55438/community_treasury_tests");
  tx.user.findFirst.mockResolvedValue({ id: "alice" });
  tx.community.findFirst.mockResolvedValue(community);
  tx.community.findMany.mockResolvedValue([{ ...community, memberships: [{ role: "OWNER" }], polls: [], creditAccounts: [] }]);
  tx.community.updateMany.mockResolvedValue({ count: 1 });
  tx.communityMembership.findFirst.mockResolvedValue({ role: "OWNER" });
  tx.pollVoterAccess.findFirst.mockResolvedValue({ id: "access-a" });
  tx.poll.findFirst.mockResolvedValue({ id: "poll-a" });
  tx.pollComment.findFirst.mockResolvedValue({ id: "comment-a" });
  tx.creditAccount.findUnique.mockResolvedValue({ id: "account-a", balance: 25 });
  tx.creditAccount.upsert.mockResolvedValue({ id: "account-a", balance: 0 });
  tx.creditAccount.updateMany.mockResolvedValue({ count: 1 });
  tx.creditOperation.findUnique.mockResolvedValue(null);
  tx.creditOperation.findMany.mockResolvedValue([]);
  tx.creditOperation.create.mockResolvedValue({ id: "operation-a" });
});
afterEach(() => vi.unstubAllEnvs());

describe("dedicated participation sandbox", () => {
  it.each([
    ["production", "true", "postgresql://dao_test@127.0.0.1:55438/community_workspace"],
    ["test", "false", "postgresql://dao_test@127.0.0.1:55438/community_workspace"],
    ["test", "true", "postgresql://dao_test@remote.example:55438/community_workspace"],
    ["test", "true", "postgresql://dao_test@127.0.0.1:5432/community_workspace"],
    ["test", "true", "postgresql://dao_test@127.0.0.1:55438/production"],
    ["development", "true", "postgresql://dao_test@127.0.0.1:55438/community_treasury_tests"],
    ["test", "true", "invalid-url"]
  ])("blocks preview issuance for %s / %s / %s", async (nodeEnv, preview, url) => {
    vi.stubEnv("NODE_ENV", nodeEnv); vi.stubEnv("WORKSPACE_PREVIEW", preview); vi.stubEnv("DATABASE_URL", url);
    expect(isParticipationCreditSandbox()).toBe(false);
    await expect(claimPreviewCredits("alice", "community-a")).rejects.toMatchObject({ status: 403, code: "PARTICIPATION_CREDITS_UNAVAILABLE" });
    expect(tx.creditAccount.upsert).not.toHaveBeenCalled();
  });

  it("allows only the dedicated preview database outside production and test databases in test mode", () => {
    expect(isParticipationCreditSandbox()).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", "postgresql://dao_test@127.0.0.1:55438/community_workspace");
    expect(isParticipationCreditSandbox()).toBe(true);
  });
});

describe("participation authorization and policy", () => {
  it("keeps FREE actions available outside the sandbox without creating a credit account", async () => {
    vi.stubEnv("NODE_ENV", "production");
    tx.community.findFirst.mockResolvedValue({ ...community, participationMode: "FREE" });
    tx.creditAccount.findUnique.mockResolvedValue(null);
    expect(await getParticipationContext(client, "community-a", { userId: "alice" })).toMatchObject({ mode: "FREE", balance: 0, sponsored: false, sandbox: false, effectiveCommentCost: 0, effectiveReactionCost: 0 });
    expect(await debitParticipationCredits(client, { ...debit, cost: 0, policyVersion: undefined })).toEqual({ replayed: false, balance: 0, operationId: null });
    expect(tx.creditAccount.upsert).not.toHaveBeenCalled();
    expect(tx.creditAccount.updateMany).not.toHaveBeenCalled();
    expect(tx.creditOperation.create).not.toHaveBeenCalled();
  });

  it("explicitly sponsors an active temporary invitation without exposing a stable balance", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const context = await getParticipationContext(client, "community-a", { accessId: "access-a" });
    expect(context).toMatchObject({ mode: "CREDITS", sponsored: true, balance: null, effectiveCommentCost: 0, effectiveReactionCost: 0 });
    expect(tx.pollVoterAccess.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: "access-a", status: "ACTIVE", expiresAt: { gt: expect.any(Date) }, poll: { communityId: "community-a", status: { notIn: ["DRAFT", "ANCHORING"] } }
    } }));
    expect(tx.creditAccount.findUnique).not.toHaveBeenCalled();
    tx.pollVoterAccess.findFirst.mockResolvedValue(null);
    await expect(getParticipationContext(client, "community-b", { accessId: "access-a" })).rejects.toMatchObject({ code: "COMMUNITY_NOT_FOUND" });
  });

  it("requires an active user and authorized community before reading context or granting credits", async () => {
    tx.user.findFirst.mockResolvedValue(null);
    await expect(getParticipationContext(client, "community-a", { userId: "alice" })).rejects.toMatchObject({ code: "COMMUNITY_NOT_FOUND" });
    expect(tx.creditAccount.findUnique).not.toHaveBeenCalled();
    tx.user.findFirst.mockResolvedValue({ id: "alice" });
    tx.community.findFirst.mockResolvedValue(null);
    await expect(claimPreviewCredits("alice", "community-b")).rejects.toMatchObject({ code: "COMMUNITY_NOT_FOUND" });
    expect(tx.creditAccount.upsert).not.toHaveBeenCalled();
  });

  it("allows manager reads but restricts policy mutations to active community owners", async () => {
    tx.communityMembership.findFirst.mockResolvedValue({ role: "MANAGER" });
    expect((await readParticipationPolicy("community-a", "alice")).canManage).toBe(false);
    await expect(updateParticipationPolicy("community-a", "alice", { mode: "FREE", commentCost: 1, reactionCost: 1, expectedVersion: 2 })).rejects.toMatchObject({ code: "POLICY_OWNER_REQUIRED" });
    tx.communityMembership.findFirst.mockResolvedValue(null);
    await expect(readParticipationPolicy("community-b", "alice")).rejects.toMatchObject({ code: "COMMUNITY_NOT_FOUND" });
    expect(tx.communityMembership.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "ACTIVE", user: { status: "ACTIVE" } }) }));
    expect(tx.community.updateMany).not.toHaveBeenCalled();
  });

  it("versions owner changes and rejects stale or unconfigured production credit activation", async () => {
    const input = { mode: "FREE", commentCost: 2, reactionCost: 2, expectedVersion: 2 };
    expect(await updateParticipationPolicy("community-a", "alice", input)).toMatchObject({ version: 3, mode: "FREE", fundingConfigured: false });
    expect(tx.community.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "community-a", participationPolicyVersion: 2 } }));
    await expect(updateParticipationPolicy("community-a", "alice", { ...input, expectedVersion: 1 })).rejects.toMatchObject({ code: "PARTICIPATION_POLICY_CHANGED" });
    vi.stubEnv("NODE_ENV", "production");
    await expect(updateParticipationPolicy("community-a", "alice", { ...input, mode: "CREDITS" })).rejects.toMatchObject({ code: "PARTICIPATION_CREDITS_UNAVAILABLE" });
  });

  it.each([ { mode: "FREE", commentCost: 0, reactionCost: 1, expectedVersion: 2 }, { mode: "CREDITS", commentCost: 1.5, reactionCost: 1, expectedVersion: 2 }, { mode: "FREE", commentCost: 1, reactionCost: 101, expectedVersion: 2 }, { mode: "FREE", commentCost: 1, reactionCost: 1, expectedVersion: 2, fundingConfigured: true } ])("rejects invalid costs or client-supplied funding configuration %j", async input => {
    await expect(updateParticipationPolicy("community-a", "alice", input)).rejects.toMatchObject({ code: "INVALID_PARTICIPATION_INPUT" });
    expect(tx.community.updateMany).not.toHaveBeenCalled();
  });
});

describe("scoped credit accounts", () => {
  it("reads only the active user's accounts and history without issuing credits", async () => {
    tx.creditOperation.findMany.mockResolvedValue([{ id: "grant-a", communityId: "community-a", kind: "PREVIEW_GRANT", delta: 25, createdAt: new Date("2026-10-08T12:00:00Z") }]);
    const view = await readAccountCredits("alice", "community-a");
    expect(view.accounts[0]).toMatchObject({ communityId: "community-a", balance: 0, canManage: true, canClaimPreview: true });
    expect(view.history[0].createdAt).toBe("2026-10-08T12:00:00.000Z");
    expect(tx.creditOperation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "alice", communityId: { in: ["community-a"] } } }));
    expect(tx.creditAccount.upsert).not.toHaveBeenCalled();
  });

  it("retains readable existing accounts after community access ends but disables preview claims", async () => {
    tx.community.findMany.mockResolvedValue([{ ...community, memberships: [], polls: [], creditAccounts: [{ balance: 0, operations: [] }] }]);
    expect((await readAccountCredits("alice")).accounts[0]).toMatchObject({ balance: 0, canManage: false, canClaimPreview: false });
    tx.community.findMany.mockResolvedValue([]);
    await expect(readAccountCredits("alice", "community-b")).rejects.toMatchObject({ code: "COMMUNITY_NOT_FOUND" });
  });

  it("grants a server-fixed one-time 25 credits and replays without replenishing spent credits", async () => {
    expect(await claimPreviewCredits("alice", "community-a")).toEqual({ replayed: false, balance: 25 });
    const operation = tx.creditOperation.create.mock.calls[0][0].data;
    expect(operation).toMatchObject({ delta: 25, kind: "PREVIEW_GRANT", requestKey: "preview-grant:v1", userId: "alice", communityId: "community-a" });
    expect(operation).not.toHaveProperty("targetId");
    tx.creditAccount.upsert.mockResolvedValue({ id: "account-a", balance: 10 });
    tx.creditOperation.findUnique.mockResolvedValue(operation);
    expect(await claimPreviewCredits("alice", "community-a")).toEqual({ replayed: true, balance: 10 });
    expect(tx.creditOperation.create).toHaveBeenCalledTimes(1);
    expect(tx.creditAccount.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("atomic participation debits", () => {
  it("uses the current server price and a conditional scoped balance deduction", async () => {
    expect(await debitParticipationCredits(client, debit)).toEqual({ replayed: false, balance: 21, operationId: "operation-a" });
    expect(tx.creditAccount.updateMany).toHaveBeenCalledWith({ where: { id: "account-a", communityId: "community-a", userId: "alice", balance: { gte: 4 } }, data: { balance: { decrement: 4 } } });
    expect(tx.creditOperation.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ delta: -4, policyVersion: 2, userId: "alice", communityId: "community-a", targetId: "poll-a" }) }));
  });

  it.each([ { cost: 0 }, { cost: 3 }, { policyVersion: 1 }, { policyVersion: undefined } ])("rejects client price or absent/stale paid policy version %j before charging", async changes => {
    await expect(debitParticipationCredits(client, { ...debit, ...changes })).rejects.toMatchObject({ code: "PARTICIPATION_POLICY_CHANGED" });
    expect(tx.creditAccount.updateMany).not.toHaveBeenCalled();
    expect(tx.creditOperation.create).not.toHaveBeenCalled();
  });

  it("replays the same recorded action across later policy changes and rejects a changed intent", async () => {
    tx.creditOperation.findUnique.mockResolvedValue({ id: "old-operation", kind: "COMMENT", targetId: "poll-a", payloadHash: hash });
    tx.community.findFirst.mockResolvedValue({ ...community, commentCost: 8, participationPolicyVersion: 3 });
    expect(await debitParticipationCredits(client, debit)).toEqual({ replayed: true, balance: 25, operationId: "old-operation" });
    await expect(debitParticipationCredits(client, { ...debit, payloadHash: "a".repeat(64) })).rejects.toMatchObject({ code: "CREDIT_IDEMPOTENCY_CONFLICT" });
    expect(tx.creditAccount.updateMany).not.toHaveBeenCalled();
  });

  it("rejects foreign targets, insufficient balances and deduction races without a journal entry", async () => {
    tx.poll.findFirst.mockResolvedValue(null);
    await expect(debitParticipationCredits(client, debit)).rejects.toMatchObject({ code: "COMMUNITY_NOT_FOUND" });
    tx.poll.findFirst.mockResolvedValue({ id: "poll-a" });
    tx.creditAccount.findUnique.mockResolvedValue({ id: "account-a", balance: 3 });
    await expect(debitParticipationCredits(client, debit)).rejects.toMatchObject({ code: "INSUFFICIENT_PARTICIPATION_CREDITS" });
    tx.creditAccount.findUnique.mockResolvedValue({ id: "account-a", balance: 25 });
    tx.creditAccount.updateMany.mockResolvedValue({ count: 0 });
    await expect(debitParticipationCredits(client, debit)).rejects.toMatchObject({ code: "INSUFFICIENT_PARTICIPATION_CREDITS" });
    expect(tx.creditOperation.create).not.toHaveBeenCalled();
  });

  it("allows unconfigured credit policy reads but never a fresh paid production debit", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await getParticipationContext(client, "community-a", { userId: "alice" })).sandbox).toBe(false);
    await expect(debitParticipationCredits(client, debit)).rejects.toMatchObject({ code: "PARTICIPATION_CREDITS_UNAVAILABLE" });
    expect(tx.creditAccount.updateMany).not.toHaveBeenCalled();
  });
});


describe("confirmed-payment credit spending", () => {
  it("allows non-preview spending only when this DAO has configured funding", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("WORKSPACE_PREVIEW", "false");
    vi.mocked(isCreditFundingConfigured).mockReturnValue(true);
    tx.creditAccount.findUnique.mockResolvedValue({ id: "account-a", balance: 25, paymentReview: false, operations: [] });
    expect(await debitParticipationCredits(client, debit)).toMatchObject({ replayed: false, balance: 21 });
    expect(isCreditFundingConfigured).toHaveBeenCalledWith("community-a");
  });
  it("does not spend copied demo balances even when real funding is configured", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("WORKSPACE_PREVIEW", "false");
    vi.mocked(isCreditFundingConfigured).mockReturnValue(true);
    tx.creditAccount.findUnique.mockResolvedValue({ id: "account-a", balance: 25, paymentReview: false, operations: [{ id: "demo-grant" }] });
    await expect(debitParticipationCredits(client, debit)).rejects.toMatchObject({ code: "PARTICIPATION_CREDITS_UNAVAILABLE" });
    expect(tx.creditAccount.updateMany).not.toHaveBeenCalled();
  });
  it("pauses new spending when a credited payment needs review without changing its journal", async () => {
    tx.creditAccount.findUnique.mockResolvedValue({ id: "account-a", balance: 25, paymentReview: true });
    await expect(debitParticipationCredits(client, debit)).rejects.toMatchObject({ code: "CREDIT_PAYMENT_REVIEW" });
    expect((await getParticipationContext(client, "community-a", { userId: "alice" })).paymentReview).toBe(true);
    expect(tx.creditAccount.updateMany).not.toHaveBeenCalled();
    expect(tx.creditOperation.create).not.toHaveBeenCalled();
  });
});

describe("server-priced participation debits", () => {
  const input = { communityId: "community-a", userId: "alice", kind: "COMMENT" as const, policyVersion: 2,
    targetId: "poll-a", requestKey: "comment:request-a", payloadHash: hash };

  it("charges the current price with one account read and retains the conditional debit", async () => {
    expect(await debitParticipationCreditsAtCurrentPrice(client, input)).toMatchObject({ replayed: false, balance: 21, operationId: "operation-a",
      participation: { communityId: "community-a", availableCredits: 21, version: 2, commentCost: 4, reactionCost: 1 } });
    expect(tx.user.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.community.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.creditAccount.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.creditAccount.updateMany).toHaveBeenCalledWith({ where: { id: "account-a", communityId: "community-a", userId: "alice", balance: { gte: 4 } }, data: { balance: { decrement: 4 } } });
  });

  it.each([1, undefined])("rejects stale or absent policy version %s", async policyVersion => {
    await expect(debitParticipationCreditsAtCurrentPrice(client, { ...input, policyVersion })).rejects.toMatchObject({ code: "PARTICIPATION_POLICY_CHANGED" });
    expect(tx.creditAccount.updateMany).not.toHaveBeenCalled();
  });

  it("does not accept a caller-supplied price through the server-priced path", async () => {
    await expect(debitParticipationCreditsAtCurrentPrice(client, { ...input, cost: 0 } as typeof input)).rejects.toMatchObject({ code: "INVALID_PARTICIPATION_INPUT" });
    expect(tx.creditAccount.updateMany).not.toHaveBeenCalled();
  });

  it("preserves account authorization, target validation and lost-race protection", async () => {
    tx.user.findFirst.mockResolvedValue(null);
    await expect(debitParticipationCreditsAtCurrentPrice(client, input)).rejects.toMatchObject({ code: "COMMUNITY_NOT_FOUND" });
    tx.user.findFirst.mockResolvedValue({ id: "alice" });
    tx.community.findFirst.mockResolvedValue(null);
    await expect(debitParticipationCreditsAtCurrentPrice(client, input)).rejects.toMatchObject({ code: "COMMUNITY_NOT_FOUND" });
    tx.community.findFirst.mockResolvedValue(community);
    tx.poll.findFirst.mockResolvedValue(null);
    await expect(debitParticipationCreditsAtCurrentPrice(client, input)).rejects.toMatchObject({ code: "COMMUNITY_NOT_FOUND" });
    tx.poll.findFirst.mockResolvedValue({ id: "poll-a" });
    tx.creditAccount.updateMany.mockResolvedValue({ count: 0 });
    await expect(debitParticipationCreditsAtCurrentPrice(client, input)).rejects.toMatchObject({ code: "INSUFFICIENT_PARTICIPATION_CREDITS" });
    expect(tx.creditOperation.create).not.toHaveBeenCalled();
  });

  it("replays existing debits despite later prices and rejects reused keys with a different intent", async () => {
    tx.creditOperation.findUnique.mockResolvedValue({ id: "old-operation", kind: "COMMENT", targetId: "poll-a", payloadHash: hash });
    tx.community.findFirst.mockResolvedValue({ ...community, commentCost: 8, participationPolicyVersion: 3 });
    expect(await debitParticipationCreditsAtCurrentPrice(client, input)).toMatchObject({ replayed: true, balance: 25, operationId: "old-operation", participation: { availableCredits: 25, version: 3, commentCost: 8 } });
    await expect(debitParticipationCreditsAtCurrentPrice(client, { ...input, payloadHash: "b".repeat(64) })).rejects.toMatchObject({ code: "CREDIT_IDEMPOTENCY_CONFLICT" });
    expect(tx.creditAccount.updateMany).not.toHaveBeenCalled();
  });

  it("keeps public pilot verification and real-payment balances outside demo spending", async () => {
    vi.stubEnv("PARTICIPATE_PUBLIC_DEMO", "true");
    vi.stubEnv("PARTICIPATE_COMMUNITY_ID", "host");
    vi.stubEnv("PARTICIPATE_DEMO_COMMITTEE_ID", "community-a");
    tx.community.findFirst.mockResolvedValue({ ...community, kind: "COMMITTEE" });
    await expect(debitParticipationCreditsAtCurrentPrice(client, input)).rejects.toMatchObject({ code: "VERIFIED_EMAIL_REQUIRED" });
    tx.user.findFirst.mockResolvedValue({ id: "alice", email: "alice@example.invalid", emailVerifiedAt: new Date() });
    tx.creditAccount.findUnique.mockResolvedValue({ id: "account-a", balance: 25, purchases: [{ id: "payment" }], operations: [{ id: "demo-grant" }] });
    await expect(debitParticipationCreditsAtCurrentPrice(client, input)).rejects.toMatchObject({ code: "PARTICIPATION_CREDITS_UNAVAILABLE" });
    expect(tx.creditAccount.updateMany).not.toHaveBeenCalled();
  });
});


it("never mixes a demo grant into an account with a real payment request", async () => {
  tx.creditAccount.upsert.mockResolvedValue({ id: "account-a", balance: 0, purchases: [{ id: "purchase-a" }] });
  await expect(claimPreviewCredits("alice", "community-a")).rejects.toMatchObject({ code: "PREVIEW_CREDITS_UNAVAILABLE" });
  expect(tx.creditAccount.updateMany).not.toHaveBeenCalled();
  expect(tx.creditOperation.create).not.toHaveBeenCalled();
});
