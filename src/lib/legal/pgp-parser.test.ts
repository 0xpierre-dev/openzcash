import { describe, expect, it } from "vitest";
import { legalSourceUrl, mergeLegalItems, parsePgpHomepage, validLegalDate } from "./pgp-parser";
import type { LegalItem } from "./types";

// Matches the confirmed homepage's public RSC data shape. These are preview
// records; the protected archive and full article bodies are not fixtures.
const older = {
  slug: "2026-07-24-statements-for-the-record", categoryLabel: "Special Update",
  title: "Statements for the Record—July 17 CLARITY Act and July 21 FinCEN Oversight Hearings",
  shortTitle: "Statements for the Record", publishedAt: "2026-07-24",
  summary: "This week, PGPZ submitted two Statements for the Record following recent hearings before the\nHouse Financial Services Committee.",
  emailPreheader: "Preview only", coverImage: "/cover.svg",
  portalPath: "/updates/2026-07-24-statements-for-the-record",
};
const newer = {
  slug: "2026-09-28-weekly-policy-memo", categoryLabel: "Weekly Policy Memo",
  title: "Weekly Policy Memo: Week of September 28, 2026", shortTitle: "September 28",
  publishedAt: "2026-09-28", summary: "SEC and CFTC staff issue digital asset-related guidance.",
  emailPreheader: "Preview only", coverImage: "/cover.png",
  portalPath: "/updates/2026-09-28-weekly-policy-memo",
};
const transport = (records: unknown[]) => `<script>self.__next_f.push(${JSON.stringify([1, `1b:${JSON.stringify(["$", "$L1d", null, { featuredPolicyUpdates: records }])}\n`])})</script>`;
const day = "2026-10-05";
const item = (patch: Partial<LegalItem> = {}): LegalItem => ({
  id: "official", title: "Dated source", summary: "A reviewed public source.",
  url: "https://authority.example/record?id=12", sourceId: "authority",
  publishedAt: "2026-09-01", reviewedAt: "2026-10-05", regions: ["global"],
  jurisdictions: [], topics: ["Policy"], kind: "Official update", status: "Official update", ...patch,
});

