import { describe, expect, it } from "vitest";
import { formatProposalUsd, MAX_PROPOSAL_USD_CENTS, parseProposalUsdCents, proposalUsdDecimal } from "@/lib/domain/proposal-funding";

describe("USD proposal budgets", () => {
  it.each([["0.01", 1n], ["1200", 120000n], ["1200.5", 120050n], ["1200.51", 120051n], ["92233720368547758.07", MAX_PROPOSAL_USD_CENTS]] as const)("stores %s as exact cents", (input, cents) => {
    expect(parseProposalUsdCents(input)).toBe(cents);
    expect(parseProposalUsdCents(proposalUsdDecimal(cents))).toBe(cents);
  });
  it.each(["", "0", "0.00", "-1", "1e3", "1,200.00", "1.234", "NaN", "Infinity", "01", " 1", "1 ", "92233720368547758.08"])("rejects ambiguous, fractional-cent or overflowing amounts: %s", value => {
    expect(() => parseProposalUsdCents(value)).toThrow();
  });
  it("formats large amounts without floating-point rounding", () => {
    expect(formatProposalUsd("120051")).toBe("$1,200.51 USD");
    expect(formatProposalUsd(MAX_PROPOSAL_USD_CENTS)).toBe("$92,233,720,368,547,758.07 USD");
  });
});
