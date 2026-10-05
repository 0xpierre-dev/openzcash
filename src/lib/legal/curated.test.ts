import { describe, expect, it } from "vitest";
import { LEGAL_ITEMS, LEGAL_SOURCES } from "./curated";
import { validLegalDate, mergeLegalItems } from "./pgp-parser";

describe("reviewed legal records", () => {
  it("retains every record with a unique safe source and verified publication date", () => {
    const sources = new Set(["pgp", ...LEGAL_SOURCES.map(source => source.id)]);
    expect(LEGAL_ITEMS.length).toBe(9);
    expect(mergeLegalItems(LEGAL_ITEMS, [], "2026-10-05")).toHaveLength(LEGAL_ITEMS.length);
    for (const item of LEGAL_ITEMS) {
      expect(sources.has(item.sourceId), item.id).toBe(true);
      expect(validLegalDate(item.publishedAt), item.id).toBe(true);
      expect(validLegalDate(item.reviewedAt), item.id).toBe(true);
      expect(item.regions.length, item.id).toBeGreaterThan(0);
    }
  });
  it("keeps future application and proposal status separate from publication", () => {
    const eu = LEGAL_ITEMS.find(item => item.id === "eu-amlr-article-79")!;
    expect(eu.publishedAt).toBe("2024-06-19");
    expect(eu.status).toBe("Adopted");
    expect(eu.effectiveAt).toBe("2027-07-10");
    const sec = LEGAL_ITEMS.find(item => item.sourceId === "sec")!;
    expect(sec.status).toBe("Proposal");
    expect(sec.effectiveAt).toBeUndefined();
  });
});
