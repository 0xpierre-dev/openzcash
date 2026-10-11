// USD budgets are exact cents; treasury balances remain exact zatoshis.
export const MAX_PROPOSAL_USD_CENTS = 9_223_372_036_854_775_807n;
export const PROPOSAL_SETTLEMENT_RULE = "ZEC_AT_PAYMENT_DAY_RATE";
export const PROPOSAL_SETTLEMENT_LABEL = "Payable in ZEC at the payment-day rate.";

export function parseProposalUsdCents(value: string): bigint {
  if (!/^(?:0|[1-9]\d{0,16})(?:\.\d{1,2})?$/.test(value)) {
    throw new Error("Enter a positive USD amount with up to two decimal places");
  }
  const [whole, fraction = ""] = value.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents <= 0n || cents > MAX_PROPOSAL_USD_CENTS) {
    throw new Error("USD amount is outside the supported range");
  }
  return cents;
}

export function proposalUsdDecimal(cents: bigint | string): string {
  const amount = BigInt(cents);
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`;
}

export function formatProposalUsd(cents: bigint | string): string {
  const amount = BigInt(cents);
  return `$${(amount / 100n).toLocaleString("en-US")}.${(amount % 100n).toString().padStart(2, "0")} USD`;
}
