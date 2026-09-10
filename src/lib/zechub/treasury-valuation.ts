import type { ZecUsdQuote } from "@/lib/pricing/live-price";

type BalanceFields = {
  capturedOn: string;
  zecPriceCents: bigint | null;
  donationsZat: bigint | null;
  donationsUsdCents: bigint | null;
  fpfZat: bigint | null;
  fpfUsdCents: bigint | null;
  incZat: bigint | null;
  incUsdCents: bigint | null;
};

function value(zat: bigint | null, price: bigint): bigint | null {
  return zat == null ? null : (zat * price + 50_000_000n) / 100_000_000n;
}

/** Reprice recorded holdings only; never reprice historical payouts or USD commitments. */
export function valueTreasurySnapshot(snapshot: BalanceFields, quote: ZecUsdQuote | null) {
  const priceCents = quote ? BigInt(quote.cents) : snapshot.zecPriceCents;
  const donationsUsdCents = quote ? value(snapshot.donationsZat, BigInt(quote.cents)) : snapshot.donationsUsdCents;
  const fpfUsdCents = quote ? value(snapshot.fpfZat, BigInt(quote.cents)) : snapshot.fpfUsdCents;
  const incUsdCents = quote ? value(snapshot.incZat, BigInt(quote.cents)) : snapshot.incUsdCents;
  const amounts = [donationsUsdCents, fpfUsdCents, incUsdCents];
  // Sum the rounded fund values so the public total reconciles to its displayed rows.
  const totalUsdCents = amounts.every((v) => v != null)
    ? amounts.reduce<bigint>((sum, v) => sum + v!, 0n) : null;
  return {
    basis: quote ? "snapshot-balances-at-market-price" as const : "sheet-recorded-values" as const,
    balanceAsOf: snapshot.capturedOn,
    priceCents,
    quote,
    donationsUsdCents,
    fpfUsdCents,
    incUsdCents,
    totalUsdCents,
  };
}
