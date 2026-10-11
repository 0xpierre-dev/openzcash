import { PROPOSAL_TAGS } from "@/lib/participate/workspace/domain/proposal-tags";

/** Topics describe the proposal; lifecycle badges remain controlled by voting. */
export function ProposalTags({ tags = [] }: { tags?: readonly string[] }) {
  const selected = PROPOSAL_TAGS.filter(tag => tags.includes(tag.id));
  if (!selected.length) return null;
  return <ul className="dao-proposal-tags" aria-label="Proposal tags">
    {selected.map(tag => <li key={tag.id} className={`dao-topic dao-topic--${tag.tone}`}>{tag.label}</li>)}
  </ul>;
}
