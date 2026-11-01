import { z } from "zod";
import { CreditPurchaseError, type CreditReceiverConfig, type CreditRpcConfig } from "@/lib/domain/credit-purchases";
import { preparedPilotReceiver } from "@/lib/zcash/pilot-credit-receiver";

const envReference = z.string().regex(/^[A-Z][A-Z0-9_]{0,127}$/);
const rpcSchema = z.object({ url: z.string().url().max(2048), userEnv: envReference.optional(), passwordEnv: envReference.optional() }).strict();
const receiverSchema = z.object({
  id: z.string().min(1).max(128).regex(/^[a-zA-Z0-9:_-]+$/),
  communityId: z.string().min(1).max(128),
  network: z.enum(["mainnet", "testnet", "regtest"]),
  address: z.string().min(40).max(512).regex(/^[a-z0-9]+$/),
  accountId: z.string().uuid(),
  walletRpc: rpcSchema,
  chainRpc: rpcSchema,
  credits: z.number().int().min(1).max(1_000_000),
  amountZat: z.string().regex(/^[1-9][0-9]{0,15}$/).refine(value => BigInt(value) <= 2_100_000_000_000_000n),
  requiredConfirmations: z.number().int().min(1).max(1000),
  expiresInMinutes: z.number().int().min(10).max(1440)
}).strict();

function unavailable(): never {
  // Do not expose environment contents, provider URLs or credentials to callers.
  throw new CreditPurchaseError("The DAO receiving wallet is unavailable", 503, "CREDIT_RECEIVER_UNAVAILABLE");
}

function resolveRpc(input: z.infer<typeof rpcSchema>): CreditRpcConfig {
  const url = new URL(input.url);
  if (url.username || url.password || url.hash || url.search) return unavailable();
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))) return unavailable();
  const user = input.userEnv ? process.env[input.userEnv] : undefined;
  const password = input.passwordEnv ? process.env[input.passwordEnv] : undefined;
  if ((input.userEnv && !user) || (input.passwordEnv && !password) || (password && !user)) return unavailable();
  return { url: url.toString(), ...(user ? { user } : {}), ...(password ? { password } : {}) };
}

export function getCreditReceiver(communityId: string): CreditReceiverConfig | null {
  if (process.env.CREDIT_PAYMENTS_ENABLED !== "true" || process.env.WORKSPACE_PREVIEW === "true") return null;
  const encoded = process.env.CREDIT_RECEIVERS_JSON;
  if (!encoded) return null;
  if (encoded.length > 128 * 1024) return unavailable();
  let entries: z.infer<typeof receiverSchema>[];
  try { entries = z.array(receiverSchema).max(100).parse(JSON.parse(encoded)); }
  catch { return unavailable(); }
  const ids = new Set<string>(), communities = new Set<string>(), accounts = new Set<string>();
  const receivers = entries.map(entry => {
    const prepared = preparedPilotReceiver(entry.communityId);
    if (prepared && (entry.address !== prepared.address || entry.accountId !== prepared.accountId || entry.network !== prepared.network)) return unavailable();
    const prefix = entry.network === "mainnet" ? "u1" : entry.network === "testnet" ? "utest1" : "uregtest1";
    if (!entry.address.startsWith(prefix) || (entry.network === "mainnet" && entry.requiredConfirmations < 6)) return unavailable();
    const walletRpc = resolveRpc(entry.walletRpc);
    const chainRpc = resolveRpc(entry.chainRpc);
    const account = `${entry.network}:${walletRpc.url}:${entry.accountId}`;
    if (ids.has(entry.id) || communities.has(entry.communityId) || accounts.has(account)) return unavailable();
    ids.add(entry.id); communities.add(entry.communityId); accounts.add(account);
    return { ...entry, walletRpc, chainRpc } satisfies CreditReceiverConfig;
  });
  return receivers.find(receiver => receiver.communityId === communityId) ?? null;
}

export function isCreditFundingConfigured(communityId: string): boolean {
  try { return getCreditReceiver(communityId) !== null; } catch { return false; }
}
