export const LEGAL_REGIONS = [
  { id: "all", label: "All regions" },
  { id: "latam", label: "LATAM" },
  { id: "europe", label: "Europe" },
  { id: "north-america", label: "North America" },
  { id: "global", label: "Global" },
] as const;
export type LegalRegion = Exclude<(typeof LEGAL_REGIONS)[number]["id"], "all">;
export const LEGAL_TOPICS = ["Privacy", "Regulation", "Courts", "Policy"] as const;
export type LegalTopic = (typeof LEGAL_TOPICS)[number];
export type LegalStatus = "Analysis" | "Proposal" | "Consultation" | "Adopted" | "In force" | "Court decision" | "Official update";
export type LegalItem = {
  id: string;
  title: string;
  summary: string;
  url: string;
  sourceId: string;
  publishedAt: string;
  /** Some official feeds expose only their last update date. */
  dateBasis?: "published" | "updated";
  regions: LegalRegion[];
  jurisdictions: string[];
  topics: LegalTopic[];
  kind: "Policy memo" | "Regulation" | "Court ruling" | "Consultation" | "Official update";
  status: LegalStatus;
  /** Dated statement of what the source establishes; not a country legality rating. */
  statusDetail?: string;
  effectiveAt?: string;
  /** Separate from publication date, e.g. the week discussed in a memo. */
  reportingPeriod?: string;
  reviewedAt?: string;
};
export type LegalSource = {
  id: string;
  name: string;
  url: string;
  role: "Advocacy & analysis" | "Primary authority";
  mode: "live" | "curated";
};
export type LegalFeed = {
  items: LegalItem[];
  sources: LegalSource[];
  fetchedAt: string | null;
  pgpStatus: "live" | "unavailable" | "cached";
  pgpLastSuccessAt: string | null;
  sourceHealth?: Array<{
    sourceId: string;
    status: "live" | "cached" | "unavailable";
    fetchedAt: string | null;
    lastSuccessAt: string | null;
  }>;
};
