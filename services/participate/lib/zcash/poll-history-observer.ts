import { createHash } from "node:crypto";
import { z } from "zod";
import { COLLECTION_SOURCE_VERSION, CollectionObserverError, type CollectionReason, type CollectionOutput, type CollectionRequest, type CollectionSnapshot } from "@/lib/domain/poll-collection";

const hash = z.string().regex(/^[a-fA-F0-9]{64}$/).transform(value => value.toLowerCase());
const height = z.number().int().min(0).max(2_147_483_646);
const address = z.string().min(1).max(512);
const tipSchema = z.object({ height, blockhash: hash });
const chainSchema = z.object({ chain: z.enum(["main", "test", "regtest"]), blocks: height, headers: height, bestblockhash: hash,
  verificationprogress: z.number().min(0).max(1), estimatedheight: height,
  initial_block_download_complete: z.boolean().optional(), initialblockdownload: z.boolean().optional() });
const walletSchema = z.object({ node_tip: tipSchema, wallet_tip: tipSchema, fully_synced_height: height, locked: z.boolean(), sync_work_remaining: z.unknown().optional() });
const blockSchema = z.object({ hash, height, confirmations: z.number().int(), time: z.number().int().min(0).max(253_402_300_799), tx: z.array(hash).max(30_000) });
const accountSchema = z.object({ account_uuid: z.string().uuid(), addresses: z.array(z.object({ ua: address.optional(), sapling: address.optional() })).max(20_000) });
const receiversSchema = z.object({ sapling: address.optional(), orchard: address.optional() });
const pool = z.enum(["transparent", "sapling", "orchard", "ironwood"]);
const amount = z.number().int().safe().min(0).max(2_100_000_000_000_000);
const historySchema = z.array(z.object({ account_uuid: z.string().uuid(), txid: hash, mined_height: height,
  outputs: z.array(z.object({ pool, output_index: height, to_account: z.string().uuid().nullable(),
    to_address: address.nullable(), value: amount, is_change: z.boolean(), memo: z.string().max(1024).nullable() })).max(10_000)
})).max(1000);
const transactionSchema = z.object({ txid: hash, status: z.literal("mined"), confirmations: z.number().int().positive(), blockhash: hash,
  outputs: z.array(z.object({ pool, output: height.optional(), action: height.optional(), account_uuid: z.string().uuid().optional(),
    outgoing: z.boolean().nullable().optional(), walletInternal: z.boolean(), address: address.optional(), valueZat: amount,
    memo: z.string().length(1024).regex(/^[a-fA-F0-9]+$/).optional(), memoStr: z.string().max(512).optional() })).max(10_000) });
const requiredMethods = ["getwalletstatus", "z_getaccount", "z_listunifiedreceivers", "z_listtransactions", "z_viewtransaction"];
const discoverySchema = z.object({ info: z.object({ title: z.literal("Zallet"), version: z.literal("0.1.0-beta.3") }), methods: z.array(z.object({ name: z.string() })).max(1000) });
const networkNames = { mainnet: "main", testnet: "test", regtest: "regtest" } as const;
const MAX_BYTES = 4 * 1024 * 1024;

type RpcConfig = { url: string; user?: string; password?: string };
export type PollHistoryConfig = { network: keyof typeof networkNames; accountId: string; wallet: RpcConfig; chain: RpcConfig };
const fail = (code: CollectionReason): never => { throw new CollectionObserverError(code); };

export function readPollHistoryConfig(): PollHistoryConfig {
  const accountId = process.env.POLL_COLLECTOR_ACCOUNT_UUID;
  const walletUrl = process.env.ZALLET_RPC_URL;
  const chainUrl = process.env.POLL_CHAIN_RPC_URL;
  const network = z.enum(["mainnet", "testnet", "regtest"]).safeParse(process.env.POLL_COLLECTOR_NETWORK);
  if (!accountId || !walletUrl || !chainUrl || !network.success || !z.string().uuid().safeParse(accountId).success) return fail("NOT_CONFIGURED");
  return { network: network.data, accountId, wallet: { url: walletUrl, user: process.env.ZALLET_RPC_USER, password: process.env.ZALLET_RPC_PASSWORD },
    chain: { url: chainUrl, user: process.env.POLL_CHAIN_RPC_USER, password: process.env.POLL_CHAIN_RPC_PASSWORD } };
}

function memoText(hex?: string): string | null {
  if (!hex) return null;
  const bytes = Buffer.from(hex, "hex");
  if (bytes[0] > 0xf4) return null;
  let end = bytes.length;
  while (end && bytes[end - 1] === 0) end--;
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, end)); }
  catch { return fail("INVALID_EVIDENCE"); }
}

