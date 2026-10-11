import { MAX_PROPOSAL_USD_CENTS } from "@/lib/participate/workspace/domain/proposal-funding";
import { MAX_TREASURY_AMOUNT_ZAT } from "@/lib/participate/workspace/domain/treasury";

export const FUNDING_QUOTE_TTL_MS = 5 * 60_000;
export const FUNDING_QUOTE_SOURCE = "COINGECKO";
export const FUNDING_QUOTE_SOURCE_URL = "https://www.coingecko.com/en/coins/zcash";
export const MAX_RATE_USD_E8 = 1_000_000_000_000_000n;

/** USD per ZEC, with eight decimal places. No binary floating-point arithmetic. */
export function parseUsdPerZecE8(value: string): bigint {
  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,8})?$/.test(value)) throw new Error("Invalid ZEC/USD price");
  const [whole, fraction = ""] = value.split(".");
  const rate = BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, "0"));
  if (rate <= 0n || rate > MAX_RATE_USD_E8) throw new Error("ZEC/USD price is outside the supported range");
  return rate;
}

export function formatUsdPerZec(rate: string | bigint): string {
  const value = BigInt(rate);
  const fraction = (value % 100_000_000n).toString().padStart(8, "0").replace(/0+$/, "").padEnd(2, "0");
  return `$${(value / 100_000_000n).toLocaleString("en-US")}.${fraction}`;
}

/** Round up to the next zatoshi: the estimate never understates the USD request. */
export function estimateFundingZat(usdCents: bigint, rateUsdE8: bigint): bigint {
  if (usdCents <= 0n || usdCents > MAX_PROPOSAL_USD_CENTS || rateUsdE8 <= 0n || rateUsdE8 > MAX_RATE_USD_E8) {
    throw new Error("Invalid funding amount or price");
  }
  const numerator = usdCents * 100_000_000_000_000n;
  const amount = (numerator + rateUsdE8 - 1n) / rateUsdE8;
  if (amount > MAX_TREASURY_AMOUNT_ZAT) throw new Error("The estimate exceeds the supported ZEC limit");
  return amount;
}

// A quote cannot cross UTC midnight into a different payment day.
export function fundingQuoteExpiresAt(quotedAt: Date): Date {
  if (!Number.isFinite(+quotedAt)) throw new Error("Invalid quote time");
  const nextDay = Date.UTC(quotedAt.getUTCFullYear(), quotedAt.getUTCMonth(), quotedAt.getUTCDate() + 1);
  return new Date(Math.min(+quotedAt + FUNDING_QUOTE_TTL_MS, nextDay));
}

export function assertFreshFundingQuote(quotedAt: Date, now: Date): void {
  if (!Number.isFinite(+now) || !Number.isFinite(+quotedAt) || +quotedAt > +now || +fundingQuoteExpiresAt(quotedAt) <= +now) {
    throw new Error("The price is unavailable or expired. Try again shortly.");
  }
}

export type FundingQuoteView = {
  id: string;
  kind: "ESTIMATE";
  proposalHash: string;
  usdCents: string;
  rateUsdPerZecE8: string;
  amountZat: string;
  source: "COINGECKO";
  quotedAt: string;
  retrievedAt: string;
  expiresAt: string;
  createdAt: string;
  rounding: "CEILING_ZAT";
  fees: "EXCLUDED";
};

export type FundingQuoteHistory = {
  proposalHash: string;
  usdCents: string;
  canEstimate: boolean;
  quotes: FundingQuoteView[];
};
