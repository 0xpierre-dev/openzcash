import { describe, expect, it } from "vitest";
import { summarizeStipends } from "./stipends-summary";

describe("committee stipend summary", () => {
  it("sums each member's payments and orders by total", () => {
    const s = summarizeStipends([
      {
        recipientNameRaw: "GGuy",
        amountUsdCents: 250000n,
        paidOutDate: "2026-02-01",
      },
      {
        recipientNameRaw: "Hanh",
        amountUsdCents: 250000n,
        paidOutDate: "2026-01-01",
      },
      {
        recipientNameRaw: "GGuy",
        amountUsdCents: 250000n,
        paidOutDate: "2026-01-01",
      },
      { recipientNameRaw: "GGuy", amountUsdCents: null, paidOutDate: null },
    ]);
    expect(s.members.map((m) => m.member)).toEqual(["GGuy", "Hanh"]);
    expect(s.members[0]).toMatchObject({
      totalUsd: 500000,
      payments: 3,
      firstPaid: "2026-01-01",
      lastPaid: "2026-02-01",
    });
    expect(s.totalUsd).toBe(750000);
    expect(s.totalPayments).toBe(4);
  });

  it("groups rows without a name under Unknown and handles an empty tab", () => {
    expect(
      summarizeStipends([
        { recipientNameRaw: "", amountUsdCents: 1n, paidOutDate: "2026-03-01" },
      ]).members[0].member,
    ).toBe("Unknown");
    expect(summarizeStipends([])).toEqual({
      members: [],
      totalUsd: 0,
      totalPayments: 0,
    });
  });
});
