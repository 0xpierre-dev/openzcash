import { z } from "zod";
import { archiveNetworkSchema, digestSchema, type ArchiveNetwork } from "@/lib/archive/format";

export class ArchiveChainError extends Error {
  constructor(public readonly code: string) { super(code); this.name = "ArchiveChainError"; }
}
export type ArchiveRpc = { url: string; user?: string; password?: string };
export type ArchivePool = "sapling" | "ironwood";
export type ArchiveChainConfig = { network: ArchiveNetwork; pool?: ArchivePool; receiver: string; receiverIndex?: number; publicViewingKey: string; birthdayHeight: number; walletVersion: string; requiredConfirmations: number; reader: ArchiveRpc; chain: ArchiveRpc; writer?: ArchiveRpc };
const height = z.number().int().min(0).max(2_147_483_646);
const hash = digestSchema;
const chainSchema = z.object({ chain: z.enum(["main", "test", "regtest"]), blocks: height, headers: height, bestblockhash: hash, verificationprogress: z.number(), estimatedheight: height.optional(), initial_block_download_complete: z.boolean().optional(), initialblockdownload: z.boolean().optional() });
const blockSchema = z.object({ hash, height, confirmations: z.number().int(), time: z.number().int().positive(), tx: z.array(hash).max(50000) });
const transactionSchema = z.object({ txid: hash, status: z.string(), blockhash: hash.optional(), outputs: z.array(z.object({ pool: z.string(), output: height.optional(), action: height.optional(), account_uuid: z.string().uuid().optional(), outgoing: z.boolean().nullable().optional(), walletInternal: z.boolean().optional(), valueZat: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(), address: z.string().optional(), memo: z.string().regex(/^[a-fA-F0-9]{1024}$/).optional() })).max(10000) });
const nodeTransactionSchema = z.object({ txid: hash, blockhash: hash.optional(), confirmations: z.number().int().optional() });
const syncSchema = z.object({ wallet_tip: z.object({ height, blockhash: hash }).optional(), fully_synced_height: height.optional(), sync_work_remaining: z.unknown().optional(), locked: z.boolean() });
const discoverySchema = z.object({ info: z.object({ title: z.literal("Zallet"), version: z.string() }), methods: z.array(z.object({ name: z.string() })) });
const importedReaderSchema = z.object({ address_type: z.literal("sapling"), address: z.string() });
const configSchema = z.object({ network: archiveNetworkSchema, pool: z.enum(["sapling", "ironwood"]).optional(), receiver: z.string().min(40).max(512), receiverIndex: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(), publicViewingKey: z.string().min(40).max(2048), birthdayHeight: height, walletVersion: z.string().min(1), requiredConfirmations: z.number().int().min(1).max(1000) });
const fail = (code: string): never => { throw new ArchiveChainError(code); };

/** Encoding bounds only; the pinned Zallet reader validates and binds the key itself. */
export function archiveReaderIdentityValid(config: Pick<ArchiveChainConfig, "network" | "pool" | "receiver" | "receiverIndex" | "publicViewingKey">) {
  if ((config.pool ?? "sapling") === "sapling") {
    return (config.network === "mainnet" ? /^zs1[a-z0-9]+$/ : /^ztestsapling1[a-z0-9]+$/).test(config.receiver)
      && /^zxview[a-z0-9]+$/.test(config.publicViewingKey);
  }
  return config.pool === "ironwood" && config.receiverIndex !== undefined
    && (config.network === "mainnet" ? /^u1[a-z0-9]+$/ : /^utest1[a-z0-9]+$/).test(config.receiver)
    && (config.network === "mainnet" ? /^uview1[a-z0-9]+$/ : /^uviewtest1[a-z0-9]+$/).test(config.publicViewingKey);
}

export function readArchiveChainConfig(): ArchiveChainConfig {
  const value = configSchema.safeParse({ network: process.env.ARCHIVE_NETWORK, pool: process.env.ARCHIVE_POOL, receiver: process.env.ARCHIVE_RECEIVER,
    publicViewingKey: process.env.ARCHIVE_PUBLIC_VIEWING_KEY, birthdayHeight: Number(process.env.ARCHIVE_BIRTHDAY_HEIGHT ?? NaN),
    walletVersion: process.env.ARCHIVE_ZALLET_VERSION, requiredConfirmations: Number(process.env.ARCHIVE_CONFIRMATIONS ?? NaN),
    ...(process.env.ARCHIVE_RECEIVER_INDEX ? { receiverIndex: Number(process.env.ARCHIVE_RECEIVER_INDEX) } : {}) });
  if (!value.success || !process.env.ARCHIVE_READER_RPC_URL || !process.env.ARCHIVE_CHAIN_RPC_URL) return fail("NOT_CONFIGURED");
  const rpc = (prefix: string): ArchiveRpc => ({ url: process.env[`${prefix}_RPC_URL`]!, user: process.env[`${prefix}_RPC_USER`], password: process.env[`${prefix}_RPC_PASSWORD`] });
  const result = { ...value.data, reader: rpc("ARCHIVE_READER"), chain: rpc("ARCHIVE_CHAIN"), ...(process.env.ARCHIVE_WRITER_RPC_URL ? { writer: rpc("ARCHIVE_WRITER") } : {}) };
  validateArchiveConfig(result);
  return result;
}