describe("PGP public featured previews", () => {
  it("reads the actual transport/schema and sorts dates rather than homepage order", () => {
    const result = parsePgpHomepage(transport([older, newer]), day);
    expect(result.map(value => value.publishedAt)).toEqual(["2026-09-28", "2026-07-24"]);
    expect(result[0]).toMatchObject({ sourceId: "pgp", kind: "Policy memo", status: "Analysis", regions: ["north-america"], jurisdictions: ["United States"] });
    expect(result[1].summary).not.toContain("\n");
    expect(result[0].url).toBe("https://community.pgpz.org/updates/2026-09-28-weekly-policy-memo");
    expect(result[0].statusDetail).toContain("not the complete archive");
    expect(result[0]).not.toHaveProperty("reviewedAt");
    expect(result[0]).not.toHaveProperty("effectiveAt");
  });
  it("does not execute scripts or treat a sign-in shell as a live empty archive", () => {
    expect(() => parsePgpHomepage('<script>throw new Error("executed")</script><h1>Sign in</h1>', day)).toThrow("PGP_PUBLIC_SCHEMA_UNAVAILABLE");
    expect(() => parsePgpHomepage('<script>self.__next_f.push([1, window.privateData])</script>', day)).toThrow("PGP_PUBLIC_SCHEMA_UNAVAILABLE");
    expect(() => parsePgpHomepage('<script>self.__next_f.push([1,"NEXT_REDIRECT;replace;/signin;307;"])</script>', day)).toThrow("PGP_PUBLIC_SCHEMA_UNAVAILABLE");
  });
  it("handles escaped quotes, brackets and split RSC chunks without parsing them as code", () => {
    const data = `1b:${JSON.stringify({ featuredPolicyUpdates: [{ ...newer, summary: 'A preview [draft] says "privacy"; no legal outcome is established.' }] })}`;
    const cut = Math.floor(data.length / 2);
    const html = [data.slice(0, cut), data.slice(cut)].map(chunk => `<script>self.__next_f.push(${JSON.stringify([1, chunk])})</script>`).join("");
    expect(parsePgpHomepage(html, day)[0].summary).toBe('A preview [draft] says "privacy"; no legal outcome is established.');
    expect(parsePgpHomepage(html, day)[0].regions).toEqual([]);
  });
  it("tags explicit regional scope without treating unknown geography as worldwide", () => {
    const scoped = (summary: string) => parsePgpHomepage(transport([{ ...newer, summary }]), day)[0];
    expect(scoped("Brazil considers virtual-asset policy.")).toMatchObject({ regions: ["latam"], jurisdictions: ["Brazil"] });
    expect(scoped("European Union MiCA policy update.")).toMatchObject({ regions: ["europe"], jurisdictions: ["European Union"] });
    expect(scoped("A policy discussion with no named location.")).toMatchObject({ regions: [], jurisdictions: [] });
    expect(scoped("A global policy comparison.").regions).toEqual(["global"]);
  });
  it("requires explicit valid publication dates and canonical PGP update paths", () => {
    const bad = [
      { ...newer, publishedAt: undefined }, { ...newer, publishedAt: "2026-02-30" },
      { ...newer, publishedAt: "2027-01-01" }, { ...newer, portalPath: "https://evil.example/update" },
      { ...newer, portalPath: "//evil.example/update" }, { ...newer, slug: "../signin" },
      { ...newer, portalPath: "/updates/other" }, { ...newer, summary: "" },
    ];
    expect(parsePgpHomepage(transport([...bad, older]), day)).toHaveLength(1);
    expect(() => parsePgpHomepage(transport(bad), day)).toThrow("PGP_PUBLIC_RECORDS_UNAVAILABLE");
  });
  it("deduplicates repeated featured entries and accepts an explicitly empty list", () => {
    expect(parsePgpHomepage(transport([newer, older, newer]), day)).toHaveLength(2);
    expect(parsePgpHomepage(transport([]), day)).toEqual([]);
  });
});

describe("legal record dates and merge", () => {
  it("validates calendar dates, including leap days", () => {
    expect(validLegalDate("2024-02-29")).toBe(true);
    for (const date of ["2026-02-29", "2026-09-31", "2026-1-01", "2026-10-05T00:00:00Z", "", null]) expect(validLegalDate(date)).toBe(false);
  });
  it("keeps document query IDs but removes tracking and fragments", () => {
    expect(legalSourceUrl("https://authority.example/record?utm_source=x&id=12#section")).toBe("https://authority.example/record?id=12");
    for (const url of ["http://authority.example", "https://user:pass@authority.example", "javascript:alert(1)", "/relative"]) expect(legalSourceUrl(url)).toBeNull();
  });
  it("retains curated context on duplicates, permits distinct primary document IDs and sorts chronologically", () => {
    const reviewed = item({ url: "https://authority.example/record?utm_source=x&id=12#heading" });
    const live = item({ id: "duplicate", title: "Preview headline", url: "https://authority.example/record?id=12" });
    const distinct = item({ id: "other", url: "https://authority.example/record?id=13", publishedAt: "2026-10-01" });
    const merged = mergeLegalItems([reviewed, distinct], [live], day);
    expect(merged.map(value => value.id)).toEqual(["other", "official"]);
    expect(merged[1].title).toBe("Dated source");
    expect(reviewed.url).toContain("utm_source");
  });
  it("excludes future publication/review, allows a separately dated future effective date, and never synthesizes dates", () => {
    const effective = item({ id: "effective", effectiveAt: "2027-07-10" });
    expect(mergeLegalItems([
      effective,
      item({ id: "future", url: "https://authority.example/future", publishedAt: "2026-10-06" }),
      item({ id: "future-review", url: "https://authority.example/review", reviewedAt: "2026-10-06" }),
      item({ id: "invalid-date", url: "https://authority.example/invalid", publishedAt: "2026-09-31" }),
    ], [], day)).toEqual([effective]);
  });
});
