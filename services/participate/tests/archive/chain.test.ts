// @vitest-environment node
import { createArchiveObserver, createArchiveRpc, readArchiveChainConfig, validateArchiveConfig, type ArchiveChainConfig } from "@/lib/archive/chain";

const txid = "a".repeat(64), blockHash = "b".repeat(64), tipHash = "c".repeat(64);
export const config: ArchiveChainConfig = { network: "testnet", receiver: "ztestsapling1" + "q".repeat(60), publicViewingKey: "zxviewtestsapling1" + "q".repeat(80), birthdayHeight: 80, walletVersion: "0.1.0-beta.3", requiredConfirmations: 10,
  reader: { url: "http://127.0.0.1:28233" }, chain: { url: "http://192.168.10.10:18232" }, writer: { url: "http://127.0.0.1:28232" } };
function harness() {
  const memo = "ZVOICE|ARCHIVE|fixture";
  const state = { chain: { chain: "test", blocks: 100, headers: 100, bestblockhash: tipHash, verificationprogress: 1 },
    transaction: { txid, status: "mined", blockhash: blockHash, outputs: [{ pool: "sapling", output: 0, address: config.receiver, memo: Buffer.concat([Buffer.from(memo), Buffer.alloc(512 - memo.length)]).toString("hex") }] },
    nodeTransaction: null as { txid: string; blockhash?: string; confirmations?: number } | null,
    canonical: blockHash, importedAddress: config.receiver, importRejected: false, version: config.walletVersion, scanned: 100, locked: false, freshReader: false, time: Math.floor(Date.now() / 1000),
    block: { hash: blockHash, height: 90, confirmations: 11, time: Math.floor(Date.now() / 1000) - 750, tx: [txid] } };
  const methods: string[] = [];
  const fetcher = vi.fn(async (_input: unknown, init?: RequestInit) => {
    const { method, params } = JSON.parse(String(init?.body)); methods.push(method);
    if (method === "z_exportviewingkey" || method === "z_importviewingkey" && state.importRejected) {
      return new Response(JSON.stringify({ id: "archive-v1", error: { code: -4, message: "Viewing-key operation rejected" } }));
    }
    const response = method === "rpc.discover" ? { info: { title: "Zallet", version: state.version }, methods: ["z_importviewingkey", "getwalletstatus", "z_viewtransaction"].map(name => ({ name })) }
      : method === "z_importviewingkey" ? { address_type: "sapling", address: state.importedAddress } : method === "getblockchaininfo" ? state.chain
      : method === "getwalletstatus" ? state.freshReader ? { locked: true } : { wallet_tip: { height: state.scanned, blockhash: tipHash }, fully_synced_height: state.scanned, locked: state.locked }
      : method === "getblock" ? params[0] === tipHash ? { ...state.block, hash: tipHash, height: 100, confirmations: 1, time: state.time } : state.block
      : method === "getblockhash" ? params[0] === state.scanned ? tipHash : state.canonical : method === "z_viewtransaction" ? state.transaction : method === "getrawtransaction" ? state.nodeTransaction : null;
    return new Response(JSON.stringify({ id: "archive-v1", result: response }));
  }) as unknown as typeof fetch;
  return { state, fetcher, methods, observe: () => createArchiveObserver(fetcher)(config, txid, memo) };
}
describe("independent archive observation", () => {
  it("derives a diversified recipient only through the account bound to the imported public key", async () => {
    const h = harness(); h.state.importedAddress = "ztestsapling1default";
    let derived = config.receiver;
    const account = "7ada62b6-2a31-48a1-b0b0-b93caca714d2";
    const fetcher: typeof fetch = async (url, init) => {
      const { method, params } = JSON.parse(String(init?.body));
      let result;
      if (method === "z_listaccounts") result = [{ account_uuid: account, addresses: [{ ua: "default-ua", diversifier_index: 0 }] }];
      else if (method === "z_listunifiedreceivers") result = { sapling: params[0] === "default-ua" ? h.state.importedAddress : derived };
      else if (method === "z_getaddressforaccount") { expect(params).toEqual([account, ["sapling"], 4608934267]); result = { address: "derived-ua", diversifier_index: 4608934267 }; }
      else return h.fetcher(url, init);
      return new Response(JSON.stringify({ id: "archive-v1", result }));
    };
    await expect(createArchiveObserver(fetcher)({ ...config, receiverIndex: 4608934267 }, txid, "ZVOICE|ARCHIVE|fixture")).resolves.toMatchObject({ receiver: config.receiver, receiverIndex: 4608934267 });
    derived = "wrong-recipient";
    await expect(createArchiveObserver(fetcher)({ ...config, receiverIndex: 4608934267 }, txid, "ZVOICE|ARCHIVE|fixture")).rejects.toThrow("READER_KEY_MISMATCH");
  });
  it("binds the exact memo output to a canonical block and public reader", async () => {
    const h = harness(); const result = await h.observe();
    expect(result).toMatchObject({ txid, blockHash, blockHeight: 90, confirmations: 11, pool: "sapling", outputIndex: 0, publicViewingKey: config.publicViewingKey });
    expect(h.methods).not.toContain("z_sendmany");
    expect(h.methods).not.toContain("z_exportviewingkey");
    const imports = vi.mocked(h.fetcher).mock.calls.map(([, init]) => JSON.parse(String(init?.body))).filter(call => call.method === "z_importviewingkey");
    expect(imports).toEqual([{ jsonrpc: "2.0", id: "archive-v1", method: "z_importviewingkey", params: [config.publicViewingKey, "whenkeyisnew", config.birthdayHeight] }]);
  });
  it("keeps an expired wallet status retryable when node inclusion is unavailable", async () => {
    const h = harness(); h.state.transaction.status = "expired";
    await expect(h.observe()).rejects.toThrow("READER_SYNCING");
    expect(h.methods).not.toContain("z_sendmany");
  });
  it.each(["expired", "mempool", "waiting"])("verifies canonical node inclusion despite a stale %s wallet status", async status => {
    const h = harness(); h.state.transaction.status = status;
    h.state.nodeTransaction = { txid, blockhash: blockHash, confirmations: 11 };
    await expect(h.observe()).resolves.toMatchObject({ txid, blockHash, confirmations: 11 });
    const nodeCalls = vi.mocked(h.fetcher).mock.calls.map(([url, init]) => ({ url, ...JSON.parse(String(init?.body)) })).filter(call => call.method === "getrawtransaction");
    expect(nodeCalls).toEqual([{ url: config.chain.url, jsonrpc: "2.0", id: "archive-v1", method: "getrawtransaction", params: [txid, 1] }]);
  });
  it.each(["orphan", "missing-tx", "wrong-tx", "memo", "reader-tip", "unconfirmed"])("rejects %s evidence on the node fallback path", async mode => {
    const h = harness(); h.state.transaction.status = "expired";
    h.state.nodeTransaction = { txid, blockhash: blockHash, confirmations: 11 };
    if (mode === "orphan") h.state.canonical = "d".repeat(64);
    if (mode === "missing-tx") h.state.block.tx = [];
    if (mode === "wrong-tx") h.state.nodeTransaction.txid = "d".repeat(64);
    if (mode === "memo") h.state.transaction.outputs[0].memo = "00".repeat(512);
    if (mode === "reader-tip") h.state.scanned = 89;
    if (mode === "unconfirmed") h.state.nodeTransaction.confirmations = 0;
    await expect(h.observe()).rejects.toThrow();
  });
  it.each(["network", "orphan", "missing-tx", "memo", "recipient", "key", "unmined", "sync", "stale", "version", "ambiguous"])("refuses %s evidence", async mode => {
    const h = harness();
    if (mode === "network") h.state.chain.chain = "main";
    if (mode === "orphan") h.state.canonical = "d".repeat(64);
    if (mode === "missing-tx") h.state.block.tx = [];
    if (mode === "memo") h.state.transaction.outputs[0].memo = "00".repeat(512);
    if (mode === "recipient") h.state.transaction.outputs[0].address = "ztestsapling1other";
    if (mode === "key") h.state.importedAddress = "ztestsapling1other";
    if (mode === "unmined") h.state.transaction.status = "mempool";
    if (mode === "sync") h.state.scanned = 89;
    if (mode === "stale") h.state.time -= 1201;
    if (mode === "version") h.state.version = "unknown";
    if (mode === "ambiguous") h.state.transaction.outputs.push(h.state.transaction.outputs[0]);
    await expect(h.observe()).rejects.toThrow();
  });
  it("rejects a reader that refuses the key import, including a wallet with spending authority", async () => {
    const h = harness(); h.state.importRejected = true;
    await expect(h.observe()).rejects.toThrow("RPC_REJECTED");
    expect(h.methods).not.toContain("z_viewtransaction");
  });
  it("reports a fresh reader as syncing before reading any transaction", async () => {
    const h = harness(); h.state.freshReader = true;
    await expect(h.observe()).rejects.toThrow("READER_SYNCING");
    expect(h.methods).not.toContain("z_viewtransaction");
  });
  it("verifies a positively decoded canonical output during older balance backfill, but rejects an orphan", async () => {
    const h = harness(); h.state.locked = true;
    await expect(h.observe()).resolves.toMatchObject({ txid, blockHash, confirmations: 11 });
    h.state.canonical = "d".repeat(64);
    await expect(h.observe()).rejects.toThrow("ORPHANED");
  });
  it("requires the reader's older tip to cover the transaction on the node's canonical branch", async () => {
    const h = harness();
    const readerHash = "e".repeat(64);
    let canonicalReaderHash = readerHash;
    const fetcher: typeof fetch = async (url, init) => {
      const { method, params } = JSON.parse(String(init?.body));
      const result = method === "getwalletstatus"
        ? { wallet_tip: { height: 97, blockhash: readerHash }, fully_synced_height: 81, locked: true, sync_work_remaining: { unscanned_blocks: 16 } }
        : method === "getblockhash" && params[0] === 97 ? canonicalReaderHash : undefined;
      return result === undefined ? h.fetcher(url, init) : new Response(JSON.stringify({ id: "archive-v1", result }));
    };
    const observe = () => createArchiveObserver(fetcher)(config, txid, "ZVOICE|ARCHIVE|fixture");
    await expect(observe()).resolves.toMatchObject({ blockHeight: 90, tipHeight: 100 });
    canonicalReaderHash = "f".repeat(64);
    await expect(observe()).rejects.toThrow("READER_CHAIN_MISMATCH");
  });
  it("rejects plaintext remote wallet credentials, embedded credentials and oversized responses", async () => {
    const h = harness(); const rpc = createArchiveRpc(h.fetcher);
    await expect(rpc({ url: "http://192.168.10.10:28232" }, "rpc.discover", [])).rejects.toThrow("UNSAFE_RPC_CONFIGURATION");
    await expect(rpc({ url: "https://user:secret@example.com" }, "rpc.discover", [])).rejects.toThrow("UNSAFE_RPC_CONFIGURATION");
    const large = createArchiveRpc(vi.fn(async () => new Response(new Uint8Array(4 * 1024 * 1024 + 1))) as unknown as typeof fetch);
    await expect(large(config.reader, "rpc.discover", [])).rejects.toThrow("RPC_RESPONSE_TOO_LARGE");
  });
});

