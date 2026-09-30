import { ROUNDS } from "@/lib/coinholder/rounds";
import { PROGRAM } from "@/lib/coinholder/program";
import { ResultsView } from "../round-view";

export const metadata = {
  title: `Results · ${PROGRAM.officialName} · OpenZcash`,
  description: `Every ${PROGRAM.officialName} round: each proposal's outcome, requested amount and the ZEC voted for each answer.`,
};

/**
 * ?round=<id> picks a round, ?round=all lists every verdict; the newest round is the default.
 * Ids are matched case-insensitively: old links such as /coinholders/Q1-2026 redirect here as ?round=Q1-2026.
 */
export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ round?: string | string[] }>;
}) {
  const { round } = await searchParams;
  const id = (Array.isArray(round) ? round[0] : round)?.trim().toLowerCase();
  const selected =
    id === "all" ? "all" : (ROUNDS.find((r) => r.id === id) ?? ROUNDS[0]);
  return <ResultsView selected={selected} />;
}
