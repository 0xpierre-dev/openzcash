import Image from "next/image";
import { ZCG_EXAMPLE_MEMBERS, summarizeZcgVotes, type ZcgProposalExample } from "@/lib/participate/workspace/data/zcg-proposal-examples";

const choices = { approve: "Approve", reject: "Reject", abstain: "Abstain" };

export function CommitteeSourceDecision({ decision }: { decision: ZcgProposalExample | null | undefined }) {
  if (!decision) return <p className="committee-source-unavailable" role="status">The published decision details are unavailable. Open Proposal to inspect the preserved record and its sources.</p>;
  const counts = summarizeZcgVotes(decision.votes);
  return <section className="committee-source-decision" aria-label="Published committee decision">
    <div className="committee-source-summary">
      <div><strong>{counts.supportPercent}%</strong><span>support · {counts.approve} of {counts.total}</span></div>
      <p aria-label="Published vote counts"><span data-vote="approve">{counts.approve} approve</span><span data-vote="reject">{counts.reject} reject</span><span data-vote="abstain">{counts.abstain} abstain</span></p>
    </div>
    <div className="committee-source-caption"><span>Published comments · summaries</span><a href={decision.minutesUrl} target="_blank" rel="noopener noreferrer">Meeting minutes ↗</a></div>
    <ul className="committee-source-feedback" aria-label="Published votes and feedback">
      {decision.votes.map(vote => {
        const member = ZCG_EXAMPLE_MEMBERS[vote.memberId];
        return <li key={vote.memberId}>
          <Image src={member.avatar} alt="" width={34} height={34} />
          <div><div className="committee-source-member"><h3>{member.name}</h3><span data-vote={vote.vote}>{choices[vote.vote]}</span></div><p>{vote.summary}</p></div>
        </li>;
      })}
    </ul>
    <p className="committee-source-provenance">Recorded in ZCG meeting minutes. <a href={decision.proposalUrl} target="_blank" rel="noopener noreferrer">Original proposal ↗</a></p>
  </section>;
}