const ironwoodConfig: ArchiveChainConfig = { ...config, pool: "ironwood", receiver: "utest1" + "q".repeat(100), publicViewingKey: "uviewtest1" + "q".repeat(150), receiverIndex: 7 };
function ironwoodHarness() {
  const base = harness(), account = "7ada62b6-2a31-48a1-b0b0-b93caca714d2";
  const state = {
    key: ironwoodConfig.publicViewingKey, derived: ironwoodConfig.receiver, derivedIndex: ironwoodConfig.receiverIndex,
    receivers: { orchard: ironwoodConfig.receiver } as Record<string, string>,
    accounts: [{ account_uuid: account, seedfp: undefined as string | undefined, addresses: [{ ua: ironwoodConfig.receiver, diversifier_index: ironwoodConfig.receiverIndex }] }],
    outputs: [{ pool: "ironwood", action: 3 as number | undefined, output: undefined as number | undefined, address: ironwoodConfig.receiver,
      account_uuid: account, outgoing: false, walletInternal: false, valueZat: 1 as number | undefined, memo: base.state.transaction.outputs[0].memo }]
  };
  const methods = ["z_exportviewingkey", "z_listaccounts", "z_listunifiedreceivers", "z_getaddressforaccount", "getwalletstatus", "z_viewtransaction"];
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const { method, params } = JSON.parse(String(init?.body));
    let result;
    if (method === "rpc.discover") result = { info: { title: "Zallet", version: config.walletVersion }, methods: methods.map(name => ({ name })) };
    else if (method === "z_listunifiedreceivers") result = state.receivers;
    else if (method === "z_listaccounts") result = state.accounts;
    else if (method === "z_exportviewingkey") { expect(params).toEqual([ironwoodConfig.receiver, false]); result = state.key; }
    else if (method === "z_getaddressforaccount") { expect(params).toEqual([account, ["orchard"], ironwoodConfig.receiverIndex]); result = { address: state.derived, diversifier_index: state.derivedIndex }; }
    else if (method === "z_viewtransaction") result = { ...base.state.transaction, outputs: state.outputs };
    else return base.fetcher(url, init);
    return new Response(JSON.stringify({ id: "archive-v1", result }));
  }) as unknown as typeof fetch;
  return { state, base, fetcher, observe: () => createArchiveObserver(fetcher)(ironwoodConfig, txid, "ZVOICE|ARCHIVE|fixture") };
}

