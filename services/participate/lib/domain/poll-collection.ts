export const COLLECTION_SOURCE_VERSION = "zallet-0.1.0-beta.3/history-v1";
export const COLLECTION_LEASE_MS = 60_000;

export const collectionReasons = {
  NOT_CONFIGURED: "Connect the voting collector and its validating node to check history.",
  SOURCE_UNAVAILABLE: "The collector could not be verified. Try again shortly.",
  SOURCE_UNSUPPORTED: "The collector version needs a compatibility review.",
  WALLET_SYNCING: "The wallet is still scanning the blockchain. Check again after it catches up.",
  WRONG_NETWORK: "The wallet and node must use the configured voting network.",
  CHAIN_CHANGED: "The chain changed during the check. Run a new check.",
  STALE_CHAIN: "The node has not reached a recent block. Check its connection.",
  ADDRESS_MISMATCH: "Some ballot addresses could not be verified in this collector account.",
  HISTORY_LIMIT: "History exceeds this check's limit. Collection needs a larger scan before finalization.",
  INVALID_EVIDENCE: "Wallet history and chain evidence did not agree.",
  CHECK_INTERRUPTED: "The check was interrupted. Run it again.",
  PROPOSAL_CHANGED: "The voting records changed during this check. Run it again."
} as const;
export type CollectionReason = keyof typeof collectionReasons;

export type CollectionCheckView = {
  id: string;
  status: "RUNNING" | "OBSERVED" | "BLOCKED";
  reason: CollectionReason | null;
  startedAt: string;
  finishedAt: string | null;
  leaseExpiresAt: string;
  network: string | null;
  tipHeight: number | null;
  scannedHeight: number | null;
  transactionCount: number | null;
  outputCount: number | null;
  evidenceHash: string | null;
};

export type CollectionCheckHistory = {
  canCheck: boolean;
  checks: CollectionCheckView[];
  // A historical wallet snapshot is never authorization to finalize or execute.
  finalization: "POLICY_AND_CUTOFF_REQUIRED";
};

export type CollectionRequest = { id: string; address: string };
export type CollectionOutput = {
  requestId: string;
  txid: string;
  pool: "sapling" | "orchard";
  outputIndex: number;
  amountZat: string;
  memo: string | null;
  blockHeight: number;
  blockHash: string;
  blockTime: string;
  confirmations: number;
};
export type CollectionSnapshot = {
  kind: "WALLET_HISTORY_ONLY";
  sourceVersion: typeof COLLECTION_SOURCE_VERSION;
  sourceFingerprint: string;
  network: "mainnet" | "testnet" | "regtest";
  startHeight: 0;
  tipHeight: number;
  tipHash: string;
  scannedHeight: number;
  transactionCount: number;
  outputs: CollectionOutput[];
};

export class CollectionObserverError extends Error {
  constructor(readonly code: CollectionReason) { super(collectionReasons[code]); }
}
