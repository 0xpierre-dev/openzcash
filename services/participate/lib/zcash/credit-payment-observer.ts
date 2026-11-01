import { z } from "zod";
import { CreditPurchaseError, type CreditPaymentCandidate, type CreditPaymentObserver, type CreditReceiverConfig, type CreditRpcConfig } from "@/lib/domain/credit-purchases";

const hash = z.string().regex(/^[a-fA-F0-9]{64}$/).transform(value => value.toLowerCase());
const height = z.number().int().min(0).max(2_147_483_647);
const tipSchema = z.object({ height, blockhash: hash });
const chainSchema = z.object({
  chain: z.enum(["main", "test", "regtest"]), blocks: height, headers: height, bestblockhash: hash,
  verificationprogress: z.number().min(0).max(1), estimatedheight: height,
  initial_block_download_complete: z.boolean().optional(), initialblockdownload: z.boolean().optional()
});
const walletSchema = z.object({ node_tip: tipSchema, wallet_tip: tipSchema, fully_synced_height: height, locked: z.boolean() });
const accountSchema = z.object({ account_uuid: z.string().uuid(), addresses: z.array(z.object({ ua: z.string().max(512).optional() })).max(10_000) });
const receiversSchema = z.object({ sapling: z.string().max(512).optional(), orchard: z.string().max(512).optional(), p2pkh: z.string().max(512).optional(), p2sh: z.string().max(512).optional() });
const outputSchema = z.object({
  pool: z.enum(["transparent", "sapling", "orchard", "ironwood"]), output: height.optional(), action: height.optional(),
  account_uuid: z.string().uuid().optional(), outgoing: z.boolean().nullable().optional(), walletInternal: z.boolean(),
  address: z.string().max(512).optional(), valueZat: z.number().int().safe().min(0).max(2_100_000_000_000_000),
  memo: z.string().length(1024).regex(/^[a-fA-F0-9]+$/).optional(), memoStr: z.string().max(512).optional()
});
const transactionSchema = z.object({ txid: hash, status: z.enum(["mined", "waiting", "expiringsoon", "expired"]),
  confirmations: z.number().int().min(-1).max(2_147_483_647), blockhash: hash.optional(),
  outputs: z.array(outputSchema).max(10_000) });
const historySchema = z.array(z.object({ account_uuid: z.string().uuid(), txid: hash,
  outputs: z.array(z.object({ to_account: z.string().uuid().nullable(), memo: z.string().nullable() })).max(10_000) })).max(1000);
const blockSchema = z.object({ hash, height, confirmations: z.number().int().min(-1).max(2_147_483_647),
  time: z.number().int().min(0).max(253_402_300_799), tx: z.array(hash).max(30_000) });
const discoverySchema = z.object({ info: z.object({ title: z.literal("Zallet"), version: z.literal("0.1.0-beta.3") }),
  methods: z.array(z.object({ name: z.string() })).max(1000) });
const requiredMethods = ["getwalletstatus", "z_getaccount", "z_listunifiedreceivers", "z_listtransactions", "z_viewtransaction"];
const MAX_RPC_BYTES = 4 * 1024 * 1024;
const MAX_TIP_AGE_MS = 20 * 60 * 1000;
const networkNames = { mainnet: "main", testnet: "test", regtest: "regtest" } as const;

class RpcFailure extends Error { constructor(readonly code: number) { super("Read-only RPC request failed"); } }
function unavailable(): never { throw new CreditPurchaseError("The DAO receiving wallet could not be verified. Please try again later", 503, "CREDIT_RECEIVER_UNAVAILABLE"); }

function decodeMemo(hex: string): string | null {
  const bytes = Buffer.from(hex, "hex");
  // ZIP 302: 0xF6 is empty, 0xFF arbitrary, other 0xF5..0xFE reserved.
  if (bytes[0] > 0xf4) return null;
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, end)); }
  catch { return unavailable(); }
}