describe("Ironwood archive observation with a pre-imported UFVK", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("uses the Orchard receiver/key contract but binds only an incoming Ironwood action", async () => {
    const h = ironwoodHarness();
    await expect(h.observe()).resolves.toMatchObject({ pool: "ironwood", outputIndex: 3, receiverIndex: 7, txid, publicViewingKey: ironwoodConfig.publicViewingKey });
    const methods = vi.mocked(h.fetcher).mock.calls.map(([, init]) => JSON.parse(String(init?.body)).method);
    expect(methods).toContain("z_exportviewingkey");
    expect(methods).not.toContain("z_importviewingkey");
    expect(methods).not.toContain("z_sendmany");
  });
  it.each(["missing-account", "spending-account", "wrong-key", "wrong-derived-receiver", "wrong-derived-index", "transparent", "sapling-receiver", "unknown-receiver"])("rejects %s before transaction inspection", async mode => {
    const h = ironwoodHarness();
    if (mode === "missing-account") h.state.accounts = [];
    if (mode === "spending-account") h.state.accounts[0].seedfp = "spending-material-present";
    if (mode === "wrong-key") h.state.key = "uviewtest1" + "p".repeat(150);
    if (mode === "wrong-derived-receiver") h.state.derived = "utest1" + "p".repeat(100);
    if (mode === "wrong-derived-index") h.state.derivedIndex = 8;
    if (mode === "transparent") h.state.receivers.p2pkh = "transparent-recipient";
    if (mode === "sapling-receiver") h.state.receivers.sapling = config.receiver;
    if (mode === "unknown-receiver") h.state.receivers.future = "another-receiver";
    await expect(h.observe()).rejects.toThrow();
    expect(vi.mocked(h.fetcher).mock.calls.some(([, init]) => JSON.parse(String(init?.body)).method === "z_viewtransaction")).toBe(false);
  });
  it.each(["orchard-pool", "missing-action", "sapling-output-index", "wrong-account", "outgoing", "internal", "ambiguous", "wrong-memo"])("refuses %s even for the correct receiver", async mode => {
    const h = ironwoodHarness(), output = h.state.outputs[0];
    if (mode === "orchard-pool") output.pool = "orchard";
    if (mode === "missing-action") output.action = undefined;
    if (mode === "sapling-output-index") output.output = 3;
    if (mode === "wrong-account") output.account_uuid = "6ada62b6-2a31-48a1-b0b0-b93caca714d2";
    if (mode === "outgoing") output.outgoing = true;
    if (mode === "internal") output.walletInternal = true;
    if (mode === "ambiguous") h.state.outputs.push({ ...output });
    if (mode === "wrong-memo") output.memo = "00".repeat(512);
    await expect(h.observe()).rejects.toThrow();
  });
  it.each([undefined, 0, 2, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])("rejects an Ironwood anchor value of %s zatoshis", async valueZat => {
    const h = ironwoodHarness(); h.state.outputs[0].valueZat = valueZat;
    await expect(h.observe()).rejects.toThrow();
  });
  it("requires an explicit pool, network-matched unified key and derivation index", () => {
    expect(() => validateArchiveConfig(ironwoodConfig)).not.toThrow();
    expect(() => validateArchiveConfig({ ...ironwoodConfig, pool: undefined })).toThrow("SAPLING_READER_REQUIRED");
    expect(() => validateArchiveConfig({ ...ironwoodConfig, receiverIndex: undefined })).toThrow("IRONWOOD_READER_REQUIRED");
    expect(() => validateArchiveConfig({ ...ironwoodConfig, publicViewingKey: "uview1" + "q".repeat(100) })).toThrow("IRONWOOD_READER_REQUIRED");
    expect(() => validateArchiveConfig({ ...ironwoodConfig, publicViewingKey: "uivktest1" + "q".repeat(100) })).toThrow("IRONWOOD_READER_REQUIRED");
    expect(() => validateArchiveConfig({ ...ironwoodConfig, writer: ironwoodConfig.reader })).toThrow("INDEPENDENT_READER_REQUIRED");
  });
  it("reads explicit Ironwood configuration, including receiver index zero", () => {
    for (const [key, value] of Object.entries({ ARCHIVE_NETWORK: "testnet", ARCHIVE_POOL: "ironwood", ARCHIVE_RECEIVER: ironwoodConfig.receiver,
      ARCHIVE_PUBLIC_VIEWING_KEY: ironwoodConfig.publicViewingKey, ARCHIVE_RECEIVER_INDEX: "0", ARCHIVE_BIRTHDAY_HEIGHT: "80", ARCHIVE_ZALLET_VERSION: config.walletVersion,
      ARCHIVE_CONFIRMATIONS: "10", ARCHIVE_READER_RPC_URL: config.reader.url, ARCHIVE_CHAIN_RPC_URL: config.chain.url })) vi.stubEnv(key, value);
    expect(readArchiveChainConfig()).toMatchObject({ pool: "ironwood", receiverIndex: 0 });
  });
});
