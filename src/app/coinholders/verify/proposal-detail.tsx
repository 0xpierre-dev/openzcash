import Link from "next/link";
import type { Round, RoundProposal } from "@/lib/coinholder/types";
import type { ChainReport } from "@/lib/coinholder/verify-export";
import { OUTCOME_LABEL, QUORUM_ZEC, formatZec } from "@/lib/coinholder/derive";
import { ZIP_1016_RULE, type VerifyRow } from "@/lib/coinholder/verify";
import { proposalDecision, proposalVerifyHref } from "@/lib/coinholder/proposal-decision";
import { formatShare, utcTime } from "@/lib/coinholder/verify-view";
import { SCRIPT_PATH, VOTE_CHAIN_HOSTS, VOTE_CHAIN_ROUNDS, verifyApiPath, voteSummaryUrl } from "@/lib/coinholder/verify-sources";
import { CodeBlock } from "./code-block";
import shared from "../coinholders.module.css";
import styles from "./proposal-detail.module.css";

type Decision = NonNullable<ReturnType<typeof proposalDecision>>;
const shortOption = (key: string, label: string) => key === "rejectLower" ? "Reject · lower amount" : label.split(" · ")[0];

function DecisionGraph({ data, digits }: { data: Decision; digits: number }) {
  const height = 288, floor = 316, x = 120, width = 154;
  const y = (position: number) => floor - height * position;
  return <figure className={styles.graph}>
    <svg viewBox="0 0 480 350" role="img" aria-labelledby="decision-graph-title decision-graph-desc">
      <title id="decision-graph-title">Vote volume and decision thresholds</title>
      <desc id="decision-graph-desc">All options stacked to scale, starting at zero. The participation line is 420,000 ZEC. The dashed majority line is half of the directional vote; Accept must exceed it. Exact values appear in the tally table.</desc>
      <line x1={x - 1} x2={x - 1} y1={28} y2={floor} className={styles.axis} />
      {data.options.map(option => <g key={option.key}>
        <rect x={x} y={y(option.start + option.size)} width={width} height={height * option.size} className={styles[option.key]}>
          <title>{`${option.label}: ${formatZec(option.value, digits)} ZEC`}</title>
        </rect>
        {option.size >= .085 && <text x={width + x + 15} y={y(option.start + option.size / 2) + 4} className={styles.graphLabel}>{shortOption(option.key, option.label)}</text>}
      </g>)}
      <line x1={x - 20} x2={x + width + 10} y1={y(data.quorumPosition)} y2={y(data.quorumPosition)} className={styles.quorumLine} />
      <text x={x - 27} y={y(data.quorumPosition) + 4} textAnchor="end" className={styles.axisLabel}>420,000</text>
      {data.directional > 0 && <>
        <line x1={x} x2={x + width} y1={y(data.majorityPosition)} y2={y(data.majorityPosition)} className={styles.majorityHalo} />
        <line x1={x} x2={x + width} y1={y(data.majorityPosition)} y2={y(data.majorityPosition)} className={styles.majorityLine} />
      </>}
      <text x={x - 27} y={floor + 4} textAnchor="end" className={styles.axisLabel}>0</text>
      <line x1={x} x2={x + width} y1={floor} y2={floor} className={styles.axis} />
    </svg>
    <figcaption><span><i className={styles.quorumKey} />420,000 ZEC minimum</span><span><i className={styles.majorityKey} />50% of directional vote</span></figcaption>
    <p>Segments are to scale. Voting power in ZEC, not a count of people.</p>
  </figure>;
}

