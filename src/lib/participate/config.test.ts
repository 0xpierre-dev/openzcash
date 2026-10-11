import { describe, expect, it } from "vitest";
import {
  archiveEndpoint,
  isRecordId,
  participationCommunityId,
  participationView,
  proposalFilter,
  proposalPath,
} from "./config";

describe("native Participate configuration", () => {
  it("uses the public archive host id, with a safe default", () => {
    expect(participationCommunityId(undefined)).toBe("preview_orchard");
    expect(participationCommunityId("  ")).toBe("preview_orchard");
    expect(participationCommunityId("zcg_host")).toBe("zcg_host");
    expect(participationCommunityId("../etc")).toBe("preview_orchard");
  });
  it("only knows the fixed views and filters", () => {
    expect(participationView("history")).toBe("history");
    for (const value of [
      "committee",
      "about",
      undefined,
      "https://example.test",
    ])
      expect(participationView(value)).toBe("proposals");
    expect(proposalFilter("rejected")).toBe("rejected");
    for (const value of ["demo", undefined, 1])
      expect(proposalFilter(value)).toBe("under_review");
  });
  it("builds same-origin API and page paths from encoded ids", () => {
    expect(archiveEndpoint("preview_orchard")).toBe(
      "/api/communities/preview_orchard/archives",
    );
    expect(archiveEndpoint("preview_orchard", "zcg-github-478")).toBe(
      "/api/communities/preview_orchard/archives/zcg-github-478",
    );
    expect(proposalPath("zcg-github-478")).toBe(
      "/zcg/participate/zcg-github-478",
    );
    expect(archiveEndpoint("a b", "c/d")).toBe(
      "/api/communities/a%20b/archives/c%2Fd",
    );
  });
  it("accepts archive record ids and rejects paths or traversal", () => {
    expect(isRecordId("zcg-github-478")).toBe(true);
    expect(isRecordId("zcg-graphsense-2026-09-28")).toBe(true);
    for (const value of ["", "../x", "a/b", "Upper", ".hidden", null, 12])
      expect(isRecordId(value)).toBe(false);
  });
});
