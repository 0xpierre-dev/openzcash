import { describe, expect, it } from "vitest";
import {
  GRAYSCALE_SAVED_DISCLOSURE,
  disclosureProvenance,
  grayscaleDisclosure,
  newestDisclosure,
  parseSecZecHoldings,
  type DisclosureEntry,
} from "./disclosures";

const NOW = Date.parse("2026-09-30T12:00:00Z");
const fact = (
  end: string,
  val: number,
  filed: string,
  form = "10-Q",
  accn = "0001720265-26-000006",
) => ({
  end,
  val,
  accn,
  fy: 2026,
  fp: "Q2",
  form,
  filed,
});
const companyFacts = (
  facts: unknown[],
  extra: Record<string, unknown> = {},
) => ({
  cik: "0001720265",
  entityName: "Grayscale Zcash Trust (ZEC)",
  facts: {
    "us-gaap": {
      InvestmentOwnedBalanceContracts: { units: { Zec: facts } },
      ...extra,
    },
  },
});

describe("SEC EDGAR ZEC holdings", () => {
  it("takes the latest period-end figure and links the filing it came from", () => {
    const filing = parseSecZecHoldings(
      companyFacts([
        fact("2026-06-30", 388673.683599, "2026-08-04"),
        fact(
          "2025-12-31",
          393522.33134,
          "2026-03-12",
          "10-K",
          "0001193125-26-104253",
        ),
        fact(
          "2026-03-31",
          391103.887691,
          "2026-05-08",
          "10-Q",
          "0001193125-26-214629",
        ),
      ]),
      NOW,
    );
    expect(filing).toMatchObject({
      id: "grayscale",
      ticker: "ZCSH",
      kind: "fund",
      zec: 388673.683599,
      asOf: "2026-06-30",
      source:
        "https://www.sec.gov/Archives/edgar/data/1720265/000172026526000006/",
    });
    expect(filing.method).toContain("10-Q filed August 4, 2026");
  });

  it("prefers the most recently filed value when a period is restated", () => {
    const filing = parseSecZecHoldings(
      companyFacts([
        fact("2026-06-30", 388000, "2026-08-04"),
        fact(
          "2026-06-30",
          388673.683599,
          "2026-11-05",
          "10-Q/A",
          "0001720265-26-000009",
        ),
      ]),
      NOW,
    );
    expect(filing).toMatchObject({
      zec: 388673.683599,
      source: expect.stringContaining("000172026526000009"),
    });
  });

  it("rejects another registrant, missing ZEC units, future periods and impossible balances", () => {
    expect(() =>
      parseSecZecHoldings(
        {
          ...companyFacts([fact("2026-06-30", 1, "2026-08-04")]),
          cik: 1588489,
        },
        NOW,
      ),
    ).toThrow();
    expect(() =>
      parseSecZecHoldings(
        {
          ...companyFacts([]),
          facts: {
            "us-gaap": {
              InvestmentOwnedBalanceContracts: {
                units: { USD: [fact("2026-06-30", 1, "2026-08-04")] },
              },
            },
          },
        },
        NOW,
      ),
    ).toThrow();
    expect(() =>
      parseSecZecHoldings(
        companyFacts([fact("2026-12-31", 400000, "2027-02-01")]),
        NOW,
      ),
    ).toThrow();
    expect(() =>
      parseSecZecHoldings(
        companyFacts([fact("2026-06-30", 22_000_000, "2026-08-04")]),
        NOW,
      ),
    ).toThrow();
    expect(() =>
      parseSecZecHoldings(
        companyFacts([fact("2026-06-30", 0, "2026-08-04")]),
        NOW,
      ),
    ).toThrow();
  });
});