/** Read-only, bounded wallet observation. It never classifies votes or changes their tally. */
export function createPollHistoryObserver(fetcher: typeof fetch = fetch) {
  return async (config: PollHistoryConfig, requests: CollectionRequest[]): Promise<CollectionSnapshot> => {
    const deadline = performance.now() + 30_000;
    let calls = 0;
    async function rpc(target: RpcConfig, method: string, params: unknown[]): Promise<unknown> {
      const remaining = deadline - performance.now();
      if (++calls > 256) return fail("HISTORY_LIMIT");
      if (remaining <= 0) return fail("SOURCE_UNAVAILABLE");
      const url = new URL(target.url);
      if (url.username || url.password || url.hash || url.search || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) return fail("SOURCE_UNAVAILABLE");
      const controller = new AbortController();
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const requestId = calls;
      try {
        return await Promise.race([
          new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new CollectionObserverError("SOURCE_UNAVAILABLE")); }, Math.min(6000, remaining)); }),
          (async () => {
            const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
            if (target.user) headers.authorization = `Basic ${Buffer.from(`${target.user}:${target.password ?? ""}`).toString("base64")}`;
            const response = await fetcher(target.url, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }), signal: controller.signal, redirect: "error", cache: "no-store" });
            if (!response.ok || !response.body || Number(response.headers.get("content-length")) > MAX_BYTES) return fail("SOURCE_UNAVAILABLE");
            reader = response.body.getReader();
            const bytes = new Uint8Array(MAX_BYTES);
            let size = 0;
            while (true) {
              const chunk = await reader.read();
              if (chunk.done) break;
              if (chunk.value.length > MAX_BYTES - size) return fail("HISTORY_LIMIT");
              bytes.set(chunk.value, size); size += chunk.value.length;
            }
            const json = z.object({ id: z.number(), error: z.unknown().optional(), result: z.unknown().optional() }).parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size))));
            if (json.id !== requestId || json.error || !Object.hasOwn(json, "result")) return fail("SOURCE_UNAVAILABLE");
            return json.result;
          })()
        ]);
      } finally { clearTimeout(timer); controller.abort(); if (reader) void reader.cancel().catch(() => undefined); }
    }

    async function checkpoint() {
      const chain = chainSchema.parse(await rpc(config.chain, "getblockchaininfo", []));
      if (chain.chain !== networkNames[config.network]) return fail("WRONG_NETWORK");
      const wallet = walletSchema.parse(await rpc(config.wallet, "getwalletstatus", []));
      if (chain.blocks < 1 || chain.headers !== chain.blocks || chain.verificationprogress < 0.9999 || chain.estimatedheight > chain.blocks + 2
        || chain.initial_block_download_complete === false || chain.initialblockdownload === true || wallet.locked || wallet.sync_work_remaining != null
        || wallet.fully_synced_height !== chain.blocks || wallet.wallet_tip.height !== chain.blocks || wallet.wallet_tip.blockhash !== chain.bestblockhash
        || wallet.node_tip.height !== chain.blocks || wallet.node_tip.blockhash !== chain.bestblockhash) return fail("WALLET_SYNCING");
      return { height: chain.blocks, hash: chain.bestblockhash, scannedHeight: wallet.fully_synced_height };
    }
    function fresh(time: number) {
      if (config.network === "regtest") return;
      const age = Date.now() - time * 1000;
      if (age > 20 * 60_000 || age < -120_000) fail("STALE_CHAIN");
    }
    try {
      if (requests.length > 128) return fail("HISTORY_LIMIT");
      const discovery = discoverySchema.safeParse(await rpc(config.wallet, "rpc.discover", []));
      if (!discovery.success || !requiredMethods.every(method => discovery.data.methods.some(entry => entry.name === method))) return fail("SOURCE_UNSUPPORTED");
      const tip = await checkpoint();
      if (hash.parse(await rpc(config.chain, "getblockhash", [tip.height])) !== tip.hash) return fail("CHAIN_CHANGED");
      const tipBlock = blockSchema.parse(await rpc(config.chain, "getblock", [tip.hash, 1]));
      if (tipBlock.hash !== tip.hash || tipBlock.height !== tip.height || tipBlock.confirmations !== 1) return fail("INVALID_EVIDENCE");
      fresh(tipBlock.time);
      const account = accountSchema.parse(await rpc(config.wallet, "z_getaccount", [config.accountId]));
      if (account.account_uuid !== config.accountId) return fail("ADDRESS_MISMATCH");
      const bindings = new Map<string, string>();
      const requestIds = new Set<string>();
      for (const request of requests) {
        if (requestIds.has(request.id)) return fail("INVALID_EVIDENCE");
        requestIds.add(request.id);
        const entry = account.addresses.find(entry => entry.ua === request.address || entry.sapling === request.address);
        if (!entry) return fail("ADDRESS_MISMATCH");
        const aliases = [request.address];
        if (entry.ua) {
          const receivers = receiversSchema.parse(await rpc(config.wallet, "z_listunifiedreceivers", [entry.ua]));
          if (!receivers.sapling && !receivers.orchard) return fail("ADDRESS_MISMATCH");
          if (receivers.sapling) aliases.push(receivers.sapling);
          if (receivers.orchard) aliases.push(receivers.orchard);
        }
        for (const alias of aliases) {
          if (bindings.has(alias) && bindings.get(alias) !== request.id) return fail("ADDRESS_MISMATCH");
          bindings.set(alias, request.id);
        }
      }
      // A single SQLite snapshot, with a fixed exclusive upper bound, includes spent
      // outputs and excludes mempool rows. Hitting the cap cannot prove coverage.
      const rows = historySchema.parse(await rpc(config.wallet, "z_listtransactions", [config.accountId, 0, tip.height + 1, 0, 1000]));
      if (rows.length >= 1000) return fail("HISTORY_LIMIT");
      const seenTransactions = new Set<string>();
      const outputs: CollectionOutput[] = [];
      for (const row of rows) {
        if (row.account_uuid !== config.accountId || row.mined_height > tip.height || seenTransactions.has(row.txid)) return fail("INVALID_EVIDENCE");
        seenTransactions.add(row.txid);
        // Received history can omit to_address. Inspect all external receiving
        // outputs so an omitted address cannot silently hide a ballot payment.
        const relevant = row.outputs.filter(output => output.to_account === config.accountId && !output.is_change);
        if (!relevant.length) continue;
        if (relevant.some(output => output.pool !== "sapling" && output.pool !== "orchard")) return fail("INVALID_EVIDENCE");
        const transaction = transactionSchema.parse(await rpc(config.wallet, "z_viewtransaction", [row.txid]));
        const block = blockSchema.parse(await rpc(config.chain, "getblock", [transaction.blockhash, 1]));
        const confirmations = tip.height - block.height + 1;
        if (transaction.txid !== row.txid || block.hash !== transaction.blockhash || block.height !== row.mined_height || !block.tx.includes(row.txid)
          || transaction.confirmations !== confirmations || block.confirmations !== confirmations) return fail("INVALID_EVIDENCE");
        if (hash.parse(await rpc(config.chain, "getblockhash", [block.height])) !== block.hash) return fail("CHAIN_CHANGED");
        const matched = new Set<string>();
        for (const output of transaction.outputs) {
          if (output.account_uuid !== config.accountId || output.walletInternal) continue;
          if (output.outgoing !== false || !output.address) return fail("INVALID_EVIDENCE");
          if (output.pool !== "sapling" && output.pool !== "orchard") return fail("INVALID_EVIDENCE");
          const index = output.pool === "sapling" ? output.output : output.action;
          if (index === undefined || index > 65535) return fail("INVALID_EVIDENCE");
          const identity = `${output.pool}:${index}`;
          if (matched.has(identity)) return fail("INVALID_EVIDENCE");
          const listed = relevant.find(entry => entry.pool === output.pool && entry.output_index === index);
          const memo = memoText(output.memo);
          if (!listed || listed.value !== output.valueZat || (listed.to_address && listed.to_address !== output.address && bindings.get(listed.to_address) !== bindings.get(output.address))
            || (memo !== null && listed.memo !== memo) || (output.memoStr !== undefined && output.memoStr !== memo)) return fail("INVALID_EVIDENCE");
          matched.add(identity);
          if (!bindings.has(output.address)) continue;
          outputs.push({ requestId: bindings.get(output.address)!, txid: row.txid, pool: output.pool, outputIndex: index,
            amountZat: String(output.valueZat), memo, blockHeight: block.height, blockHash: block.hash,
            blockTime: new Date(block.time * 1000).toISOString(), confirmations });
        }
        if (matched.size !== relevant.length) return fail("INVALID_EVIDENCE");
      }
      const end = await checkpoint();
      if (end.height !== tip.height || end.hash !== tip.hash || hash.parse(await rpc(config.chain, "getblockhash", [tip.height])) !== tip.hash) return fail("CHAIN_CHANGED");
      fresh(tipBlock.time);
      outputs.sort((a, b) => a.txid.localeCompare(b.txid) || a.pool.localeCompare(b.pool) || a.outputIndex - b.outputIndex);
      return { kind: "WALLET_HISTORY_ONLY", sourceVersion: COLLECTION_SOURCE_VERSION,
        sourceFingerprint: createHash("sha256").update(JSON.stringify({ network: config.network, accountId: config.accountId, wallet: config.wallet.url, chain: config.chain.url })).digest("hex"),
        network: config.network, startHeight: 0, tipHeight: tip.height, tipHash: tip.hash, scannedHeight: end.scannedHeight, transactionCount: rows.length, outputs };
    } catch (error) {
      if (error instanceof CollectionObserverError) throw error;
      if (error instanceof z.ZodError) return fail("INVALID_EVIDENCE");
      return fail("SOURCE_UNAVAILABLE");
    }
  };
}

export const observePollHistory = createPollHistoryObserver();
