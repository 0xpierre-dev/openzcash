const { readCollectorTallyMock } = vi.hoisted(() => ({ readCollectorTallyMock: vi.fn() }));
vi.mock("@/lib/services/collector-tally", () => ({ readCollectorTally: readCollectorTallyMock }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));

import { describe, expect, it, vi } from "vitest";
import { getLocalAdminFallbackPoll } from "@/lib/local-admin-fallback";
import AdminLiveFallbackPage from "@/app/admin-live/[pollId]/page";
import CollectorLivePage from "@/app/collector-live/page";

describe("local admin fallback registry", () => {
  it("returns the curated metadata for the current validation poll", () => {
    expect(
      getLocalAdminFallbackPoll("cmo7hg2n60001xzi7e84wquls")
    ).toMatchObject({
      pollId: "cmo7hg2n60001xzi7e84wquls",
      question: "Which path should we follow for the shielded portal test?",
      optionLabels: {
        A: "Approve full rollout",
        B: "Approve controlled pilot",
        C: "Request additional review",
        D: "Reject proposal",
        E: "Abstain"
      }
    });
  });

  it("returns a generic fallback when the poll id is unknown", () => {
    expect(getLocalAdminFallbackPoll("poll_unknown")).toMatchObject({
      pollId: "poll_unknown",
      question: "Collector validation fallback",
      optionLabels: {
        A: "Option A",
        B: "Option B",
        C: "Option C",
        D: "Option D",
        E: "Option E"
      }
    });
  });
});

describe("unscoped diagnostic pages", () => {
  it("refuses whole-wallet pages before reading collector data", async () => {
    await expect(AdminLiveFallbackPage()).rejects.toThrow("NOT_FOUND");
    await expect(CollectorLivePage()).rejects.toThrow("NOT_FOUND");
    expect(readCollectorTallyMock).not.toHaveBeenCalled();
  });
});
