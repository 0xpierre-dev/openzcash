import { notFound } from "next/navigation";
import { findVerifiableRound, verifyRound } from "@/lib/coinholder/verify";
import { chainReport, zecDigits } from "@/lib/coinholder/verify-export";
import { VOTE_CHAIN_ROUNDS } from "@/lib/coinholder/verify-sources";
import { fetchVoteSummary } from "@/lib/coinholder/vote-chain";
import { proposalVerifyHref } from "@/lib/coinholder/proposal-decision";
import { pageMetadata } from "@/lib/seo/page-metadata";
import { ProposalDetail } from "../../proposal-detail";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ round: string; proposal: string }> };

async function resolve({ params }: Props) {
  const ids = await params;
  const round = findVerifiableRound(ids.round);
  const proposal = round?.proposals.find(p => p.id === ids.proposal);
  if (!round || !proposal) notFound();
  return { round, proposal };
}

export async function generateMetadata(props: Props) {
  const { round, proposal } = await resolve(props);
  return pageMetadata({ title: `${proposal.title} · ${round.label} · OpenZcash`,
    description: "The full vote tally, participation threshold, majority calculation and source records for this proposal.",
    path: proposalVerifyHref(round.id, proposal.id) });
}

export default async function ProposalPage(props: Props) {
  const { round, proposal } = await resolve(props);
  const chainId = VOTE_CHAIN_ROUNDS[round.id];
  const live = chainId ? await fetchVoteSummary(chainId) : null;
  const check = verifyRound(round, live?.ok ? live.summary : null);
  const row = check.rows.find(r => r.id === proposal.id)!;
  return <ProposalDetail round={round} proposal={proposal} row={row}
    chain={chainReport(round.id, live)} digits={zecDigits(check)} poll={check.kind === "poll"} />;
}
