import { describe, expect, it } from "vitest";
import {
  COINHOLDER_VERDICT_LABEL,
  grantStatusLabel,
  proposalStatusLabel,
} from "./status-labels";

describe("status labels", () => {
  it("labels known grant statuses and never hides an unknown one", () => {
    expect(grantStatusLabel("open")).toBe("Open");
    expect(grantStatusLabel("keyholder_veto")).toBe("Keyholder veto");
    expect(grantStatusLabel("in_progress")).toBe("in progress");
    expect(grantStatusLabel(null)).toBe("Unknown");
    expect(grantStatusLabel("", "·")).toBe("·");
  });

  it("labels proposal verdicts with the published vocabulary", () => {
    expect(proposalStatusLabel("under_review")).toBe("Under review");
    expect(proposalStatusLabel("vetoed")).toBe("Vetoed");
    expect(proposalStatusLabel(undefined)).toBe("·");
  });

  it("keeps the coinholder programme's own wording for its verdicts", () => {
    expect(COINHOLDER_VERDICT_LABEL.filtered).toBe("Not considered");
    expect(COINHOLDER_VERDICT_LABEL.pending).toBe("Pending vote");
    expect(COINHOLDER_VERDICT_LABEL.approved).toBe("Approved");
  });
});
