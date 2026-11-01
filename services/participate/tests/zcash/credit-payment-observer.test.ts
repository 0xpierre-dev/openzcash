// @vitest-environment node
import { createCreditPaymentObserver } from "@/lib/zcash/credit-payment-observer";
import type { CreditReceiverConfig } from "@/lib/domain/credit-purchases";

const accountId = "00000000-0000-4000-8000-000000000001";
const otherAccountId = "00000000-0000-4000-8000-000000000002";
const txid = "a".repeat(64), tipHash = "b".repeat(64), blockHash = "c".repeat(64);
const memo = "DAO-CREDIT-V1:opaque-random-invoice";
const receiver: CreditReceiverConfig = {
  id: "dao-a", communityId: "community-a", network: "mainnet", address: "u1configured-shielded-address",
  accountId, walletRpc: { url: "https://wallet.example/rpc", user: "read-only", password: "test-password" },
  chainRpc: { url: "https://chain.example/rpc" }, credits: 100, amountZat: "1000000", requiredConfirmations: 6, expiresInMinutes: 60
};
const rawMemo = (text: string) => Buffer.concat([Buffer.from(text), Buffer.alloc(512 - Buffer.byteLength(text))]).toString("hex");
const methods = ["getwalletstatus", "z_getaccount", "z_listunifiedreceivers", "z_listtransactions", "z_viewtransaction"];
function harness() {
  const state = {
    discovery: { info: { title: "Zallet", version: "0.1.0-beta.3" }, methods: methods.map(name => ({ name })) },
    chain: { chain: "main", blocks: 100, headers: 100, bestblockhash: tipHash, verificationprogress: 1, estimatedheight: 100 },
    wallet: { locked: false, fully_synced_height: 100, node_tip: { height: 100, blockhash: tipHash }, wallet_tip: { height: 100, blockhash: tipHash } },
    account: { account_uuid: accountId, addresses: [{ ua: receiver.address }] },
    receivers: { sapling: "zs1actual-receiver", orchard: "u1single-orchard-receiver" },
    history: [{ account_uuid: accountId, txid, outputs: [{ to_account: accountId, memo }] }],
    transaction: { txid, status: "mined", confirmations: 6, blockhash: blockHash, outputs: [{
      pool: "sapling", output: 2, account_uuid: accountId, outgoing: false, walletInternal: false,
      address: "zs1actual-receiver", valueZat: 1_000_000, memo: rawMemo(memo), memoStr: memo
    }] },
    block: { hash: blockHash, height: 95, confirmations: 6, time: 1_791_504_000, tx: [txid] },
    canonicalHash: blockHash
  };
  const calls: Array<{ method: string; params: unknown[]; url: string; init: RequestInit }> = [];
  let override: ((method: string, params: unknown[]) => unknown | undefined) | undefined;
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const request = JSON.parse(init!.body as string);
    calls.push({ method: request.method, params: request.params, url: String(url), init: init! });
    const result = override?.(request.method, request.params) ?? ({
      "rpc.discover": state.discovery, getblockchaininfo: state.chain, getwalletstatus: state.wallet,
      z_getaccount: state.account, z_listunifiedreceivers: state.receivers, z_listtransactions: state.history,
      z_viewtransaction: state.transaction, getblock: request.params[0] === tipHash ? { ...state.block, hash: tipHash, height: 100, confirmations: 1, time: Math.floor(Date.now() / 1000) } : state.block,
      getblockhash: request.params[0] === 100 ? tipHash : state.canonicalHash
    } as Record<string, unknown>)[request.method];
    return new Response(JSON.stringify({ id: request.id, result, error: null }), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as ReturnType<typeof vi.fn<typeof fetch>>;
  return { state, calls, fetcher, observer: createCreditPaymentObserver(fetcher), override(value: typeof override) { override = value; } };
}
const observe = (test: ReturnType<typeof harness>, knownTxid?: string) => test.observer.observe(receiver, { memo, startHeight: 90, ...(knownTxid ? { knownTxid } : {}) });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("read-only DAO payment proof", () => {
  it("proves the configured network, account and shielded UA before opening an invoice", async () => {
    const test = harness();
    expect(await test.observer.preflight(receiver)).toEqual({ height: 100 });
    expect(test.calls.find(call => call.method === "z_getaccount")?.params).toEqual([accountId]);
    expect(test.calls.find(call => call.method === "z_listunifiedreceivers")?.params).toEqual([receiver.address]);
    expect(test.calls.every(call => ["rpc.discover", "getwalletstatus", "z_getaccount", "z_listunifiedreceivers", "getblockchaininfo", "getblockhash", "getblock"].includes(call.method))).toBe(true);
  });

  it("identifies each incoming note by pool/index and validates its canonical transaction membership", async () => {
    const test = harness();
    const result = await observe(test);
    expect(result).toMatchObject({ network: "mainnet", tipHeight: 100, tipHash, scannedHeight: 100 });
    expect(result.candidates).toEqual([{ txid, pool: "sapling", outputIndex: 2, accountId, amountZat: "1000000", memo,
      blockHeight: 95, blockHash, blockTime: new Date(test.state.block.time * 1000).toISOString(), confirmations: 6, canonical: true }]);
    expect(test.calls.find(call => call.method === "getblock" && call.params[0] === blockHash)?.params).toEqual([blockHash, 1]);
    expect(test.calls.find(call => call.method === "getblockhash" && call.params[0] === 95)).toBeDefined();
    expect(test.calls.some(call => call.method === "z_listunspent")).toBe(false);
  });

  it("uses the Orchard action index and exact integer zatoshis", async () => {
    const test = harness();
    Object.assign(test.state.transaction.outputs[0], { pool: "orchard", output: undefined, action: 7, address: test.state.receivers.orchard, valueZat: 2_100_000_000_000_000 });
    const result = await observe(test);
    expect(result.candidates[0]).toMatchObject({ pool: "orchard", outputIndex: 7, amountZat: "2100000000000000" });
  });

  it.each(["foreign-account", "foreign-address", "outgoing", "internal", "unsupported-pool"])("ignores %s outputs even when they reuse an invoice memo", async scenario => {
    const test = harness(); const output = test.state.transaction.outputs[0];
    if (scenario === "foreign-account") output.account_uuid = otherAccountId;
    if (scenario === "foreign-address") output.address = "zs1some-other-diversifier";
    if (scenario === "outgoing") output.outgoing = true;
    if (scenario === "internal") output.walletInternal = true;
    if (scenario === "unsupported-pool") output.pool = "ironwood";
    expect((await observe(test)).candidates).toEqual([]);
  });

  it.each(["wrong-network", "locked", "wallet-behind", "wrong-account", "unknown-UA", "unsupported-version"])("fails closed on %s during preflight", async scenario => {
    const test = harness();
    if (scenario === "wrong-network") test.state.chain.chain = "test";
    if (scenario === "locked") test.state.wallet.locked = true;
    if (scenario === "wallet-behind") test.state.wallet.fully_synced_height = 99;
    if (scenario === "wrong-account") test.state.account.account_uuid = otherAccountId;
    if (scenario === "unknown-UA") test.state.account.addresses = [{ ua: "u1some-other-address" }];
    if (scenario === "unsupported-version") test.state.discovery.info.version = "0.1.0-beta.2";
    await expect(test.observer.preflight(receiver)).rejects.toMatchObject({ status: 503, code: "CREDIT_RECEIVER_UNAVAILABLE" });
  });

  it("does not credit a transaction missing from the otherwise canonical block", async () => {
    const test = harness(); test.state.block.tx = ["d".repeat(64)];
    expect((await observe(test, txid)).candidates[0]).toMatchObject({ canonical: false, confirmations: 0 });
  });

  it.each(["p2pkh", "p2sh"])("requires a shielded-only UA instead of permitting %s fallback without an invoice memo", async kind => {
    const test = harness(); test.override(method => method === "z_listunifiedreceivers" ? { ...test.state.receivers, [kind]: "t1transparent-receiver" } : undefined);
    await expect(test.observer.preflight(receiver)).rejects.toMatchObject({ code: "CREDIT_RECEIVER_UNAVAILABLE" });
  });

  it("rejects a stale chain estimate or timestamp even when the wallet reports full synchronization", async () => {
    const test = harness(); test.state.chain.estimatedheight = 110;
    await expect(test.observer.preflight(receiver)).rejects.toMatchObject({ code: "CREDIT_RECEIVER_UNAVAILABLE" });
    test.state.chain.estimatedheight = 100;
    test.override((method, params) => method === "getblock" && params[0] === tipHash
      ? { ...test.state.block, hash: tipHash, height: 100, confirmations: 1, time: Math.floor(Date.now() / 1000) - 1201 } : undefined);
    await expect(test.observer.preflight(receiver)).rejects.toMatchObject({ code: "CREDIT_RECEIVER_UNAVAILABLE" });
  });

  it("reports an orphan block as noncanonical and rejects tip changes during observation", async () => {
    const test = harness(); test.state.canonicalHash = "d".repeat(64);
    expect((await observe(test, txid)).candidates[0]).toMatchObject({ canonical: false, confirmations: 0 });
    const moving = harness(); let reads = 0;
    moving.override(method => {
      if (method === "getblockchaininfo" && ++reads === 2) return { ...moving.state.chain, bestblockhash: "e".repeat(64) };
      return undefined;
    });
    await expect(observe(moving)).rejects.toMatchObject({ code: "CREDIT_RECEIVER_UNAVAILABLE" });
  });

  it("rechecks a known transaction after it leaves discovery and preserves unmined reorg evidence", async () => {
    const test = harness(); test.state.history = [];
    expect((await observe(test, txid)).candidates[0]).toMatchObject({ txid, canonical: true });
    Object.assign(test.state.transaction, { status: "waiting", confirmations: -1, blockhash: undefined });
    expect((await observe(test, txid)).candidates[0]).toMatchObject({ txid, canonical: false, confirmations: 0, blockHeight: null });
  });

  it("rechecks retained or explicitly missing known receipts after the canonical tip falls below invoice creation", async () => {
    const test = harness(); test.state.history = [];
    Object.assign(test.state.transaction, { status: "waiting", confirmations: -1, blockhash: undefined });
    const request = { memo, startHeight: 105, knownTxid: txid };
    expect(await test.observer.observe(receiver, request)).toMatchObject({ tipHeight: 100, scannedHeight: 100,
      candidates: [{ txid, canonical: false, confirmations: 0, blockHeight: null }] });
    expect(test.calls.find(call => call.method === "z_listtransactions")?.params).toEqual([accountId, 105, null, 0, 1000]);
    const normal = test.fetcher.getMockImplementation()!;
    test.fetcher.mockImplementation(async (url, init) => {
      const rpc = JSON.parse(init!.body as string);
      if (rpc.method === "z_viewtransaction") return new Response(JSON.stringify({ id: rpc.id, result: null, error: { code: -5 } }), { status: 500 });
      return normal(url, init);
    });
    expect(await test.observer.observe(receiver, request)).toMatchObject({ tipHeight: 100, scannedHeight: 100, candidates: [] });
  });

  it("distinguishes explicit known-transaction absence from provider failure", async () => {
    const test = harness(); test.state.history = [];
    const normal = test.fetcher.getMockImplementation()!;
    let errorCode = -5;
    test.fetcher.mockImplementation(async (url, init) => {
      const rpc = JSON.parse(init!.body as string);
      if (rpc.method === "z_viewtransaction") return new Response(JSON.stringify({ id: rpc.id, result: null, error: { code: errorCode, message: "Provider detail" } }), { status: 500 });
      return normal(url, init);
    });
    expect((await observe(test, txid)).candidates).toEqual([]);
    errorCode = -32603;
    await expect(observe(test, txid)).rejects.toMatchObject({ code: "CREDIT_RECEIVER_UNAVAILABLE" });
  });

  it("returns a known output as noncanonical when its old block is explicitly absent", async () => {
    const test = harness(); const normal = test.fetcher.getMockImplementation()!;
    test.fetcher.mockImplementation(async (url, init) => {
      const rpc = JSON.parse(init!.body as string);
      if (rpc.method === "getblock" && rpc.params[0] === blockHash) return new Response(JSON.stringify({ id: rpc.id, result: null, error: { code: -5 } }), { status: 500 });
      return normal(url, init);
    });
    expect((await observe(test, txid)).candidates[0]).toMatchObject({ txid, canonical: false, confirmations: 0, blockHash: null });
  });

  it("keeps multiple matching outputs distinct for the invoice service to review", async () => {
    const test = harness(); test.state.transaction.outputs.push({ ...test.state.transaction.outputs[0], output: 3 });
    expect((await observe(test)).candidates.map(candidate => candidate.outputIndex)).toEqual([2, 3]);
    test.state.transaction.outputs[1].output = 2;
    await expect(observe(test)).rejects.toMatchObject({ code: "CREDIT_RECEIVER_UNAVAILABLE" });
  });

  it("requires exact text memo decoding without treating 0xF4 as a memo header", async () => {
    const test = harness();
    const output = test.state.transaction.outputs[0];
    output.memo = rawMemo(`${memo}\0extra`); delete (output as Partial<typeof output>).memoStr;
    expect((await observe(test)).candidates).toEqual([]);
    output.memo = Buffer.concat([Buffer.from([0xf6]), Buffer.alloc(511)]).toString("hex");
    expect((await observe(test)).candidates).toEqual([]);
    output.memo = Buffer.concat([Buffer.from([0xf4]), Buffer.alloc(511)]).toString("hex");
    await expect(observe(test)).rejects.toMatchObject({ code: "CREDIT_RECEIVER_UNAVAILABLE" });
  });

  it("rejects inconsistent memo strings, unsafe amounts and missing pool indices", async () => {
    const test = harness(); test.state.transaction.outputs[0].memoStr = "Different memo";
    await expect(observe(test)).rejects.toMatchObject({ code: "CREDIT_RECEIVER_UNAVAILABLE" });
    test.state.transaction.outputs[0].memoStr = memo; test.state.transaction.outputs[0].valueZat = Number.MAX_SAFE_INTEGER + 1;
    await expect(observe(test)).rejects.toMatchObject({ code: "CREDIT_RECEIVER_UNAVAILABLE" });
    Object.assign(test.state.transaction.outputs[0], { valueZat: 1_000_000, output: undefined });
    await expect(observe(test)).rejects.toMatchObject({ code: "CREDIT_RECEIVER_UNAVAILABLE" });
  });

  it("uses one bounded history snapshot instead of OFFSET pages that could omit mutable unmined transactions", async () => {
    const test = harness();
    test.override((method, params) => method === "z_listtransactions" ? params[3] === 0 ? Array.from({ length: 999 }, () => test.state.history[0]) : [] : undefined);
    expect((await observe(test)).candidates).toHaveLength(1);
    expect(test.calls.filter(call => call.method === "z_listtransactions").map(call => call.params)).toEqual([[accountId, 90, null, 0, 1000]]);
    test.override(method => method === "z_listtransactions" ? Array.from({ length: 1000 }, () => test.state.history[0]) : undefined);
    await expect(observe(test)).rejects.toMatchObject({ code: "CREDIT_RECEIVER_UNAVAILABLE" });
  });

  it("hides provider errors and RPC credential details, with bounded bodies and no redirects", async () => {
    const test = harness();
    await observe(test);
    const request = test.calls[0].init;
    expect(request.redirect).toBe("error"); expect(request.cache).toBe("no-store");
    expect(request.headers).toMatchObject({ authorization: `Basic ${Buffer.from("read-only:test-password").toString("base64")}` });
    test.fetcher.mockRejectedValue(new Error("private endpoint https://wallet.example/rpc with test-password"));
    await expect(observe(test)).rejects.toMatchObject({ message: "The DAO receiving wallet could not be verified. Please try again later", code: "CREDIT_RECEIVER_UNAVAILABLE" });
    test.fetcher.mockResolvedValue(new Response(new Uint8Array(4 * 1024 * 1024 + 1)));
    await expect(test.observer.preflight(receiver)).rejects.toMatchObject({ code: "CREDIT_RECEIVER_UNAVAILABLE" });
  });

  it("bounds time even if the provider ignores the abort signal", async () => {
    vi.useFakeTimers(); const fetcher = vi.fn(() => new Promise<Response>(() => undefined));
    const result = createCreditPaymentObserver(fetcher as typeof fetch).preflight(receiver);
    const assertion = expect(result).rejects.toMatchObject({ code: "CREDIT_RECEIVER_UNAVAILABLE" });
    await vi.advanceTimersByTimeAsync(6001); await assertion;
  });
});
