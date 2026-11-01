// @vitest-environment node
import { createPollHistoryObserver, readPollHistoryConfig, type PollHistoryConfig } from "@/lib/zcash/poll-history-observer";

const accountId = "00000000-0000-4000-8000-000000000001";
const txid = "a".repeat(64), tipHash = "b".repeat(64), blockHash = "c".repeat(64);
const config: PollHistoryConfig = { network: "mainnet", accountId, wallet: { url: "https://wallet.example/rpc", user: "reader", password: "fixture-password" }, chain: { url: "https://chain.example/rpc" } };
const requests = [{ id: "request-a", address: "u1ballot" }];
const rawMemo = (text: string) => Buffer.concat([Buffer.from(text), Buffer.alloc(512 - Buffer.byteLength(text))]).toString("hex");
function harness() {
  const state = {
    discovery: { info: { title: "Zallet", version: "0.1.0-beta.3" }, methods: ["getwalletstatus", "z_getaccount", "z_listunifiedreceivers", "z_listtransactions", "z_viewtransaction"].map(name => ({ name })) },
    chain: { chain: "main", blocks: 100, headers: 100, bestblockhash: tipHash, verificationprogress: 1, estimatedheight: 100 },
    wallet: { locked: false, fully_synced_height: 100, node_tip: { height: 100, blockhash: tipHash }, wallet_tip: { height: 100, blockhash: tipHash } },
    account: { account_uuid: accountId, addresses: [{ ua: "u1ballot" }] },
    receivers: { sapling: "zs1ballot" },
    history: [{ account_uuid: accountId, txid, mined_height: 95, outputs: [{ pool: "sapling", output_index: 2, to_account: accountId, to_address: null as string | null, value: 10000, is_change: false, memo: "A" }] }],
    transaction: { txid, status: "mined", confirmations: 6, blockhash: blockHash, outputs: [{ pool: "sapling", output: 2, account_uuid: accountId, outgoing: false, walletInternal: false, address: "zs1ballot", valueZat: 10000, memo: rawMemo("A"), memoStr: "A" }] },
    block: { hash: blockHash, height: 95, confirmations: 6, time: 1_791_504_000, tx: [txid] },
    canonicalHash: blockHash
  };
  const calls: Array<{ method: string; params: unknown[]; init: RequestInit }> = [];
  let override: ((method: string, params: unknown[]) => unknown | undefined) | undefined;
  const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const request = JSON.parse(init!.body as string);
    calls.push({ method: request.method, params: request.params, init: init! });
    const result = override?.(request.method, request.params) ?? ({
      "rpc.discover": state.discovery, getblockchaininfo: state.chain, getwalletstatus: state.wallet,
      z_getaccount: state.account, z_listunifiedreceivers: state.receivers, z_listtransactions: state.history,
      z_viewtransaction: state.transaction, getblock: request.params[0] === tipHash ? { ...state.block, hash: tipHash, height: 100, confirmations: 1, time: Math.floor(Date.now() / 1000) } : state.block,
      getblockhash: request.params[0] === 100 ? tipHash : state.canonicalHash
    } as Record<string, unknown>)[request.method];
    return new Response(JSON.stringify({ id: request.id, result, error: null }));
  }) as unknown as ReturnType<typeof vi.fn<typeof fetch>>;
  return { state, calls, fetcher, observe: () => createPollHistoryObserver(fetcher)(config, requests), override(value: typeof override) { override = value; } };
}
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("closed-poll wallet history observation", () => {
  it("finds a previously spent output with no history address and verifies its block membership", async () => {
    const h = harness();
    const result = await h.observe();
    expect(result).toMatchObject({ kind: "WALLET_HISTORY_ONLY", tipHeight: 100, scannedHeight: 100, transactionCount: 1,
      outputs: [{ requestId: "request-a", txid, pool: "sapling", outputIndex: 2, amountZat: "10000", memo: "A", blockHeight: 95, blockHash, confirmations: 6 }] });
    expect(h.calls.find(call => call.method === "z_listtransactions")!.params).toEqual([accountId, 0, 101, 0, 1000]);
    expect(h.calls.every(call => ["rpc.discover", "getwalletstatus", "z_getaccount", "z_listunifiedreceivers", "z_listtransactions", "z_viewtransaction", "getblockchaininfo", "getblockhash", "getblock"].includes(call.method))).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/wallet.example|chain.example|fixture-password|u1ballot|zs1ballot/);
  });
  it("does not mistake a checked empty wallet snapshot for a finalized tally", async () => {
    const h = harness(); h.state.history = [];
    expect(await h.observe()).toMatchObject({ kind: "WALLET_HISTORY_ONLY", transactionCount: 0, outputs: [] });
    expect(h.calls.filter(call => call.method === "getwalletstatus")).toHaveLength(2);
  });
  it("preserves exact amounts and separates multiple Orchard outputs in one transaction", async () => {
    const h = harness();
    Object.assign(h.state.transaction.outputs[0], { pool: "orchard", output: undefined, action: 7, valueZat: 2_100_000_000_000_000 });
    Object.assign(h.state.history[0].outputs[0], { pool: "orchard", output_index: 7, value: 2_100_000_000_000_000 });
    h.state.transaction.outputs.push({ ...h.state.transaction.outputs[0], action: 8 } as typeof h.state.transaction.outputs[number]);
    h.state.history[0].outputs.push({ ...h.state.history[0].outputs[0], output_index: 8 });
    expect((await h.observe()).outputs.map(output => [output.outputIndex, output.amountZat])).toEqual([[7, "2100000000000000"], [8, "2100000000000000"]]);
  });
  it.each(["foreign-network", "syncing", "locked", "version", "account", "address", "orphan", "missing-tx", "confirmation-count", "unsafe-amount", "memo", "duplicate-output", "duplicate-transaction", "height"])("fails closed for %s", async scenario => {
    const h = harness();
    if (scenario === "foreign-network") h.state.chain.chain = "test";
    if (scenario === "syncing") h.state.wallet.fully_synced_height = 99;
    if (scenario === "locked") h.state.wallet.locked = true;
    if (scenario === "version") h.state.discovery.info.version = "future";
    if (scenario === "account") h.state.account.account_uuid = "00000000-0000-4000-8000-000000000002";
    if (scenario === "address") h.state.account.addresses = [];
    if (scenario === "orphan") h.state.canonicalHash = "d".repeat(64);
    if (scenario === "missing-tx") h.state.block.tx = [];
    if (scenario === "confirmation-count") h.state.transaction.confirmations = 7;
    if (scenario === "unsafe-amount") h.state.transaction.outputs[0].valueZat = Number.MAX_SAFE_INTEGER + 1;
    if (scenario === "memo") h.state.transaction.outputs[0].memoStr = "B";
    if (scenario === "duplicate-output") h.state.transaction.outputs.push(h.state.transaction.outputs[0]);
    if (scenario === "duplicate-transaction") h.state.history.push(h.state.history[0]);
    if (scenario === "height") h.state.history[0].mined_height = 101;
    await expect(h.observe()).rejects.toBeInstanceOf(Error);
  });
  it("checks unrelated receiving rows without leaking another proposal's output", async () => {
    const h = harness(); h.state.transaction.outputs[0].address = "zs1other-proposal";
    expect((await h.observe()).outputs).toEqual([]);
  });
  it("blocks truncated history and oversized request sets rather than omitting votes", async () => {
    const h = harness(); h.state.history = Array.from({ length: 1000 }, () => h.state.history[0]);
    await expect(h.observe()).rejects.toMatchObject({ code: "HISTORY_LIMIT" });
    await expect(createPollHistoryObserver(h.fetcher)(config, Array(129).fill(requests[0]))).rejects.toMatchObject({ code: "HISTORY_LIMIT" });
    expect(h.calls.some(call => call.params[3] === 1000)).toBe(false);
  });
  it("rejects a stale tip, incomplete scan metadata, and a reorganization during observation", async () => {
    const stale = harness(); stale.override((method, params) => method === "getblock" && params[0] === tipHash ? { ...stale.state.block, hash: tipHash, height: 100, confirmations: 1, time: Math.floor(Date.now() / 1000) - 1201 } : undefined);
    await expect(stale.observe()).rejects.toMatchObject({ code: "STALE_CHAIN" });
    const partial = harness(); partial.override(method => method === "getwalletstatus" ? { ...partial.state.wallet, sync_work_remaining: { unscanned_blocks: 1 } } : undefined);
    await expect(partial.observe()).rejects.toMatchObject({ code: "WALLET_SYNCING" });
    const moving = harness(); let chainReads = 0;
    moving.override(method => {
      if (method === "getblockchaininfo" && ++chainReads === 2) {
        moving.state.chain.bestblockhash = "e".repeat(64);
        moving.state.wallet.wallet_tip.blockhash = moving.state.chain.bestblockhash;
        moving.state.wallet.node_tip.blockhash = moving.state.chain.bestblockhash;
      }
      return undefined;
    });
    await expect(moving.observe()).rejects.toMatchObject({ code: "CHAIN_CHANGED" });
  });
  it("requires explicit configuration and sanitizes provider failures", async () => {
    vi.stubEnv("POLL_COLLECTOR_NETWORK", ""); expect(() => readPollHistoryConfig()).toThrow();
    const h = harness(); h.fetcher.mockRejectedValue(new Error("fixture-password and secret endpoint"));
    await expect(h.observe()).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE", message: "The collector could not be verified. Try again shortly." });
  });
  it("bounds stalled/oversized RPC reads and refuses redirects or embedded credentials", async () => {
    const h = harness(); h.fetcher.mockResolvedValue(new Response(new Uint8Array(4 * 1024 * 1024 + 1)));
    await expect(h.observe()).rejects.toMatchObject({ code: "HISTORY_LIMIT" });
    const other = harness();
    await expect(createPollHistoryObserver(other.fetcher)({ ...config, wallet: { url: "http://user:password@wallet.example/rpc" } }, requests)).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
    expect(other.fetcher).not.toHaveBeenCalled();
    vi.useFakeTimers();
    const stalled = createPollHistoryObserver(vi.fn(() => new Promise<Response>(() => undefined)));
    const pending = expect(stalled(config, requests)).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
    await vi.advanceTimersByTimeAsync(6001); await pending;
  });
});
