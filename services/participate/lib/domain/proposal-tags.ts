import { z } from "zod";

/** Topics adapted from ZCG's grant categories; workflow status is maintained separately. */
export const PROPOSAL_TAGS = [
  { id: "security", label: "Security", tone: "red" },
  { id: "infrastructure", label: "Infrastructure", tone: "blue" },
  { id: "community", label: "Community", tone: "purple" },
  { id: "education", label: "Education", tone: "teal" },
  { id: "applications", label: "Applications", tone: "blue" },
  { id: "integration", label: "Integration", tone: "teal" },
  { id: "wallets", label: "Wallets", tone: "amber" },
  { id: "research", label: "Research & development", tone: "purple" },
  { id: "media", label: "Media", tone: "amber" },
  { id: "protocol", label: "Protocol", tone: "blue" },
  { id: "operations", label: "Dedicated resources", tone: "slate" },
  { id: "events", label: "Events", tone: "pink" },
  { id: "retroactive", label: "Retroactive", tone: "purple" }
] as const;

export type ProposalTagId = (typeof PROPOSAL_TAGS)[number]["id"];
export const MAX_PROPOSAL_TAGS = 3;

const tagIds = PROPOSAL_TAGS.map(({ id }) => id) as [ProposalTagId, ...ProposalTagId[]];
export const proposalTagIdSchema = z.enum(tagIds);
export const proposalTagsSchema = z.array(proposalTagIdSchema).max(MAX_PROPOSAL_TAGS)
  .refine((tags) => new Set(tags).size === tags.length, "Choose each topic only once");

/** A topic set has one deterministic storage and commitment order. */
export function normalizeProposalTags(tags: readonly string[]): ProposalTagId[] {
  return proposalTagsSchema.parse(tags).sort();
}
