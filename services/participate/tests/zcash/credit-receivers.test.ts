import { getCreditReceiver, isCreditFundingConfigured } from "@/lib/zcash/credit-receivers";
import { creditZatToZec, createCreditPurchaseInputSchema } from "@/lib/domain/credit-purchases";

const receiver = {
  id: "orchard-wallet-v1", communityId: "orchard", network: "testnet",
  address: `utest1${"a".repeat(100)}`, accountId: "cc74d5ae-f99b-4723-b5df-169498074913",
  walletRpc: { url: "http://127.0.0.1:18232", userEnv: "CREDIT_TEST_RPC_USER", passwordEnv: "CREDIT_TEST_RPC_PASSWORD" },
  chainRpc: { url: "http://127.0.0.1:18233" }, credits: 100, amountZat: "100000", requiredConfirmations: 6, expiresInMinutes: 30
};
beforeEach(() => {
  vi.stubEnv("CREDIT_PAYMENTS_ENABLED", "true"); vi.stubEnv("WORKSPACE_PREVIEW", "false");
  vi.stubEnv("CREDIT_RECEIVERS_JSON", JSON.stringify([receiver]));
  vi.stubEnv("CREDIT_TEST_RPC_USER", "reader"); vi.stubEnv("CREDIT_TEST_RPC_PASSWORD", "test-only-secret");
});
afterEach(() => vi.unstubAllEnvs());

describe("DAO credit receiver configuration", () => {
  it("resolves only the selected community with exact amounts and server-only credentials", () => {
    const configured = getCreditReceiver("orchard");
    expect(configured).toMatchObject({ communityId: "orchard", amountZat: "100000", credits: 100, walletRpc: { user: "reader", password: "test-only-secret" } });
    expect(getCreditReceiver("other-dao")).toBeNull();
  });
  it.each(["false", ""])("requires explicit activation: %s", enabled => {
    vi.stubEnv("CREDIT_PAYMENTS_ENABLED", enabled);
    expect(getCreditReceiver("orchard")).toBeNull();
  });
  it("never enables real purchases in the sample-credit environment", () => {
    vi.stubEnv("WORKSPACE_PREVIEW", "true");
    expect(getCreditReceiver("orchard")).toBeNull();
  });
  it.each([
    [receiver, { ...receiver, id: "another-id", communityId: "river" }],
    [receiver, { ...receiver, id: "another-id", accountId: "bad-uuid" }],
    [{ ...receiver, amountZat: "0.001" }],
    [{ ...receiver, amountZat: "2100000000000001" }],
    [{ ...receiver, credits: 100.5 }],
    [{ ...receiver, network: "mainnet" }],
    [{ ...receiver, network: "mainnet", address: `u1${"a".repeat(100)}`, requiredConfirmations: 1 }],
    [{ ...receiver, walletRpc: { url: "http://example.com" } }],
    [{ ...receiver, walletRpc: { url: "https://reader:secret@example.com" } }],
    [{ ...receiver, walletRpc: { url: "https://example.com?password=secret" } }]
  ].map(entries => [entries]))("rejects unsafe or ambiguous configuration %#", entries => {
    vi.stubEnv("CREDIT_RECEIVERS_JSON", JSON.stringify(entries));
    expect(isCreditFundingConfigured("orchard")).toBe(false);
  });
  it("rejects one wallet account assigned to different DAOs", () => {
    vi.stubEnv("CREDIT_RECEIVERS_JSON", JSON.stringify([receiver, { ...receiver, id: "river-wallet", communityId: "river" }]));
    expect(() => getCreditReceiver("orchard")).toThrow("The DAO receiving wallet is unavailable");
  });
  it("does not reveal configuration or secrets in errors", () => {
    vi.stubEnv("CREDIT_TEST_RPC_PASSWORD", "");
    expect(() => getCreditReceiver("orchard")).toThrow("The DAO receiving wallet is unavailable");
  });
});

describe("Credit purchase input and exact display amounts", () => {
  it("uses exact zatoshi arithmetic without floating point", () => {
    expect(creditZatToZec("1")).toBe("0.00000001");
    expect(creditZatToZec("100000")).toBe("0.00100000");
    expect(creditZatToZec("2100000000000000")).toBe("21000000.00000000");
    expect(() => creditZatToZec("1e8")).toThrow();
  });
  it("rejects caller-supplied prices, identities and receipts", () => {
    const input = { communityId: "orchard", requestKey: "10a529ab-1292-4485-81a2-d6fd5cf227ca" };
    expect(createCreditPurchaseInputSchema.safeParse(input).success).toBe(true);
    for (const extra of [{ credits: 999 }, { amountZat: "1" }, { userId: "someone" }, { txid: "proof" }]) {
      expect(createCreditPurchaseInputSchema.safeParse({ ...input, ...extra }).success).toBe(false);
    }
  });
});
