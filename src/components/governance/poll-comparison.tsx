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
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    if (key === "round") next.delete("question");
    window.history.replaceState(null, "", `?${next.toString()}#poll-comparison`);
  }

  return (
    <section className={styles.panel} id="poll-comparison" aria-labelledby="comparison-title">
      <div className={styles.heading}>
        <div>
          <h2 id="comparison-title">How the panels voted</h2>
          {comparisons.rounds.length === 1 && <p>{round.title}</p>}
        </div>
        <span className={styles.reviewed}>Reviewed <time dateTime={comparisons.checkedAt}>{comparisons.checkedAt}</time></span>
      </div>

      <div className={styles.controls}>
        {comparisons.rounds.length > 1 && (
          <label>Published round
            <select value={round.id} onChange={event => select("round", event.target.value)}>
              {comparisons.rounds.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
        )}
        <label>Question
          <select value={question.id} onChange={event => select("question", event.target.value)}>
            {round.questions.map((item, index) => <option key={item.id} value={item.id}>Q{index + 1} · {item.title}</option>)}
          </select>
        </label>
        <label>Percentage basis
          <select value={exclude ? "expressed" : "recorded"} onChange={event => select("basis", event.target.value)}>
            <option value="recorded">Include abstentions</option>
            <option value="expressed">Exclude abstentions</option>
          </select>
        </label>
      </div>

      <div className={styles.readout} aria-live="polite" aria-atomic="true">
        <h3>{question.title}</h3>
        <span>{complete ? aligned ? "Same leading option" : "Different leading options" : "No single leader established"}</span>
      </div>

      <div className={styles.chart}>
        <table aria-label={`Option shares for ${question.title}`} aria-describedby="comparison-basis comparison-caveat">
          <colgroup><col className={styles.optionColumn} />{results.map(result => <col key={result.body.id} />)}</colgroup>
          <thead>
            <tr>
              <th scope="col" className={styles.optionHeader}>Option<span>Share within each panel</span></th>
              {results.map(result => (
                <th scope="col" key={result.body.id} data-body={result.body.id}>
                  <span className={styles.bodyName}><i aria-hidden="true" />{result.body.name}</span>
                  <strong className={styles.total}>{formatVotingWeight(result.denominator, result.body.decimals)} <small>{result.body.unit}</small></strong>
                  <span className={styles.rule}>{result.body.unit === "votes" ? "Member ballots" : "ZEC-weighted"}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {question.options.filter(option => !exclude || !option.abstention).map(option => (
              <tr key={option.id} data-abstention={option.abstention || undefined}>
                <th scope="row">{option.label}</th>
                {results.map(result => {
                  const value = result.options.find(item => item.id === option.id)!;
                  const leading = result.leaders.includes(option.id);
                  return (
                    <td key={result.body.id} data-body={result.body.id} data-leading={leading || undefined}>
                      <div className={styles.barRow}>
                        <div className={styles.track} aria-hidden="true"><i style={{ width: `${value.percent ?? 0}%`, minWidth: value.percent !== null && value.weight !== null && BigInt(value.weight) > 0n ? 1 : 0 }} /></div>
                        <strong>{formatVoteShare(value.percent, value.weight, result.denominator)}</strong>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p id="comparison-basis" className={styles.basis}>Totals and percentages {exclude ? "exclude" : "include"} abstentions for this question.</p>
      <p id="comparison-caveat" className={styles.caveat}>Each panel uses its own total. Shares are not turnout or a combined result; a leading option does not establish approval.</p>

      <details className={styles.details}>
        <summary>Verify the numbers <span>Exact tallies, rules & sources</span></summary>
        <div className={styles.rawTable}>
          <table>
            <caption>{question.title} · all options, including abstentions</caption>
            <thead><tr><th scope="col">Option</th>{round.bodies.map(body => <th scope="col" key={body.id}>{body.name} · {body.unit}</th>)}</tr></thead>
            <tbody>{question.options.map((option, index) => <tr key={option.id}><th scope="row">{option.label}</th>{round.bodies.map(body => <td key={body.id}>{formatVotingWeight(question.weights[body.id][index], body.decimals)}</td>)}</tr>)}</tbody>
          </table>
        </div>
        <div className={styles.sourceGrid}>
          {round.bodies.map(body => <div key={body.id}><h3>{body.name}</h3><p>{body.rule} {body.participation}</p><a href={body.sourceUrl} target="_blank" rel="noreferrer">Published results ↗</a> · <a href={body.tallyUrl} target="_blank" rel="noreferrer">Original tally ↗</a></div>)}
        </div>
        <p>{round.note}</p>
        <p>Do not add weights across questions: the same voting weight may participate more than once. These shares do not represent all Zcash users. Matching choices or amounts do not identify voters or establish coordination.</p>
      </details>
    </section>
  );
}