export function ProposalDetail({ round, proposal, row, chain, digits, poll }: {
  round: Round; proposal: RoundProposal; row: VerifyRow; chain: ChainReport | null; digits: number; poll: boolean;
}) {
  const data = proposalDecision(round, row);
  const zec = (value: number) => formatZec(value, digits);
  const accept = round.ballot.find(o => o.key === "approve")?.label ?? "Accept";
  const hasAbstain = round.ballot.some(o => o.key === "abstain");
  const hasLower = round.ballot.some(o => o.key === "rejectLower");
  const approved = row.rule === "funded" || row.rule === "passed";
  const official = round.sources.find(s => /official results/i.test(s.label)) ?? round.sources[0];
  const chainId = VOTE_CHAIN_ROUNDS[round.id];
  const rawUrl = chain?.status === "ok" ? chain.url : chainId ? voteSummaryUrl(VOTE_CHAIN_HOSTS[0].origin, chainId) : null;
  const ordered = [...round.proposals].sort((a, b) => (a.question ?? 0) - (b.question ?? 0));
  const index = ordered.findIndex(p => p.id === proposal.id);
  const neighbors = [{ p: ordered[index - 1], label: "← Previous" }, { p: ordered[index + 1], label: "Next →" }];
  const result = !data ? "No published tally" : poll ? "Grant-rule comparison" : proposal.outcome === "vetoed" ? "Passed, then vetoed" : approved ? "Passed the vote" : "Did not pass the vote";
  return <div className={`${shared.page} ${styles.detail}`}>
    <nav className={styles.topNav} aria-label="Proposal navigation">
      <Link href={`/coinholders/results?round=${round.id}`}>← {round.label} results</Link>
      <a href="#verify-yourself">Verify it yourself ↓</a>
    </nav>
    <header className={styles.header}>
      <p className={styles.eyebrow}>Coinholder Grants / {poll ? "Program question" : "Proposal detail"}</p>
      <h1>{proposal.title}</h1>
      <div className={styles.meta}>
        <span>{round.label}</span>
        {proposal.question !== undefined && <span>Ballot #{proposal.question}</span>}
        {proposal.requestedUsdCents !== null && <span>Requested <strong>{(proposal.requestedUsdCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: proposal.requestedUsdCents % 100 ? 2 : 0 })}</strong></span>}
        <span className={styles.outcome}>Published: {OUTCOME_LABEL[proposal.outcome]}</span>
        {proposal.correction && <span>Corrected after publication</span>}
      </div>
      {proposal.applicant && <p className={styles.applicant}>{proposal.applicant}</p>}
    </header>

    <section className={styles.decision} aria-labelledby="decision-title">
      <div className={styles.chartPanel}>
        <h2 id="decision-title">The decision, at a glance</h2>
        {data ? <>
          <p className={styles.totalLabel}>Total vote volume</p>
          <p className={styles.total}>{zec(data.total)} <small>ZEC</small></p>
          <DecisionGraph data={data} digits={digits} />
        </> : <p className={styles.empty}>{proposal.outcome === "discarded" ? "FPF discarded this question. Its votes were not published, so no calculation is shown." : "A missing tally cannot be treated as zero votes. Use the published result and linked source records below."}</p>}
      </div>
      <div className={styles.explanation}>
        <div className={styles.verdict} data-tone={!data || poll || proposal.outcome === "vetoed" ? "neutral" : approved ? "positive" : "negative"}>
          <span className={styles.eyebrow}>{poll ? "For comparison only" : "Calculated vote result"}</span>
          <h2>{result}</h2>
          <p>{data ? `${data.approveShare === null ? "No directional votes were cast." : `${accept} received ${formatShare(data.approveShare)} of the directional vote.`}${poll ? " This poll set the program’s terms; this is not a grant approval decision." : ""}` : "The official status is kept separate from a calculation we cannot perform."}</p>
          {row.note && !proposal.correction && <p>{row.note.text} {row.note.href && <a href={row.note.href} target="_blank" rel="noreferrer">Source ↗</a>}</p>}
          {row.agrees === false && <p><strong>The calculation differs from the published result. Review the source before relying on this outcome.</strong></p>}
          {proposal.outcome === "funded" && <p className={styles.small}>“Funded” means approval, not proof of disbursement.</p>}
        </div>
        {data && <>
          <div className={styles.tests}>
            <div><span className={styles.testLabel}>01 / Participation <b>{data.quorumMet ? "Met" : "Not met"}</b></span><strong>{zec(data.total)} {data.quorumMet ? "≥" : "<"} {formatZec(QUORUM_ZEC)} ZEC</strong><p>{hasAbstain ? "Abstain included · FPF’s current rule." : "All options offered on this ballot."}</p></div>
            <div><span className={styles.testLabel}>02 / Simple majority <b>{data.majorityMet ? "Met" : "Not met"}</b></span><strong>{zec(row.accept!)} {data.majorityMet ? ">" : "≤"} {zec(data.rejected)} ZEC</strong><p>{accept} vs {hasLower ? "both Rejects" : "Reject"}.{hasAbstain ? " Abstain excluded." : ""} Ties fail.</p></div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.tally}>
              <caption>Full tally <small>ZEC · % of all votes</small></caption>
              <thead><tr><th scope="col">Option</th><th scope="col">ZEC</th><th scope="col">Share</th></tr></thead>
              <tbody>{data.options.map(option => <tr key={option.key}><th scope="row"><i className={styles[option.key]} />{shortOption(option.key, option.label)}</th><td>{zec(option.value)}</td><td>{option.share === null ? "—" : formatShare(option.share)}</td></tr>)}</tbody>
              <tfoot><tr><th scope="row">Total</th><td>{zec(data.total)}</td><td>{data.total > 0 ? "100%" : "—"}</td></tr></tfoot>
            </table>
          </div>
        </>}
      </div>
    </section>

    {data && <section className={styles.arithmetic} aria-labelledby="calculation-title">
      <h2 id="calculation-title">Follow the arithmetic</h2>
      <ol>
        <li><span>01 / {hasLower ? "Rejects combined" : "Reject"}</span><p>{zec(row.reject!)}{hasLower ? ` + ${zec(row.lower ?? 0)}` : ""}</p><strong>= {zec(data.rejected)} ZEC</strong></li>
        <li><span>02 / Directional vote</span><p>{zec(row.accept!)} + {zec(data.rejected)}</p><strong>= {zec(data.directional)} ZEC</strong></li>
        <li><span>03 / {accept} share</span><p>{zec(row.accept!)} ÷ {zec(data.directional)}</p><strong>{data.approveShare === null ? "Undefined · no directional votes" : `= ${formatShare(data.approveShare)}`}</strong></li>
        <li><span>04 / Strict majority cutoff</span><p>{zec(data.directional)} ÷ 2</p><strong>= {formatZec(data.majorityCutoff, digits + 1)} ZEC</strong><small>{accept} must be above this value.</small></li>
      </ol>
    </section>}

    <section id="verify-yourself" className={styles.verify} aria-labelledby="verify-title">
      <div className={styles.verifyHead}><div><p className={styles.eyebrow}>Source records / reproducible checks</p><h2 id="verify-title">Verify it yourself</h2></div><Link href={`/coinholders/verify?round=${round.id}`}>Check the whole round →</Link></div>
      <div className={styles.sourcesGrid}>
        <div><h3>The counting rule</h3><p>ZIP 1016 sets the 420,000 ZEC minimum and a simple majority. It does not explicitly define Abstain’s treatment.</p><p><strong>FPF’s current counting rule</strong> includes explicit Abstain in participation and excludes it from the majority. FPF clarified this on October 2, 2026 and said the Q4 voting announcement will state it.</p><p>For Q3, Abstain was an explicit choice, not a default.{round.id === "q1-2026" ? " Q1 used a different ballot interface with Abstain as the default; do not apply the Q3 interface description to Q1." : ""}</p><p className={styles.links}><a href={ZIP_1016_RULE.href} target="_blank" rel="noreferrer">ZIP 1016 ↗</a><a href={ZIP_1016_RULE.participationConfirmedBy.href} target="_blank" rel="noreferrer">FPF clarification · Oct 2 ↗</a></p></div>
        <div><h3>The tally and published outcome</h3>
          <p>{chain?.status === "ok" ? `Compared with ${chain.hostName}’s finalized summary, fetched ${utcTime(chain.fetchedAt)}.` : chain ? "The vote-chain comparison is unavailable on this visit. The figures above are OpenZcash’s recorded tally, not a fresh verification." : "Figures are OpenZcash’s copy of the historical source tally. Use the recount tools for this round to verify the ballots independently."}</p>
          {row.matchesChain !== null && <p className={styles.match} data-ok={row.matchesChain}>{row.matchesChain ? "✓ Every option matches the vote-chain summary." : "Tally mismatch: the source and this record differ. Review the round’s full comparison."}</p>}
          {chain?.status === "ok" && <details><summary>SHA-256 of the source response</summary><code className={styles.hash}>{chain.sha256}</code></details>}
          <p className={styles.small}>A matching hash identifies the same bytes. This does not re-tally encrypted ballots or identify individual voters.</p>
          <p className={styles.links}>{rawUrl && <a href={rawUrl} target="_blank" rel="noreferrer">Raw vote-chain tally ↗</a>}{round.talliesSource && !rawUrl && <a href={round.talliesSource.href} target="_blank" rel="noreferrer">Source tally ↗</a>}{official && <a href={official.href} target="_blank" rel="noreferrer">Published result ↗</a>}</p>
        </div>
      </div>
      <div className={styles.downloads}><span>Complete round data</span><a href={verifyApiPath(round.id, "csv")}>CSV ↓</a><a href={verifyApiPath(round.id, "json")}>JSON ↓</a><a href={SCRIPT_PATH}>Verification script ↓</a></div>
      {rawUrl && row.ballot !== null && <details className={styles.reproduce}><summary>Read this ballot directly from the source</summary><p>Requires curl and jq. The chain records eighths of a ZEC, so each option is divided by 8.</p><CodeBlock wrap label={`Read ballot ${row.ballot} from the vote chain`} code={`curl -fsS '${rawUrl}' | jq '.proposals[] | select(.id == ${row.ballot}) | {ballot: .id, options: [.options[] | {option: .label, zec: ((.total_value // 0) / 8)}]}'`} /></details>}
    </section>
    {(proposal.correction || proposal.notes?.length || proposal.links.length) ? <section className={styles.context}><h2>Proposal & context</h2>{proposal.correction && row.note && <p>{row.note.text} {row.note.href && <a href={row.note.href} target="_blank" rel="noreferrer">FPF correction ↗</a>}</p>}{proposal.notes?.map(note => <p key={note}>{note}</p>)}<p className={styles.links}>{proposal.links.map(link => <a key={link.href} href={link.href} target="_blank" rel="noreferrer">{link.label} ↗</a>)}</p></section> : null}
    <nav className={styles.neighbors} aria-label="Other proposals">{neighbors.map(({ p, label }) => p ? <Link key={label} href={proposalVerifyHref(round.id, p.id)}><small>{label}</small><span>{p.title}</span></Link> : <span key={label} />)}</nav>
  </div>;
}
