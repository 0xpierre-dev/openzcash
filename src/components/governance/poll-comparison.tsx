"use client";
import { useSearchParams } from "next/navigation";
import { comparisons, formatVotingWeight, formatVoteShare, questionResult } from "@/lib/governance/comparisons";
import styles from "./poll-comparison.module.css";

export function PollComparison() {
  const params = useSearchParams();
  const exclude = params.get("basis") === "expressed";
  const round = comparisons.rounds.find(item => item.id === params.get("round")) ?? comparisons.rounds[0];
  const question = round.questions.find(item => item.id === params.get("question")) ?? round.questions[0];
  const results = round.bodies.map(body => ({ body, ...questionResult(question, body.id, exclude) }));
  const complete = results.every(result => result.leaders.length === 1);
  const aligned = complete && results.every(result => result.leaders[0] === results[0].leaders[0]);
  function select(key: string, value: string) {
    const next = new URLSearchParams(params.toString()); next.set(key, value);
    if (key === "round") next.delete("question");
    window.history.replaceState(null, "", `?${next.toString()}#poll-comparison`);
  }
  return <section className={styles.panel} id="poll-comparison" aria-labelledby="comparison-title">
    <div className={styles.heading}><div><p className={styles.eyebrow}>Governance / compare the evidence</p><h2 id="comparison-title">How the panels voted.</h2><p>One question at a time, with the voting rules in view.</p></div><span className={styles.reviewed}>Reviewed {comparisons.checkedAt}</span></div>
    <div className={styles.controls}>
      {comparisons.rounds.length > 1 ? <label>Published round<select value={round.id} onChange={event => select("round", event.target.value)}>{comparisons.rounds.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label> : <div className={styles.roundLabel}><span>Published round</span><strong>{round.title}</strong></div>}
      <label>Question<select value={question.id} onChange={event => select("question", event.target.value)}>{round.questions.map((item, index) => <option key={item.id} value={item.id}>Q{index + 1} · {item.title}</option>)}</select></label>
      <label>Percentage basis<select value={exclude ? "expressed" : "recorded"} onChange={event => select("basis", event.target.value)}><option value="recorded">Include abstentions</option><option value="expressed">Exclude abstentions</option></select></label>
    </div>
    <div className={styles.readout} aria-live="polite"><strong>{question.title}</strong><span>{complete ? aligned ? "Same leading option" : "Different leading options" : "No single leader established"}</span></div>
    <div className={styles.bodies}>{results.map(result => <div key={result.body.id} data-body={result.body.id}>
      <h3><i aria-hidden />{result.body.name}</h3><p>{result.body.rule}</p><strong>{formatVotingWeight(result.denominator, result.body.decimals)} <small>{result.body.unit}</small></strong><span>{exclude ? "excluding recorded abstentions" : "recorded on this question, including abstentions"}</span>
    </div>)}</div>
    <div className={styles.chart} aria-label={`Option shares for ${question.title}`}>
      {question.options.filter(option => !exclude || !option.abstention).map(option => <div className={styles.option} key={option.id}><div className={styles.optionName}>{option.label}</div><div className={styles.bars}>{results.map(result => {
        const value = result.options.find(item => item.id === option.id)!;
        return <div className={styles.barRow} key={result.body.id} data-body={result.body.id}><span>{result.body.name}</span><div className={styles.track} aria-hidden><i style={{ width: `${value.percent ?? 0}%`, minWidth: value.percent !== null && value.weight !== null && BigInt(value.weight) > 0n ? 1 : 0 }} /></div><strong>{formatVoteShare(value.percent, value.weight, result.denominator)}</strong></div>;
      })}</div></div>)}
    </div>
    <p className={styles.caveat}>Shares use each body’s own recorded {exclude ? "non-abstaining " : ""}weight. These percentages are not turnout, a combined result or a measure of all Zcash users.</p>
    <details className={styles.details}><summary>Exact tallies, participation & sources</summary><div className={styles.rawTable}><table><caption>{question.title} · all options, including abstentions</caption><thead><tr><th scope="col">Option</th>{round.bodies.map(body => <th scope="col" key={body.id}>{body.name} · {body.unit}</th>)}</tr></thead><tbody>{question.options.map((option, index) => <tr key={option.id}><th scope="row">{option.label}</th>{round.bodies.map(body => <td key={body.id}>{formatVotingWeight(question.weights[body.id][index], body.decimals)}</td>)}</tr>)}</tbody></table></div>
      <div className={styles.sourceGrid}>{round.bodies.map(body => <div key={body.id}><h3>{body.name}</h3><p>{body.participation}</p><a href={body.sourceUrl} target="_blank" rel="noreferrer">Published results ↗</a> · <a href={body.tallyUrl} target="_blank" rel="noreferrer">Original tally ↗</a></div>)}</div>
      <p>{round.note}</p><p>Do not add weights across questions: the same voting weight may participate more than once. Matching choices or amounts do not identify voters or establish coordination.</p>
    </details>
  </section>;
}
