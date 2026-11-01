export function CommitteeDecisionRule() {
  return <div className="committee-decision-rule" aria-label="Committee approval rule">
    <strong>3 <span>of 5</span></strong>
    <div><b>Approvals to pass</b><span>60% of the committee · One vote per member</span></div>
  </div>;
}

export function CommitteeCountingHelp({ timed = false }: { timed?: boolean }) {
  return <details className="committee-help"><summary>How votes are counted</summary><div>
    <p><strong>Approval:</strong> at least 3 of the 5 members must approve. Abstaining or not voting never lowers this number.</p>
    {timed ? <p><strong>Participation:</strong> this earlier review requires at least 3 responses, including abstentions. Below that, the result is “No quorum”. Its original deadline still applies.</p> : <>
      <p><strong>No deadline:</strong> all 5 members must record a choice before the result is published, even if 3 have already approved or rejected.</p>
      <p>After the fifth response, at least 3 approvals pass the proposal; otherwise it is rejected. An abstention counts as a response, not an approval.</p>
    </>}
    <p>Each member signs one choice and a public reason. Zcred does not affect voting power. Existing reviews retain their original rules.</p>
    <a className="dao-text-button" href="https://zcashcommunitygrants.org/selection/" target="_blank" rel="noreferrer">ZCG approval process ↗</a>
  </div></details>;
}
