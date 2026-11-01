import { preparedPilotReceiver, pilotReceiverNotice } from "@/lib/zcash/pilot-credit-receiver";
import { getCreditReceiver } from "@/lib/zcash/credit-receivers";

const prepared = { communityId: "committee", operator: "OpenZcash pilot", network: "mainnet", address: `u1${"a".repeat(100)}`, accountId: "cc74d5ae-f99b-4723-b5df-169498074913" };
afterEach(() => vi.unstubAllEnvs());

describe("prepared pilot receiver", () => {
  it("does not expose private configuration or activate payments", () => {
    vi.stubEnv("CREDIT_PILOT_RECEIVER_JSON", JSON.stringify(prepared));
    vi.stubEnv("CREDIT_PAYMENTS_ENABLED", "false");
    expect(pilotReceiverNotice("committee")).toEqual({ operator: "OpenZcash pilot", network: "mainnet", state: "preparing" });
    expect(pilotReceiverNotice("unrelated-dao")).toBeUndefined();
    expect(getCreditReceiver("committee")).toBeNull();
  });
  it.each(["{", JSON.stringify({ ...prepared, network: "testnet" }), JSON.stringify({ ...prepared, address: "invalid" }), JSON.stringify({ ...prepared, privateKey: "must-not-be-accepted" })])("fails closed for malformed prepared configuration", value => {
    expect(preparedPilotReceiver("committee", value)).toBeNull();
  });
  it("rejects activation with a substituted receiving address", () => {
    vi.stubEnv("WORKSPACE_PREVIEW", "false");
    vi.stubEnv("CREDIT_PAYMENTS_ENABLED", "true");
    vi.stubEnv("CREDIT_PILOT_RECEIVER_JSON", JSON.stringify(prepared));
    vi.stubEnv("CREDIT_RECEIVERS_JSON", JSON.stringify([{ id: "pilot-v1", communityId: "committee", network: "mainnet", address: `u1${"b".repeat(100)}`, accountId: prepared.accountId, walletRpc: { url: "http://localhost:28242" }, chainRpc: { url: "http://localhost:8232" }, credits: 20, amountZat: "100000", requiredConfirmations: 6, expiresInMinutes: 15 }]));
    expect(() => getCreditReceiver("committee")).toThrow("receiving wallet is unavailable");
  });
});
