import { z } from "zod/v3";
import { assertFreshFundingQuote, fundingQuoteExpiresAt, MAX_RATE_USD_E8 } from "@/lib/participate/workspace/domain/funding-quote";

const priceSchema = z.object({
  rateUsdPerZecE8: z.string().regex(/^[1-9]\d{0,15}$/),
  quotedAt: z.string().datetime(),
  retrievedAt: z.string().datetime(),
  expiresAt: z.string().datetime()
}).strict();

/** Public market data only; never a payment quote, balance or settlement record. */
export type PublicZecPrice = z.infer<typeof priceSchema>;

export function readFreshZecPrice(input: unknown, now = new Date()): PublicZecPrice {
  const price = priceSchema.parse(input);
  const quotedAt = new Date(price.quotedAt);
  const retrievedAt = new Date(price.retrievedAt);
  assertFreshFundingQuote(quotedAt, now);
  if (BigInt(price.rateUsdPerZecE8) > MAX_RATE_USD_E8 || +retrievedAt < +quotedAt || +retrievedAt > +now ||
    price.expiresAt !== fundingQuoteExpiresAt(quotedAt).toISOString()) {
    throw new Error("A current ZEC price is unavailable");
  }
  return price;
}

/** Two decimals for a compact estimate, rounded from exact zatoshis. */
export function formatEstimatedZec(amountZat: bigint): string {
  if (amountZat < 0n) throw new Error("Invalid ZEC estimate");
  if (amountZat > 0n && amountZat < 1_000_000n) return "<0.01";
  const hundredths = (amountZat + 500_000n) / 1_000_000n;
  return `${(hundredths / 100n).toLocaleString("en-US")}.${(hundredths % 100n).toString().padStart(2, "0")}`;
}
