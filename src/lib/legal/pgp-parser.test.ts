import { describe, expect, it } from "vitest";
import { legalSourceUrl, mergeLegalItems, parsePgpArchive } from "./pgp-parser";
import { pgpArchive, pgpCard } from "./public-fixtures";
const day = "2026-10-15";
describe("PGPZ public archive", () => {
  it("reads the public HTML archive and labels a memo week separately from publication", () => {
    const [item] = parsePgpArchive(pgpArchive(), day);
    expect(item).toMatchObject({ sourceId: "pgp", publishedAt: "2026-09-28", dateBasis: "reporting-period", status: "Analysis", regions: ["north-america"], jurisdictions: ["United States"] });
    expect(item.url).toBe("https://pgpz.org/updates/2026-09-28-weekly-policy-memo");
    expect(item.reviewedAt).toBeUndefined(); expect(item.effectiveAt).toBeUndefined();
  });
  it("uses visible source dates, supports mixed-case report paths and omits undated semester reports", () => {
    const cards = pgpCard("June 25, 2026", "20260625-Stablecoin-NPRM") + pgpCard("H1 2026 U.S. Policy Report", "1H2026-us-digital-asset-policy");
    const items = parsePgpArchive(pgpArchive(cards), day);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ publishedAt: "2026-06-25", dateBasis: "source-date" });
  });
  it.each([
    ["old sign-in shell", '<script>self.__next_f.push([1,"shell"])</script>'],
    ["missing list", "<main>Maintenance</main>"],
    ["unexplained empty archive", pgpArchive("")],
    ["missing date", pgpArchive(pgpCard(""))],
    ["invalid day", pgpArchive(pgpCard("Week of February 30, 2026"))],
    ["future", pgpArchive(pgpCard("Week of November 2, 2026"))],
    ["foreign URL", pgpArchive().replaceAll("https://pgpz.org/updates/", "https://evil.example/updates/")],
    ["credentials", pgpArchive().replaceAll("https://pgpz.org/", "https://user:pass@pgpz.org/")],
    ["member URL", pgpArchive().replaceAll("https://pgpz.org/", "https://community.pgpz.org/")],
  ])("fails visibly on %s instead of marking stale content fresh", (_, html) => {
    expect(() => parsePgpArchive(html, day)).toThrow();
  });
  it("treats scripts as inert and decodes HTML entities without markup in titles", () => {
    const html = pgpArchive().replace("Weekly Policy Memo</a>", "Privacy &amp; <strong>policy</strong></a>").replace("CFTC public policy update.", "CFTC<script>throw new Error('executed')</script> update.");
    const [item] = parsePgpArchive(html, day);
    expect(item.title).toBe("Privacy & policy"); expect(item.summary).toBe("CFTC update.");
  });
  it("canonicalizes old public-preview links and retains reviewed legal context", () => {
    const [live] = parsePgpArchive(pgpArchive(), day);
    const reviewed = { ...live, id: "reviewed", title: "Reviewed summary", url: live.url.replace("pgpz.org", "community.pgpz.org"), reviewedAt: "2026-10-05" };
    const result = mergeLegalItems([reviewed], [live], day);
    expect(result).toHaveLength(1); expect(result[0]).toMatchObject({ title: "Reviewed summary", reviewedAt: "2026-10-05", url: live.url });
    expect(legalSourceUrl("https://community.pgpz.org/signin")).toBe("https://community.pgpz.org/signin");
    expect(legalSourceUrl("javascript:alert(1)")).toBeNull();
  });
  it("does not infer a jurisdiction from the publisher's location", () => {
    expect(parsePgpArchive(pgpArchive().replace("CFTC public policy update.", "Privacy research."), day)[0].regions).toEqual([]);
  });
});