export function validateArchiveConfig(config: ArchiveChainConfig) {
  configSchema.parse(config);
  if (!archiveReaderIdentityValid(config)) fail(config.pool === "ironwood" ? "IRONWOOD_READER_REQUIRED" : "SAPLING_READER_REQUIRED");
  if (config.writer?.url === config.reader.url) fail("INDEPENDENT_READER_REQUIRED");
  if (config.network === "mainnet" && config.requiredConfirmations < 10) fail("CONFIRMATION_POLICY_REQUIRED");
}

/** Explicit operator configuration only. Wallet HTTP must travel over a loopback tunnel. */
export function createArchiveRpc(fetcher: typeof fetch = fetch) {
  return async (target: ArchiveRpc, method: string, params: unknown[], chainOnly = false): Promise<unknown> => {
    const url = new URL(target.url);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    const privateNode = /^192\.168\.\d+\.\d+$/.test(url.hostname) || /^10\.\d+\.\d+\.\d+$/.test(url.hostname) || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(url.hostname);
    if (url.username || url.password || url.hash || url.search || !(url.protocol === "https:" || url.protocol === "http:" && (loopback || chainOnly && privateNode))) return fail("UNSAFE_RPC_CONFIGURATION");
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (target.user) headers.authorization = `Basic ${Buffer.from(`${target.user}:${target.password ?? ""}`).toString("base64")}`;
      const response = await fetcher(target.url, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: "archive-v1", method, params }), signal: controller.signal, redirect: "error", cache: "no-store" });
      if (!response.ok || !response.body || Number(response.headers.get("content-length")) > 4 * 1024 * 1024) return fail("RPC_UNAVAILABLE");
      const reader = response.body.getReader(); let length = 0; const chunks: Uint8Array[] = [];
      try {
        for (;;) { const chunk = await reader.read(); if (chunk.done) break; length += chunk.value.length; if (length > 4 * 1024 * 1024) return fail("RPC_RESPONSE_TOO_LARGE"); chunks.push(chunk.value); }
      } finally { void reader.cancel().catch(() => undefined); }
      const bytes = Buffer.concat(chunks);
      const json = JSON.parse(bytes.toString("utf8"));
      if (json.id !== "archive-v1" || json.error || !Object.hasOwn(json, "result")) return fail("RPC_REJECTED");
      return json.result;
    } catch (error) { if (error instanceof ArchiveChainError) throw error; return fail("RPC_UNAVAILABLE"); }
    finally { clearTimeout(timer); controller.abort(); }
  };
}

export type ArchiveChainEvidence = {
  version: "ZVOICE_CHAIN_CHECK_V1"; network: ArchiveNetwork; txid: string; pool: ArchivePool; outputIndex: number;
  receiver: string; receiverIndex?: number; memo: string; blockHash: string; blockHeight: number; blockTime: string;
  confirmations: number; requiredConfirmations: number; tipHash: string; tipHeight: number; checkedAt: string;
  readerVersion: string; publicViewingKey: string; birthdayHeight: number;
};