/** Test dependency injection; production always uses the real fetch implementation. */
export function createCreditPaymentObserver(fetcher: typeof fetch = fetch): CreditPaymentObserver {
  function session() {
    const deadline = performance.now() + 30_000;
    let calls = 0;
    return async function rpc(config: CreditRpcConfig, method: string, params: unknown[]): Promise<unknown> {
      const remaining = deadline - performance.now();
      if (++calls > 64 || remaining <= 0) return unavailable();
      const url = new URL(config.url);
      if (url.username || url.password || url.hash || url.search || (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))) return unavailable();
      const controller = new AbortController();
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const requestId = calls;
      try {
        const timeout = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error("Read-only RPC timeout")); }, Math.min(6000, remaining));
        });
        return await Promise.race([timeout, (async () => {
          const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
          if (config.user) headers.authorization = `Basic ${Buffer.from(`${config.user}:${config.password ?? ""}`).toString("base64")}`;
          const response = await fetcher(config.url, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }), signal: controller.signal, redirect: "error", cache: "no-store" });
          if (!response.body || Number(response.headers.get("content-length")) > MAX_RPC_BYTES) return unavailable();
          reader = response.body.getReader();
          const bytes = new Uint8Array(MAX_RPC_BYTES);
          let length = 0;
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            if (chunk.value.length > MAX_RPC_BYTES - length) return unavailable();
            bytes.set(chunk.value, length); length += chunk.value.length;
          }
          const envelope = z.object({ id: z.number(), result: z.unknown().optional(), error: z.object({ code: z.number().int() }).nullable().optional() })
            .parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length))));
          if (envelope.id !== requestId) return unavailable();
          if (envelope.error) throw new RpcFailure(envelope.error.code);
          if (!response.ok || !Object.hasOwn(envelope, "result")) return unavailable();
          return envelope.result;
        })()]);
      } finally {
        clearTimeout(timer); controller.abort();
        if (reader) void reader.cancel().catch(() => undefined);
      }
    };
  }

  async function checkpoint(receiver: CreditReceiverConfig, rpc: ReturnType<typeof session>) {
    const chain = chainSchema.parse(await rpc(receiver.chainRpc, "getblockchaininfo", []));
    const wallet = walletSchema.parse(await rpc(receiver.walletRpc, "getwalletstatus", []));
    if (chain.chain !== networkNames[receiver.network] || chain.blocks < 1 || chain.headers !== chain.blocks
      || chain.verificationprogress < 0.9999 || chain.estimatedheight > chain.blocks + 2
      || chain.initial_block_download_complete === false || chain.initialblockdownload === true
      || wallet.locked || wallet.fully_synced_height !== chain.blocks
      || wallet.wallet_tip.height !== chain.blocks || wallet.wallet_tip.blockhash !== chain.bestblockhash
      || wallet.node_tip.height !== chain.blocks || wallet.node_tip.blockhash !== chain.bestblockhash) return unavailable();
    return { height: chain.blocks, hash: chain.bestblockhash, scannedHeight: wallet.fully_synced_height };
  }

  async function ready(receiver: CreditReceiverConfig, rpc: ReturnType<typeof session>) {
    const discovery = discoverySchema.parse(await rpc(receiver.walletRpc, "rpc.discover", []));
    if (!requiredMethods.every(method => discovery.methods.some(entry => entry.name === method))) return unavailable();
    const tip = await checkpoint(receiver, rpc);
    const account = accountSchema.parse(await rpc(receiver.walletRpc, "z_getaccount", [receiver.accountId]));
    if (account.account_uuid !== receiver.accountId || !account.addresses.some(entry => entry.ua === receiver.address)) return unavailable();
    const receivers = receiversSchema.parse(await rpc(receiver.walletRpc, "z_listunifiedreceivers", [receiver.address]));
    if ((!receivers.sapling && !receivers.orchard) || receivers.p2pkh !== undefined || receivers.p2sh !== undefined) return unavailable();
    if (hash.parse(await rpc(receiver.chainRpc, "getblockhash", [tip.height])) !== tip.hash) return unavailable();
    const tipBlock = blockSchema.parse(await rpc(receiver.chainRpc, "getblock", [tip.hash, 1]));
    if (tipBlock.hash !== tip.hash || tipBlock.height !== tip.height || tipBlock.confirmations !== 1) return unavailable();
    assertFreshTip(receiver, tipBlock.time);
    return { tip, tipTime: tipBlock.time, addresses: new Set([receiver.address, receivers.sapling, receivers.orchard].filter((address): address is string => Boolean(address))) };
  }

  function assertFreshTip(receiver: CreditReceiverConfig, tipTime: number) {
    if (receiver.network === "regtest") return;
    const age = Date.now() - tipTime * 1000;
    if (age > MAX_TIP_AGE_MS || age < -120_000) return unavailable();
  }

  async function guarded<T>(action: () => Promise<T>): Promise<T> {
    try { return await action(); } catch { return unavailable(); }
  }

  return {
    preflight: receiver => guarded(async () => {
      const rpc = session(); const { tip, tipTime } = await ready(receiver, rpc);
      const end = await checkpoint(receiver, rpc);
      if (end.height !== tip.height || end.hash !== tip.hash) return unavailable();
      assertFreshTip(receiver, tipTime);
      return { height: tip.height };
    }),
    observe: (receiver, request) => guarded(async () => {
      const startHeight = height.parse(request.startHeight);
      if (!request.memo || Buffer.byteLength(request.memo, "utf8") > 512 || request.memo.includes("\0")) return unavailable();
      if (request.knownTxid) hash.parse(request.knownTxid);
      const rpc = session(); const { tip, tipTime, addresses } = await ready(receiver, rpc);
      const txids = new Set<string>();
      // Each listing RPC has its own SQLite snapshot. OFFSET pages can omit
      // unmined rows that change between calls even if the chain tip is stable.
      const rows = historySchema.parse(await rpc(receiver.walletRpc, "z_listtransactions", [receiver.accountId, startHeight, null, 0, 1000]));
      if (rows.length >= 1000) return unavailable();
      for (const row of rows) {
        if (row.account_uuid !== receiver.accountId) return unavailable();
        if (row.outputs.some(output => output.to_account === receiver.accountId && output.memo === request.memo)) txids.add(row.txid);
      }
      if (request.knownTxid) txids.add(request.knownTxid.toLowerCase());
      const candidates: CreditPaymentCandidate[] = [];
      for (const txid of txids) {
        let result: unknown;
        try { result = await rpc(receiver.walletRpc, "z_viewtransaction", [txid]); }
        catch (error) {
          // A verified, fully scanned wallet can explicitly report a known tx absent.
          if (request.knownTxid?.toLowerCase() === txid && error instanceof RpcFailure && error.code === -5) continue;
          throw error;
        }
        const transaction = transactionSchema.parse(result);
        if (transaction.txid !== txid) return unavailable();
        let blockHeight: number | null = null, blockHash: string | null = null, blockTime: string | null = null, confirmations = 0, canonical = false;
        if (transaction.blockhash) {
          let blockResult: unknown;
          try { blockResult = await rpc(receiver.chainRpc, "getblock", [transaction.blockhash, 1]); }
          catch (error) { if (!(error instanceof RpcFailure && error.code === -5)) throw error; }
          if (blockResult !== undefined) {
            const block = blockSchema.parse(blockResult);
            if (block.hash !== transaction.blockhash) return unavailable();
            blockHeight = block.height; blockHash = block.hash; blockTime = new Date(block.time * 1000).toISOString();
            if (block.height <= tip.height) {
              const canonicalHash = hash.parse(await rpc(receiver.chainRpc, "getblockhash", [block.height]));
              const count = tip.height - block.height + 1;
              canonical = canonicalHash === block.hash && block.tx.includes(txid) && transaction.status === "mined"
                && transaction.confirmations === count && block.confirmations === count;
              if (canonical) confirmations = count;
            }
          }
        }
        const identities = new Set<string>();
        for (const output of transaction.outputs) {
          if ((output.pool !== "sapling" && output.pool !== "orchard") || output.outgoing !== false || output.walletInternal || output.account_uuid !== receiver.accountId) continue;
          if (!output.address || !addresses.has(output.address) || !output.memo) continue;
          const memo = decodeMemo(output.memo);
          if (output.memoStr !== undefined && memo !== null && output.memoStr !== memo) return unavailable();
          if (memo !== request.memo) continue;
          const outputIndex = output.pool === "sapling" ? output.output : output.action;
          if (outputIndex === undefined || outputIndex > 65535) return unavailable();
          const identity = `${output.pool}:${outputIndex}`;
          if (identities.has(identity)) return unavailable();
          identities.add(identity);
          candidates.push({ txid, pool: output.pool, outputIndex, accountId: receiver.accountId, amountZat: String(output.valueZat), memo,
            blockHeight, blockHash, blockTime, confirmations, canonical });
        }
      }
      const end = await checkpoint(receiver, rpc);
      if (end.height !== tip.height || end.hash !== tip.hash) return unavailable();
      assertFreshTip(receiver, tipTime);
      return { network: receiver.network, tipHeight: tip.height, tipHash: tip.hash, scannedHeight: end.scannedHeight, candidates };
    })
  };
}

export function getCreditPaymentObserver(): CreditPaymentObserver { return createCreditPaymentObserver(); }
