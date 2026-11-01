import { z } from "zod";
import { decodeFile, verifyArchivePackage } from "@/lib/archive/format";
import type { ZcgProposalExample } from "@/lib/data/zcg-proposal-examples";

const sourceUrl = z.string().url().startsWith("https://forum.zcashcommunity.com/t/");
const sourceRecord = z.object({
  id: z.string(), title: z.string(), decisionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  outcome: z.enum(["approved", "rejected"]), feedbackType: z.literal("editorial_summary"),
  requestedUsd: z.number().int().nonnegative(), tags: z.array(z.string()).max(20),
  proposalUrl: sourceUrl, minutesUrl: sourceUrl,
  votes: z.array(z.object({
    memberId: z.enum(["artkor", "hanh", "gguy", "paul", "zerodartz"]),
    vote: z.enum(["approve", "reject", "abstain"]), summary: z.string().trim().min(1).max(4000)
  })).length(5).refine(votes => new Set(votes.map(vote => vote.memberId)).size === 5, "Duplicate source member")
});

/** Read the selected immutable revision, never a replacement from a mutable demo catalog. */
export async function readSourceDecision(input: unknown, expectedHash: string): Promise<ZcgProposalExample | null> {
  const { bundle, manifest } = await verifyArchivePackage(input, expectedHash);
  if (manifest.kind !== "HISTORICAL_SUMMARY") return null;
  const file = bundle.files.find(entry => entry.path === "record.json");
  if (!file) throw new Error("Source decision record is missing");
  const record = sourceRecord.parse(JSON.parse(new TextDecoder().decode(decodeFile(file))));
  if (record.id !== manifest.recordId || record.title !== manifest.title || record.decisionDate !== manifest.originalDecisionDate ||
    !manifest.sources.includes(record.minutesUrl) || !manifest.sources.includes(record.proposalUrl)) {
    throw new Error("Source decision does not match this revision");
  }
  return {
    id: record.id, title: record.title, decisionDate: record.decisionDate, outcome: record.outcome,
    requestedUsd: record.requestedUsd, tags: record.tags, proposalUrl: record.proposalUrl,
    minutesUrl: record.minutesUrl, votes: record.votes
  };
}
