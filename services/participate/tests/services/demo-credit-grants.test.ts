import { Prisma } from "@prisma/client";
const tx = vi.hoisted(() => ({
  user: { findFirst: vi.fn() }, community: { findFirst: vi.fn() },
  creditAccount: { findUnique: vi.fn(), updateMany: vi.fn() },
  creditOperation: { findUnique: vi.fn(), create: vi.fn() }
}));
const transaction = vi.hoisted(() => vi.fn(async callback => callback(tx)));
vi.mock("@/lib/db", () => ({ db: { $transaction: transaction } }));
import { grantOperatorDemoCredits } from "@/lib/services/demo-credit-grants";
const input = { userId: "user-a", nick: "member-a", communityId: "committee-a", amount: 100, requestKey: "demo-topup:test-20261012", reason: "User-requested free demo participation" };
const account = { id: "account-a", balance: 0, paymentReview: false, purchases: [], operations: [{ id: "initial-demo-allowance" }] };
beforeEach(() => {
  vi.clearAllMocks();
  transaction.mockImplementation(async callback => callback(tx));
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("PARTICIPATE_PUBLIC_DEMO", "true");
  vi.stubEnv("PARTICIPATE_COMMUNITY_ID", "host-a"); vi.stubEnv("PARTICIPATE_DEMO_COMMITTEE_ID", "committee-a");
  tx.user.findFirst.mockResolvedValue({ id: "user-a", email: "member@example.test", emailVerifiedAt: new Date() });
  tx.community.findFirst.mockResolvedValue({ participationPolicyVersion: 1 });
  tx.creditAccount.findUnique.mockResolvedValue(account);
  tx.creditAccount.updateMany.mockResolvedValue({ count: 1 });
  tx.creditOperation.findUnique.mockResolvedValue(null);
  tx.creditOperation.create.mockResolvedValue({ id: "operation-a" });
});
afterEach(() => vi.unstubAllEnvs());

describe("private operator demo top-ups", () => {
  it("previews by default without touching balances or the journal", async () => {
    expect(await grantOperatorDemoCredits(input)).toEqual({ applied: false, replayed: false, balance: 0, proposedBalance: 100, operationId: null });
    expect(tx.creditAccount.updateMany).not.toHaveBeenCalled(); expect(tx.creditOperation.create).not.toHaveBeenCalled();
  });
  it("atomically appends a traceable free grant and increments only the existing account", async () => {
    expect(await grantOperatorDemoCredits(input, true)).toEqual({ applied: true, replayed: false, balance: 100, operationId: "operation-a" });
    expect(tx.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: input.userId, nick: input.nick, status: "ACTIVE" } }));
    expect(tx.creditOperation.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: "ADMIN_DEMO_GRANT", delta: 100, targetId: input.reason, requestKey: input.requestKey, accountId: "account-a" }) }));
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });
  it("replays the same operation without replenishing credits already spent", async () => {
    await grantOperatorDemoCredits(input, true);
    const operation = { ...tx.creditOperation.create.mock.calls[0][0].data, id: "operation-a" };
    tx.creditOperation.findUnique.mockResolvedValue(operation);
    tx.creditAccount.findUnique.mockResolvedValue({ ...account, balance: 91 });
    expect(await grantOperatorDemoCredits(input, true)).toEqual({ applied: false, replayed: true, balance: 91, operationId: "operation-a" });
    expect(tx.creditAccount.updateMany).toHaveBeenCalledTimes(1);
    await expect(grantOperatorDemoCredits({ ...input, amount: 101 }, true)).rejects.toMatchObject({ code: "CREDIT_IDEMPOTENCY_CONFLICT" });
  });
  it.each([0, -1, 1001, 1.5, Number.NaN])("rejects invalid grant amount %s", async amount => {
    await expect(grantOperatorDemoCredits({ ...input, amount }, true)).rejects.toMatchObject({ code: "INVALID_DEMO_GRANT" });
    expect(transaction).not.toHaveBeenCalled();
  });
  it.each([{ requestKey: "preview-grant:v1" }, { reason: "short" }, { reason: "control\ncharacters" }, { extra: "untrusted" }])("rejects malformed intent %j", async changed => {
    await expect(grantOperatorDemoCredits({ ...input, ...changed }, true)).rejects.toMatchObject({ code: "INVALID_DEMO_GRANT" });
  });
  it("requires an enabled public pilot and its exact committee", async () => {
    await expect(grantOperatorDemoCredits({ ...input, communityId: "other-committee" }, true)).rejects.toMatchObject({ code: "DEMO_GRANT_SCOPE_REQUIRED" });
    vi.stubEnv("PARTICIPATE_PUBLIC_DEMO", "false");
    await expect(grantOperatorDemoCredits(input, true)).rejects.toMatchObject({ code: "DEMO_GRANT_SCOPE_REQUIRED" });
    expect(tx.creditAccount.updateMany).not.toHaveBeenCalled();
  });
  it.each([null, { id: "user-a", email: "member@example.test", emailVerifiedAt: null }])("rejects missing/mismatched or unverified identity", async user => {
    tx.user.findFirst.mockResolvedValue(user);
    await expect(grantOperatorDemoCredits(input, true)).rejects.toMatchObject({ code: "DEMO_GRANT_IDENTITY_MISMATCH" });
  });
  it.each([null, { ...account, purchases: [{ id: "purchase-a" }] }, { ...account, paymentReview: true }, { ...account, operations: [] }])("rejects new, paid or review accounts", async invalidAccount => {
    tx.creditAccount.findUnique.mockResolvedValue(invalidAccount);
    await expect(grantOperatorDemoCredits(input, true)).rejects.toMatchObject({ code: "DEMO_GRANT_ACCOUNT_REQUIRED" });
    expect(tx.creditAccount.updateMany).not.toHaveBeenCalled();
  });
  it("preserves the maximum balance", async () => {
    tx.creditAccount.findUnique.mockResolvedValue({ ...account, balance: 999_999_901 });
    await expect(grantOperatorDemoCredits(input, true)).rejects.toMatchObject({ code: "CREDIT_BALANCE_LIMIT" });
  });
  it("retries a serialization conflict", async () => {
    transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("retry", { code: "P2034", clientVersion: "6" }));
    expect(await grantOperatorDemoCredits(input, true)).toMatchObject({ applied: true });
    expect(transaction).toHaveBeenCalledTimes(2);
  });
});
