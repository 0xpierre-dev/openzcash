import { describe, expect, it, vi } from "vitest";
import { reconcileFutureProposalDates } from "./proposal-date";

describe("reconcileFutureProposalDates", () => {
  it("uses the linked GitHub issue creation date when the sheet date is in the future", async () => {
    const fetchIssueCreatedAt = vi
      .fn<(issueNumber: number) => Promise<string | null>>()
      .mockResolvedValue("2025-12-19T14:30:00Z");

    const result = await reconcileFutureProposalDates(
      [
        {
          submittedDate: "2026-12-19",
          platformLink:
            "https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/162",
        },
      ],
      fetchIssueCreatedAt,
      Date.parse("2026-08-31T12:00:00Z"),
    );

    expect(result.rows[0].submittedDate).toBe("2025-12-19");
    expect(result.corrected).toBe(1);
    expect(fetchIssueCreatedAt).toHaveBeenCalledExactlyOnceWith(162);
  });

  it("keeps a plausible sheet date and does not call GitHub", async () => {
    const fetchIssueCreatedAt = vi
      .fn<(issueNumber: number) => Promise<string | null>>()
      .mockResolvedValue("2026-08-19T09:00:00Z");

    const result = await reconcileFutureProposalDates(
      [
        {
          submittedDate: "2026-08-20",
          platformLink:
            "https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/394",
        },
      ],
      fetchIssueCreatedAt,
      Date.parse("2026-08-31T12:00:00Z"),
    );

    expect(result.rows[0].submittedDate).toBe("2026-08-20");
    expect(result.corrected).toBe(0);
    expect(fetchIssueCreatedAt).not.toHaveBeenCalled();
  });

  it("keeps the sheet value when the official issue date is unavailable", async () => {
    const fetchIssueCreatedAt = vi
      .fn<(issueNumber: number) => Promise<string | null>>()
      .mockResolvedValue(null);

    const result = await reconcileFutureProposalDates(
      [
        {
          submittedDate: "2027-02-10",
          platformLink:
            "https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/999",
        },
      ],
      fetchIssueCreatedAt,
      Date.parse("2026-08-31T12:00:00Z"),
    );

    expect(result.rows[0].submittedDate).toBe("2027-02-10");
    expect(result.corrected).toBe(0);
  });
});
