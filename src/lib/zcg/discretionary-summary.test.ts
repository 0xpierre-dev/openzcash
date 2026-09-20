import { describe, expect, it } from "vitest";
import { bountyUsd, summarizeDiscretionary } from "./discretionary-summary";

describe("summarizeDiscretionary", () => {
  it("groups paid rows by type, largest first, with human labels", () => {
    const lines = summarizeDiscretionary([
      { disbursementType: "security_bounty", amountUsdCents: 2_000_000n, isPaid: true },
      { disbursementType: "security_bounty", amountUsdCents: 1_000_000n, isPaid: true },
      { disbursementType: "reimbursement", amountUsdCents: 500_000n, isPaid: true },
      { disbursementType: "sponsorship", amountUsdCents: 9_999_999n, isPaid: false },
      { disbursementType: null, amountUsdCents: 100n, isPaid: null },
    ]);
    expect(lines.map((l) => [l.type, l.usd, l.rows])).toEqual([
      ["security_bounty", 3_000_000, 2],
      ["reimbursement", 500_000, 1],
      ["other", 100, 1],
    ]);
    expect(lines[0].label).toBe("security bounties");
    expect(bountyUsd(lines)).toBe(3_000_000);
  });
});
