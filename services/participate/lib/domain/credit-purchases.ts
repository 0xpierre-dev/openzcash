import { z } from "zod";

export type CreditNetwork = "mainnet" | "testnet" | "regtest";
export type CreditPurchaseStatus = "PENDING" | "CONFIRMING" | "CREDITED" | "EXPIRED" | "REVIEW";
export type CreditRpcConfig = { url: string; user?: string; password?: string };
/** Server-only configuration. Never serialize RPC endpoints or credentials. */
export type CreditReceiverConfig = {
  id: string;
  communityId: string;
  network: CreditNetwork;
  address: string;
  accountId: string;
  walletRpc: CreditRpcConfig;
  chainRpc: CreditRpcConfig;
  credits: number;
  amountZat: string;
  requiredConfirmations: number;
  expiresInMinutes: number;
};
export type CreditPaymentCandidate = {
  txid: string;
  pool: "sapling" | "orchard";
  outputIndex: number;
  accountId: string;
  amountZat: string;
  memo: string;
  blockHeight: number | null;
  blockHash: string | null;
  blockTime: string | null;
  confirmations: number;
  canonical: boolean;
};
export type CreditPaymentObservation = {
  network: CreditNetwork;
  tipHeight: number;
  tipHash: string;
  scannedHeight: number;
  candidates: CreditPaymentCandidate[];
};
export type CreditPaymentObserver = {
  preflight(receiver: CreditReceiverConfig): Promise<{ height: number }>;
  observe(receiver: CreditReceiverConfig, request: { memo: string; startHeight: number; knownTxid?: string }): Promise<CreditPaymentObservation>;
};
export type CreditPurchaseView = {
  id: string;
  communityId: string;
  network: CreditNetwork;
  credits: number;
  amountZat: string;
  amountZec: string;
  address: string;
  memo: string;
  paymentUri: string | null;
  status: CreditPurchaseStatus;
  confirmations: number;
  requiredConfirmations: number;
  expiresAt: string;
  createdAt: string;
  txid: string | null;
};
export type CreditPurchaseFundingView = {
  configured: boolean;
  preparedReceiver?: { operator: string; network: "mainnet"; state: "preparing" };
  network: CreditNetwork | null;
  package: { credits: number; amountZat: string; amountZec: string } | null;
};
export type CreditPurchasesView = { funding: CreditPurchaseFundingView; purchases: CreditPurchaseView[] };

export class CreditPurchaseError extends Error {
  constructor(message: string, public readonly status: 400 | 401 | 403 | 404 | 409 | 429 | 503, public readonly code: string) {
    super(message);
    this.name = "CreditPurchaseError";
  }
}

export const createCreditPurchaseInputSchema = z.object({
  communityId: z.string().trim().min(1).max(128),
  requestKey: z.string().min(16).max(128).regex(/^[a-zA-Z0-9:_-]+$/)
}).strict();

export function creditZatToZec(value: string | bigint): string {
  const text = String(value);
  if (!/^[0-9]+$/.test(text)) throw new CreditPurchaseError("Invalid payment amount", 400, "INVALID_PURCHASE_INPUT");
  const amount = BigInt(text);
  if (amount > 2_100_000_000_000_000n) throw new CreditPurchaseError("Invalid payment amount", 400, "INVALID_PURCHASE_INPUT");
  return `${amount / 100_000_000n}.${(amount % 100_000_000n).toString().padStart(8, "0")}`;
}
