import { ZCG_REVIEW_SOURCE } from "@/lib/domain/zcg-review";
import type { ArchiveManifest } from "./format";

// Operator-reviewed bindings for the five original editorial archives. Never
// infer ownership from an applicant's links, demo labels, title, or mutable UI data.
const historicalSources: Record<string, { issueNumber: number; forum: string }> = {
  "zcg-graphsense-2026-09-28": { issueNumber: 424, forum: "https://forum.zcashcommunity.com/t/grant-application-graphsense-zcash-shielded-accounting-repair/57585" },
  "zcg-ironwood-2026-09-28": { issueNumber: 438, forum: "https://forum.zcashcommunity.com/t/grant-application-human-readable-version-of-ironwood-formal-verification-first-steps-bulletproofs-in-the-agm/57726" },
  "zcg-seedsigner-2026-09-14": { issueNumber: 411, forum: "https://forum.zcashcommunity.com/t/grant-application-zcash-seedsigner-a-diy-open-source-air-gapped-signer-for-shielded-zec/57381" },
  "zcg-mumbai-2026-09-14": { issueNumber: 405, forum: "https://forum.zcashcommunity.com/t/grant-application-zcash-world-mumbai-devcon-8-week/57253" },
  "zcg-arabia-2026-08-31": { issueNumber: 400, forum: "https://forum.zcashcommunity.com/t/grant-application-zcash-arabia-august-to-december-2026/57170" },
};

export function officialSourceIssue(manifest: ArchiveManifest): number | null {
  if (manifest.kind === "NATIVE_PROPOSAL") return null;
  const alias = historicalSources[manifest.recordId];
  if (manifest.kind === "HISTORICAL_SUMMARY") return alias && manifest.sources.includes(alias.forum) ? alias.issueNumber : null;
  const canonical = /^zcg-github-([1-9][0-9]*)$/.exec(manifest.recordId);
  const issueNumber = canonical ? Number(canonical[1]) : alias?.issueNumber;
  if (!Number.isSafeInteger(issueNumber) || !issueNumber) return null;
  return manifest.sources.length === 1 && manifest.sources[0] === `${ZCG_REVIEW_SOURCE}/${issueNumber}` ? issueNumber : null;
}