describe("newest dated figure wins", () => {
  const saved: DisclosureEntry = {
    data: GRAYSCALE_SAVED_DISCLOSURE,
    stale: true,
    fetchedAt: null,
    origin: "saved",
  };
  const filing = (asOf: string, zec: number): DisclosureEntry => ({
    data: {
      ...GRAYSCALE_SAVED_DISCLOSURE,
      asOf,
      zec,
      source: "https://www.sec.gov/Archives/edgar/data/1720265/x/",
    },
    stale: false,
    fetchedAt: "2026-09-30T12:00:00.000Z",
    origin: "filing",
  });

  it("keeps the saved issuer disclosure while the SEC figure is older (today: June 30 vs September 8)", () => {
    expect(
      newestDisclosure([null, saved, filing("2026-06-30", 388673.683599)]),
    ).toBe(saved);
  });

  it("switches to a filing only when its period end is newer", () => {
    const newer = filing("2026-09-30", 470000);
    expect(newestDisclosure([null, saved, newer])).toBe(newer);
    expect(
      newestDisclosure([
        null,
        saved,
        filing(GRAYSCALE_SAVED_DISCLOSURE.asOf, 1),
      ]),
    ).toBe(saved);
  });

  it("uses a live issuer read when it is at least as new, and nothing when no candidate exists", () => {
    const live: DisclosureEntry = {
      data: { ...GRAYSCALE_SAVED_DISCLOSURE, asOf: "2026-09-29", zec: 470100 },
      stale: false,
      fetchedAt: "2026-09-30T12:00:00.000Z",
      origin: "issuer",
    };
    expect(newestDisclosure([live, saved, filing("2026-09-29", 1)])).toBe(live);
    expect(newestDisclosure([null, null])).toBeNull();
  });

  it("says where a figure came from instead of presenting it as live", () => {
    expect(disclosureProvenance(saved)).toBe("Saved disclosure");
    expect(disclosureProvenance(filing("2026-09-30", 1))).toBe("SEC filing");
    expect(
      disclosureProvenance({ ...saved, origin: "issuer", stale: false }),
    ).toBe("Issuer reported");
    expect(
      disclosureProvenance({ ...saved, origin: "issuer", stale: true }),
    ).toBe("Saved disclosure");
    expect(disclosureProvenance({ stale: false })).toBe(
      "Issuer reported",
    );
  });

  it("dates the saved Grayscale disclosure and says it is not a live read", () => {
    expect(GRAYSCALE_SAVED_DISCLOSURE).toMatchObject({
      zec: 464514.8551,
      asOf: "2026-09-08",
    });
    expect(GRAYSCALE_SAVED_DISCLOSURE.method).toMatch(/saved by OpenZcash/i);
    expect(GRAYSCALE_SAVED_DISCLOSURE.method).toMatch(/not a live/i);
  });
});

describe("Grayscale: which figure is shown, and what the Sources note says", () => {
  const AT = "2026-09-30T12:00:00.000Z";
  const issuerRead = (asOf: string, stale = false) => ({
    data: { ...GRAYSCALE_SAVED_DISCLOSURE, asOf, zec: 460000 },
    stale,
    fetchedAt: AT,
  });
  const filingRead = (asOf: string) => ({
    data: {
      ...GRAYSCALE_SAVED_DISCLOSURE,
      asOf,
      zec: 388673.683599,
      source: "https://www.sec.gov/Archives/edgar/data/1720265/x/",
    },
    stale: false,
    fetchedAt: AT,
  });
  const unread = { data: null, stale: true, fetchedAt: null };

  it("today: issuer blocked, June filing older, so the saved disclosure with a 'could not be read' note", () => {
    const { entry, note } = grayscaleDisclosure(unread, filingRead("2026-06-30"));
    expect(entry.origin).toBe("saved");
    expect(entry.data).toBe(GRAYSCALE_SAVED_DISCLOSURE);
    expect(note).toBe(
      "Issuer site could not be read automatically; showing its last published disclosure, saved by OpenZcash.",
    );
  });

  it("a newer quarter-end filing replaces the saved figure, and the note says so", () => {
    const { entry, note } = grayscaleDisclosure(unread, filingRead("2026-09-30"));
    expect(entry.origin).toBe("filing");
    expect(note).toBe(
      "Issuer site could not be read automatically; showing the newer SEC filing.",
    );
  });

  it("a live issuer read at least as new wins, over saved and filing alike", () => {
    const { entry, note } = grayscaleDisclosure(
      issuerRead("2026-09-30"),
      filingRead("2026-09-30"),
    );
    expect(entry).toMatchObject({ origin: "issuer", stale: false, fetchedAt: AT });
    expect(note).toBe("Total ZEC in Fund read from the issuer site.");
  });

  it("never says the issuer could not be read when it was read but is older than the saved figure", () => {
    const { entry, note } = grayscaleDisclosure(
      issuerRead("2026-09-01"),
      filingRead("2026-06-30"),
    );
    expect(entry.origin).toBe("saved");
    expect(note).not.toMatch(/could not/);
    expect(note).toBe(
      "Issuer site read; its figure (as of September 1, 2026) is older than the disclosure saved by OpenZcash, which is shown.",
    );
  });

  it("names the filing when a readable issuer figure is older than it", () => {
    const { entry, note } = grayscaleDisclosure(
      issuerRead("2026-09-08"),
      filingRead("2026-09-30"),
    );
    expect(entry.origin).toBe("filing");
    expect(note).toBe(
      "Issuer site read; its figure (as of September 8, 2026) is older than the latest SEC filing, which is shown.",
    );
  });

  it("keeps a last good issuer figure while a re-read fails, and says so", () => {
    const kept = grayscaleDisclosure(
      issuerRead("2026-09-29", true),
      filingRead("2026-06-30"),
    );
    expect(kept.entry).toMatchObject({ origin: "issuer", stale: true });
    expect(kept.note).toBe(
      "Issuer site could not be re-read; showing the last figure read from it.",
    );
    const older = grayscaleDisclosure(
      issuerRead("2026-09-01", true),
      filingRead("2026-06-30"),
    );
    expect(older.entry.origin).toBe("saved");
    expect(older.note).toBe(
      "Issuer site could not be re-read; showing its newer disclosure, saved by OpenZcash.",
    );
  });
});
