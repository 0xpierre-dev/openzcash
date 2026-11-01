import { z } from "zod";

export const TREASURY_KINDS = ["COMMUNITY", "SUSTAINABILITY"] as const;
export type TreasuryKindValue = (typeof TREASURY_KINDS)[number];
export const MAX_TREASURY_AMOUNT_ZAT = 2_100_000_000_000_000n;
const ZAT_PER_ZEC = 100_000_000n;

export function parseTreasuryAmountZat(amountZec: string): bigint {
  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,8})?$/.test(amountZec)) {
    throw new Error("Enter a ZEC amount with up to eight decimal places");
  }
  const [whole, fraction = ""] = amountZec.split(".");
  const amount = BigInt(whole) * ZAT_PER_ZEC + BigInt(fraction.padEnd(8, "0"));
  if (amount <= 0n || amount > MAX_TREASURY_AMOUNT_ZAT) {
    throw new Error("Enter a positive ZEC amount no greater than 21,000,000 ZEC");
  }
  return amount;
}

export function formatTreasuryZec(amountZat: string | bigint): string {
  const value = BigInt(amountZat);
  const absolute = value < 0n ? -value : value;
  const fraction = (absolute % ZAT_PER_ZEC).toString().padStart(8, "0").replace(/0+$/, "");
  return `${value < 0n ? "-" : ""}${absolute / ZAT_PER_ZEC}${fraction ? `.${fraction}` : ""}`;
}

const amountSchema = z.string().trim().max(32).refine((value) => {
  try {
    parseTreasuryAmountZat(value);
    return true;
  } catch {
    return false;
  }
}, "Enter a positive ZEC amount with up to eight decimal places");
const kindSchema = z.enum(TREASURY_KINDS);
const reasonSchema = z.string().trim().min(3).max(500);
const idempotencyKeySchema = z.string().uuid().transform((value) => value.toLowerCase());

export const treasuryFundingInputSchema = z.object({
  treasuryKind: kindSchema,
  amountZec: amountSchema,
  fundingSource: z.string().trim().min(3).max(200),
  reason: reasonSchema,
  idempotencyKey: idempotencyKeySchema
}).strict();

export const treasuryAllocationInputSchema = z.object({
  fromTreasuryKind: kindSchema,
  toTreasuryKind: kindSchema,
  amountZec: amountSchema,
  reason: reasonSchema,
  idempotencyKey: idempotencyKeySchema
}).strict().refine((value) => value.fromTreasuryKind !== value.toTreasuryKind, {
  message: "Choose different source and destination funds",
  path: ["toTreasuryKind"]
});

export type TreasuryFundingInput = z.input<typeof treasuryFundingInputSchema>;
export type TreasuryAllocationInput = z.input<typeof treasuryAllocationInputSchema>;

export type TreasuryFundView = {
  id: string | null;
  kind: TreasuryKindValue;
  name: string;
  currency: "ZEC";
  availableZat: string;
  reservedZat: string;
  committedZat: string;
  paidZat: string;
  hasEntries: boolean;
};

export type TreasuryActivityView = {
  id: string;
  kind: "FUNDING" | "ALLOCATION";
  amountZat: string;
  fromTreasuryKind: TreasuryKindValue | null;
  toTreasuryKind: TreasuryKindValue;
  fundingSource: string | null;
  reason: string;
  actorLabel: string;
  createdAt: string;
};

/** Recorded accounting; these figures do not establish wallet custody or spendability. */
export type CommunityTreasuryView = {
  communityId: string;
  currency: "ZEC";
  canManage: boolean;
  funds: TreasuryFundView[];
  recentActivity: TreasuryActivityView[];
};

export type TreasuryMutationResult = {
  treasuries: CommunityTreasuryView;
  replayed: boolean;
};
