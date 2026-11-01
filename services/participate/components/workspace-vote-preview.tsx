import type { WorkspaceVotePreview } from "@/lib/domain/workspace-vote-preview";

export function WorkspaceVotePreviewBar({ vote }: { vote: WorkspaceVotePreview }) {
  const cast = vote.yes + vote.no;
  const yesShare = cast > 0 ? vote.yes / cast : 0;
  const noShare = cast > 0 ? vote.no / cast : 0;
  const yesPercent = `${(yesShare * 100).toFixed(1)}%`;
  const noPercent = `${(noShare * 100).toFixed(1)}%`;
  const summary = `Simulated vote ${vote.outcome}: Yes ${vote.yes} (${yesPercent}), No ${vote.no} (${noPercent}). ${cast} of ${vote.eligible} eligible members voted.`;

  return (
    <figure className="dao-vote-preview" role="img" aria-label={summary}>
      <div className="dao-vote-labels">
        <span className="dao-vote-label-yes">Yes <strong>{vote.yes}</strong> <span>({yesPercent})</span></span>
        <span className="dao-vote-label-no">No <strong>{vote.no}</strong> <span>({noPercent})</span></span>
      </div>
      <span className="dao-vote-count">{cast} / {vote.eligible} voted</span>
      <div className="dao-vote-track" aria-hidden="true">
        <span className="dao-vote-yes" style={{ width: `${yesShare * 100}%` }} />
        <span className="dao-vote-no" style={{ width: `${noShare * 100}%` }} />
      </div>
      <figcaption className="dao-vote-demo">Simulated</figcaption>
    </figure>
  );
}