export function createArchiveObserver(fetcher: typeof fetch = fetch) {
  const rpc = createArchiveRpc(fetcher);
  return async (config: ArchiveChainConfig, txid: string, expectedMemo: string): Promise<ArchiveChainEvidence> => {
    validateArchiveConfig(config); hash.parse(txid);
    const pool = config.pool ?? "sapling";
    const discovery = discoverySchema.parse(await rpc(config.reader, "rpc.discover", []));
    const keyMethods = pool === "sapling" ? ["z_importviewingkey"] : ["z_exportviewingkey", "z_listaccounts", "z_listunifiedreceivers", "z_getaddressforaccount"];
    if (discovery.info.version !== config.walletVersion || ![...keyMethods, "getwalletstatus", "z_viewtransaction"].every(method => discovery.methods.some(item => item.name === method))) return fail("READER_VERSION_UNSUPPORTED");
    const info = chainSchema.parse(await rpc(config.chain, "getblockchaininfo", [], true));
    if (info.chain !== (config.network === "testnet" ? "test" : "main")) return fail("WRONG_NETWORK");
    if (info.headers !== info.blocks || info.verificationprogress < 0.9999 || info.initialblockdownload === true || info.initial_block_download_complete === false || (info.estimatedheight ?? info.blocks) > info.blocks + 2) return fail("NODE_SYNCING");
    let ironwoodAccount: string | undefined;
    if (pool === "ironwood") {
      // Zallet beta.3 z_importviewingkey accepts only Sapling extended keys.
      // A separately provisioned UFVK-only account is required. Ironwood uses
      // Orchard keys/receivers, but must be matched as an Ironwood action below.
      const receivers = z.object({ orchard: z.string(), sapling: z.string().optional(), p2pkh: z.string().optional(), p2sh: z.string().optional() }).strict()
        .parse(await rpc(config.reader, "z_listunifiedreceivers", [config.receiver]));
      if (receivers.orchard !== config.receiver || receivers.sapling !== undefined || receivers.p2pkh !== undefined || receivers.p2sh !== undefined) return fail("IRONWOOD_READER_REQUIRED");
      const accounts = z.array(z.object({ account_uuid: z.string().uuid(), seedfp: z.string().optional(), zip32_account_index: z.number().optional(), account: z.number().optional(),
        addresses: z.array(z.object({ ua: z.string().optional(), diversifier_index: z.number().optional() })).max(1000) })).max(100)
        .parse(await rpc(config.reader, "z_listaccounts", [true]));
      if (accounts.some(account => account.seedfp !== undefined || account.zip32_account_index !== undefined || account.account !== undefined)) return fail("INDEPENDENT_READER_REQUIRED");
      const matches = accounts.filter(account => account.addresses.some(address => address.ua === config.receiver && address.diversifier_index === config.receiverIndex));
      if (matches.length !== 1) return fail("READER_KEY_MISMATCH");
      if (await rpc(config.reader, "z_exportviewingkey", [config.receiver, false]) !== config.publicViewingKey) return fail("READER_KEY_MISMATCH");
      const derived = z.object({ address: z.string(), diversifier_index: z.number() }).parse(await rpc(config.reader, "z_getaddressforaccount", [matches[0].account_uuid, ["orchard"], config.receiverIndex]));
      if (derived.address !== config.receiver || derived.diversifier_index !== config.receiverIndex) return fail("READER_KEY_MISMATCH");
      ironwoodAccount = matches[0].account_uuid;
    } else {
      // beta.3 retains an imported Sapling key's diversifiable form and cannot
      // re-export its extended full viewing key. Import the operator-pinned public
      // key instead: this is idempotent for a view-only account, rejects a known
      // spending account, and derives the recipient independently. A diversified
      // recipient must be derived through the same imported key below.
      // A fresh reader must decode this transaction. Historical balance recovery is
      // separate: a positive memo/inclusion proof makes no claim about other notes.
      const imported = importedReaderSchema.parse(await rpc(config.reader, "z_importviewingkey", [config.publicViewingKey, "whenkeyisnew", config.birthdayHeight]));
      if (config.receiverIndex !== undefined) {
        // Bind the imported key's default address to its reader account first, then
        // independently derive the exact published diversified receiver. Ownership
        // elsewhere in the wallet is insufficient evidence of this key binding.
        const accounts = z.array(z.object({ account_uuid: z.string().uuid(), addresses: z.array(z.object({ ua: z.string(), diversifier_index: z.number().optional() })).max(1000) })).max(100).parse(await rpc(config.reader, "z_listaccounts", [true]));
        const matches: string[] = [];
        for (const account of accounts) {
          const zero = account.addresses.find(address => address.diversifier_index === 0);
          if (!zero) continue;
          const receivers = z.object({ sapling: z.string().optional() }).parse(await rpc(config.reader, "z_listunifiedreceivers", [zero.ua]));
          if (receivers.sapling === imported.address) matches.push(account.account_uuid);
        }
        if (matches.length !== 1) return fail("READER_KEY_MISMATCH");
        const derived = z.object({ address: z.string(), diversifier_index: z.number() }).parse(await rpc(config.reader, "z_getaddressforaccount", [matches[0], ["sapling"], config.receiverIndex]));
        const receiver = z.object({ sapling: z.string() }).parse(await rpc(config.reader, "z_listunifiedreceivers", [derived.address]));
        if (derived.diversifier_index !== config.receiverIndex || receiver.sapling !== config.receiver) return fail("READER_KEY_MISMATCH");
      } else if (imported.address !== config.receiver) return fail("READER_KEY_MISMATCH");
    }
    const sync = syncSchema.parse(await rpc(config.reader, "getwalletstatus", []));
    if (!sync.wallet_tip || sync.wallet_tip.height > info.blocks) return fail("READER_SYNCING");
    const tip = blockSchema.parse(await rpc(config.chain, "getblock", [info.bestblockhash, 1], true));
    if (tip.hash !== info.bestblockhash || tip.height !== info.blocks || Date.now() - tip.time * 1000 > 20 * 60_000 || tip.time * 1000 - Date.now() > 120_000) return fail("STALE_CHAIN");
    const transaction = transactionSchema.parse(await rpc(config.reader, "z_viewtransaction", [txid]));
    if (transaction.txid !== txid) return fail("INCLUSION_MISMATCH");
    let transactionBlockHash = transaction.blockhash;
    if (transaction.status !== "mined" || !transactionBlockHash) {
      // Wallet status can remain expired during scan/backfill even when the
      // transaction is mined. Only positive node inclusion can override it;
      // missing node evidence is retryable and never proof of expiration.
      let raw: unknown;
      try { raw = await rpc(config.chain, "getrawtransaction", [txid, 1], true); }
      catch (error) {
        if (error instanceof ArchiveChainError && ["RPC_REJECTED", "RPC_UNAVAILABLE"].includes(error.code)) return fail("READER_SYNCING");
        throw error;
      }
      const nodeTransaction = nodeTransactionSchema.safeParse(raw);
      if (!nodeTransaction.success || !nodeTransaction.data.blockhash || (nodeTransaction.data.confirmations ?? 0) < 1) return fail("READER_SYNCING");
      if (nodeTransaction.data.txid !== txid) return fail("INCLUSION_MISMATCH");
      transactionBlockHash = nodeTransaction.data.blockhash;
    }
    const block = blockSchema.parse(await rpc(config.chain, "getblock", [transactionBlockHash, 1], true));
    if (block.hash !== transactionBlockHash || !block.tx.includes(txid) || block.height > info.blocks || block.height < config.birthdayHeight) return fail("INCLUSION_MISMATCH");
    // getwalletstatus.locked guards balances/spends, including pre-birthday
    // subtree backfill. For a known transaction, require its decoded output and
    // a reader tip on the node's canonical branch covering that block instead.
    // No absence, balance, or spending decision may reuse this positive check.
    if (sync.wallet_tip.height < block.height) return fail("READER_SYNCING");
    if (await rpc(config.chain, "getblockhash", [sync.wallet_tip.height], true) !== sync.wallet_tip.blockhash) return fail("READER_CHAIN_MISMATCH");
    if (await rpc(config.chain, "getblockhash", [block.height], true) !== block.hash) return fail("ORPHANED");
    const memoHex = Buffer.concat([Buffer.from(expectedMemo), Buffer.alloc(512 - Buffer.byteLength(expectedMemo))]).toString("hex");
    const matches = transaction.outputs.filter(output => output.pool === pool && output.address === config.receiver && output.memo?.toLowerCase() === memoHex
      && (pool === "sapling" ? output.output != null : output.action != null && output.output === undefined && output.account_uuid === ironwoodAccount && output.outgoing === false && output.walletInternal === false && output.valueZat === 1));
    if (matches.length !== 1) return fail(matches.length > 1 ? "AMBIGUOUS_MEMO" : "MEMO_MISMATCH");
    const confirmations = info.blocks - block.height + 1;
    if (block.confirmations !== confirmations || tip.confirmations !== 1 || block.time > tip.time + 120) return fail("INCLUSION_MISMATCH");
    const end = chainSchema.parse(await rpc(config.chain, "getblockchaininfo", [], true));
    if (end.chain !== info.chain || end.bestblockhash !== info.bestblockhash || await rpc(config.chain, "getblockhash", [block.height], true) !== block.hash) return fail("CHAIN_CHANGED");
    return { version: "ZVOICE_CHAIN_CHECK_V1", network: config.network, txid, pool, outputIndex: (pool === "sapling" ? matches[0].output : matches[0].action)!, receiver: config.receiver, memo: expectedMemo,
      blockHash: block.hash, blockHeight: block.height, blockTime: new Date(block.time * 1000).toISOString(), confirmations, requiredConfirmations: config.requiredConfirmations,
      tipHash: info.bestblockhash, tipHeight: info.blocks, checkedAt: new Date().toISOString(), readerVersion: config.walletVersion, publicViewingKey: config.publicViewingKey, birthdayHeight: config.birthdayHeight,
      ...(config.receiverIndex !== undefined ? { receiverIndex: config.receiverIndex } : {}) };
  };
}
