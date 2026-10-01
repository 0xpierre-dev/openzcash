import { z } from "zod";
import { MAX_SUPPLY, type Disclosure } from "./model";

/** Where a fund figure came from: a live issuer read, a copy saved by OpenZcash, or an SEC filing. */
export type DisclosureOrigin = "issuer" | "saved" | "filing";
export type DisclosureEntry = {
  data: Disclosure;
  stale: boolean;
  fetchedAt: string | null;
  origin: DisclosureOrigin;
};

export const GRAYSCALE_ISSUER_URL = "https://www.thezcashetf.com/";
const GRAYSCALE_CIK = 1720265;
export const GRAYSCALE_SEC_FACTS = `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(GRAYSCALE_CIK).padStart(10, "0")}.json`;
const GRAYSCALE = {
  id: "grayscale",
  name: "Grayscale · The Zcash ETF",
  ticker: "ZCSH",
  kind: "fund",
  custody: "Coinbase Custody",
} as const;

/**
 * The issuer's last published Total ZEC in Fund, saved by hand because its site
 * blocks automated reads. Explicitly dated; never presented as a live quote.
 */
export const GRAYSCALE_SAVED_DISCLOSURE: Disclosure = {
  ...GRAYSCALE,
  zec: 464514.8551,
  asOf: "2026-09-08",
  source: GRAYSCALE_ISSUER_URL,
  method:
    "Total ZEC in Fund as of September 8, 2026, as published by the issuer and saved by OpenZcash on September 22, 2026. The issuer’s site blocks automated reads, so this is not a live figure; a newer SEC filing replaces it automatically. Successor to the Zcash Trust; not an additional holding.",
};

const longDate = (day: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(day));

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => Number.isFinite(Date.parse(s)));
const secFacts = z.object({
  cik: z
    .union([z.number(), z.string()])
    .transform(Number)
    .pipe(z.literal(GRAYSCALE_CIK)),
  facts: z.object({
    "us-gaap": z.object({
      InvestmentOwnedBalanceContracts: z.object({
        units: z.object({
          Zec: z
            .array(
              z.object({
                end: isoDay,
                val: z.number().finite(),
                accn: z.string().regex(/^\d{10}-\d{2}-\d{6}$/),
                form: z.string().min(1),
                filed: isoDay,
              }),
            )
            .min(1),
        }),
      }),
    }),
  }),
});

/** ZEC held at the latest reported period end, from the fund's XBRL filings on SEC EDGAR. */
export function parseSecZecHoldings(raw: unknown, now: number): Disclosure {
  const facts =
    secFacts.parse(raw).facts["us-gaap"].InvestmentOwnedBalanceContracts.units
      .Zec;
  const latest = [...facts].sort(
    (a, b) => b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed),
  )[0];
  if (Date.parse(latest.end) > now) throw new Error("Future period end");
  if (latest.val <= 0 || latest.val > MAX_SUPPLY)
    throw new Error("Invalid fund balance");
  return {
    ...GRAYSCALE,
    zec: latest.val,
    asOf: latest.end,
    source: `https://www.sec.gov/Archives/edgar/data/${GRAYSCALE_CIK}/${latest.accn.replaceAll("-", "")}/`,
    method: `ZEC held at the ${longDate(latest.end)} period end, from the fund’s ${latest.form} filed ${longDate(latest.filed)} with the SEC. Successor to the Zcash Trust; not an additional holding.`,
  };
}

/**
 * The newest dated figure wins. Candidates are in order of preference, so a tie
 * keeps the earlier one: a filing replaces the saved disclosure only when its
 * period end is strictly newer.
 */
export function newestDisclosure(
  candidates: (DisclosureEntry | null | undefined)[],
): DisclosureEntry | null {
  let best: DisclosureEntry | null = null;
  for (const candidate of candidates)
    if (
      candidate &&
      (!best || Date.parse(candidate.data.asOf) > Date.parse(best.data.asOf))
    )
      best = candidate;
  return best;
}

/** The slice of a feed read that the Grayscale choice needs. */
type DisclosureRead = {
  data: Disclosure | null;
  stale: boolean;
  fetchedAt: string | null;
};

const SAVED_GRAYSCALE: DisclosureEntry = {
  data: GRAYSCALE_SAVED_DISCLOSURE,
  stale: true,
  fetchedAt: null,
  origin: "saved",
};

/** What the Sources list says about the issuer read, given the figure shown. */
function grayscaleNote(issuer: DisclosureRead, shown: DisclosureEntry): string {
  const readNow = issuer.data !== null && !issuer.stale;
  const failed = issuer.data
    ? "Issuer site could not be re-read"
    : "Issuer site could not be read automatically";
  const older = (than: string) =>
    `Issuer site read; its figure (as of ${longDate(issuer.data!.asOf)}) is older than ${than}, which is shown.`;
  switch (shown.origin) {
    case "issuer":
      return readNow
        ? "Total ZEC in Fund read from the issuer site."
        : "Issuer site could not be re-read; showing the last figure read from it.";
    case "saved":
      if (readNow) return older("the disclosure saved by OpenZcash");
      return issuer.data
        ? `${failed}; showing its newer disclosure, saved by OpenZcash.`
        : `${failed}; showing its last published disclosure, saved by OpenZcash.`;
    case "filing":
      return readNow
        ? older("the latest SEC filing")
        : `${failed}; showing the newer SEC filing.`;
  }
}

/**
 * The Grayscale figure to show and its Sources note, in one place: the
 * newest dated figure among a live issuer read, the saved issuer disclosure
 * and the latest SEC filing (that order breaks ties). The note is chosen from
 * what actually happened to the issuer read, so a readable issuer page whose
 * figure is merely older is never described as unreadable.
 */
export function grayscaleDisclosure(
  issuer: DisclosureRead,
  filing: DisclosureRead,
): { entry: DisclosureEntry; note: string } {
  const entry =
    newestDisclosure([
      issuer.data
        ? {
            data: issuer.data,
            stale: issuer.stale,
            fetchedAt: issuer.fetchedAt,
            origin: "issuer",
          }
        : null,
      SAVED_GRAYSCALE,
      filing.data
        ? {
            data: filing.data,
            stale: filing.stale,
            fetchedAt: filing.fetchedAt,
            origin: "filing",
          }
        : null,
    ]) ?? SAVED_GRAYSCALE;
  return { entry, note: grayscaleNote(issuer, entry) };
}

/**
 * A short, honest provenance label. An issuer figure that could not be re-read
 * is, like the hand-saved one, the issuer's last disclosure kept by OpenZcash.
 */
export function disclosureProvenance(entry: {
  stale: boolean;
  origin?: DisclosureOrigin;
}): string {
  if (entry.origin === "filing") return "SEC filing";
  return entry.origin === "saved" || entry.stale
    ? "Saved disclosure"
    : "Issuer reported";
}
