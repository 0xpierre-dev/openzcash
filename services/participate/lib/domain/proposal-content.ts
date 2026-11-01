import { createHash } from "node:crypto";
import { normalizeProposalTags } from "@/lib/domain/proposal-tags";
import { MAX_PROPOSAL_USD_CENTS, PROPOSAL_SETTLEMENT_RULE } from "@/lib/domain/proposal-funding";

export const LEGACY_PROPOSAL_CONTENT_HASH_VERSION = "PROPOSAL_CONTENT_V1";
export const TAGGED_PROPOSAL_CONTENT_HASH_VERSION = "PROPOSAL_CONTENT_V2";
export const PROPOSAL_CONTENT_HASH_VERSION = "PROPOSAL_CONTENT_V3";
export type ProposalContentHashVersion = typeof LEGACY_PROPOSAL_CONTENT_HASH_VERSION | typeof TAGGED_PROPOSAL_CONTENT_HASH_VERSION | typeof PROPOSAL_CONTENT_HASH_VERSION;

type ProposalContent = {
  communityId: string;
  title: string;
  body: string;
  optionLabels: string[];
  treasuryId: string | null;
  requestedAmountZat: bigint | null;
  requestedAmountUsdCents?: bigint | null;
  tags?: readonly string[];
};

export function isProposalContentHashVersion(version: unknown): version is ProposalContentHashVersion {
  return version === LEGACY_PROPOSAL_CONTENT_HASH_VERSION || version === TAGGED_PROPOSAL_CONTENT_HASH_VERSION || version === PROPOSAL_CONTENT_HASH_VERSION;
}

/** V1/V2 remain byte-compatible; V3 also commits to the USD budget and ZEC settlement rule. */
export function proposalContentHash(input: ProposalContent, version: ProposalContentHashVersion = PROPOSAL_CONTENT_HASH_VERSION) {
  if (!isProposalContentHashVersion(version)) throw new Error("Unsupported proposal content version");
  const tags = normalizeProposalTags(input.tags ?? []);
  if (version === LEGACY_PROPOSAL_CONTENT_HASH_VERSION && tags.length > 0) {
    throw new Error("Legacy proposal commitments cannot contain tags");
  }
  const usdCents = input.requestedAmountUsdCents ?? null;
  if (usdCents !== null && (version !== PROPOSAL_CONTENT_HASH_VERSION || !input.treasuryId ||
      input.requestedAmountZat != null || usdCents <= 0n || usdCents > MAX_PROPOSAL_USD_CENTS)) {
    throw new Error("USD funding requires a V3 commitment, a fund and a valid USD budget only");
  }
  const content = {
    version,
    communityId: input.communityId,
    title: input.title.trim(),
    body: input.body.trim(),
    optionLabels: input.optionLabels.map((label) => label.trim()),
    treasuryId: input.treasuryId,
    requestedAmountZat: input.requestedAmountZat?.toString() ?? null
  };
  const tagged = { ...content, tags };
  const committed = version === LEGACY_PROPOSAL_CONTENT_HASH_VERSION ? content
    : version === TAGGED_PROPOSAL_CONTENT_HASH_VERSION ? tagged
    : { ...tagged, requestedAmountUsdCents: usdCents?.toString() ?? null,
      settlement: usdCents === null ? null : { budgetCurrency: "USD", paymentCurrency: "ZEC", rule: PROPOSAL_SETTLEMENT_RULE } };
  return createHash("sha256").update(JSON.stringify(committed)).digest("hex");
}

export function hasValidProposalContentHash(input: ProposalContent, version: unknown, expectedHash: string): boolean {
  if (!isProposalContentHashVersion(version)) return false;
  try {
    return proposalContentHash(input, version) === expectedHash;
  } catch {
    return false;
  }
}
