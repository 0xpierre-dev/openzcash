import type { CommitteeWorkspace } from "@/lib/participate/workspace/domain/committee";

export function CommitteeReviewGuide({ data, onMembers }: { data: CommitteeWorkspace; onMembers: () => void }) {
  const me = data.members.find(member => member.isMe && member.status === "ACTIVE");
  const preview = data.demo || !data.role;
  // Nothing to say once a reviewer is ready: the queue speaks for itself.
  if (!preview && data.permissions.canReview && me?.ready) return null;
  return <section className="committee-flow committee-flow--compact" aria-label="Your review workflow">
    <div className="committee-access-note" role="note"><strong>{preview ? "Admin preview · Read only" : data.permissions.canReview ? me?.ready ? "Ready to review" : "Complete your reviewer setup" : "Discussion access"}</strong><button type="button" className="dao-text-button" onClick={onMembers}>Members & access →</button></div>
  </section>;
}
