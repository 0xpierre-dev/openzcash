import { OUTCOME_LABEL, formatZec } from "@/lib/coinholder/derive";
import Link from "next/link";
import { proposalVerifyHref } from "@/lib/coinholder/proposal-decision";
import {
  RULE_LABEL,
  type RoundCheck,
  type RuleOutcome,
  type VerifyRow,
} from "@/lib/coinholder/verify";
import { formatShare } from "@/lib/coinholder/verify-view";
import type { BallotOption } from "@/lib/coinholder/types";
import styles from "../coinholders.module.css";
import own from "./verify-table.module.css";

type OptionColumn = {
  key: "accept" | "reject" | "lower" | "abstain";
  label: string;
};

/** Table columns for the options the round's ballot offered, named as briefly as the ballot allows. */
function optionColumns(ballot: BallotOption[]): OptionColumn[] {
  const short = (label: string) => label.split(" · ")[0];
  return ballot.map((o) => {
    if (o.key === "approve") return { key: "accept", label: short(o.label) };
    if (o.key === "rejectLower") return { key: "lower", label: "Lower" };
    if (o.key === "abstain") return { key: "abstain", label: "Abstain" };
    return { key: "reject", label: short(o.label) };
  });
}

const RULE_SWATCH: Record<RuleOutcome, string> = {
  funded: styles.o_funded,
  passed: styles.o_passed,
  rejected: styles.o_rejected,
  not_passed: styles.o_rejected,
};

/** What the columns mean, in one quiet line above the table. */
function TableKey({
  cols,
  accept,
  compared,
  flush,
}: {
  cols: OptionColumn[];
  accept: string;
  compared: boolean;
  flush: boolean;
}) {
  const abstain = cols.some((c) => c.key === "abstain");
  return (
    <ul
      className={`${styles.voteLegend} ${own.tableKey}`}
      data-flush={flush || undefined}
      aria-label="Table key"
    >
      <li>ZEC per option</li>
      {cols.some((c) => c.key === "lower") ? (
        <li>Lower is Reject, would reconsider at a lower amount</li>
      ) : null}
      <li>
        {accept} share is the part of the ZEC for or against that chose {accept}
        {abstain ? ", Abstain left out" : ""}
      </li>
      <li>
        Rule is ZIP 1016 applied to the tally; ✓ where the published outcome
        agrees
      </li>
      {compared ? (
        <li>Chain ✓ where all options equal the vote chain&apos;s</li>
      ) : null}
    </ul>
  );
}

function Mark({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <>
      <span className={ok ? own.markOk : own.markBad} aria-hidden>
        {ok ? "✓" : "✕"}
      </span>
      <span className="sr-only">{ok ? yes : no} </span>
    </>
  );
}

function Published({ r }: { r: VerifyRow }) {
  return (
    <span className={own.published}>
      {r.agrees === null ? null : (
        <Mark
          ok={r.agrees}
          yes="Agrees with the rule:"
          no="Differs from the rule:"
        />
      )}
      {OUTCOME_LABEL[r.published]}
    </span>
  );
}

/** A correction, veto or discard, under the title as on the Results page. */
function Note({ note }: { note: NonNullable<VerifyRow["note"]> }) {
  return (
    <span className={own.note}>
      {note.text}{" "}
      {note.href ? (
        <a href={note.href} target="_blank" rel="noreferrer">
          Source ↗
        </a>
      ) : null}
    </span>
  );
}

/**
 * Every question of a round: the ZEC for each option, ZIP 1016 applied, the
 * published outcome and, when compared, the vote chain. `flush` drops the
 * table's own frame inside a card that draws one.
 */
export function VerifyTable({
  check,
  ballot,
  digits,
  flush = false,
}: {
  check: RoundCheck;
  ballot: BallotOption[];
  digits: number;
  flush?: boolean;
}) {
  const cols = optionColumns(ballot);
  const compared = check.counts.chainChecked !== null;
  const zec = (v: number | null) => (v === null ? "·" : formatZec(v, digits));
  const noun = check.kind === "poll" ? "Question" : "Proposal";
  const accept = cols.find((c) => c.key === "accept")?.label ?? "Accept";
  // A four-option ballot needs about 1,065px before its table fits; fewer options fit from 760px.
  const wide = cols.length >= 4;
  return (
    <>
      <TableKey cols={cols} accept={accept} compared={compared} flush={flush} />
      <div
        className={`${styles.historyWrap} ${own.tableWrap}`}
        data-wide={wide || undefined}
        data-flush={flush || undefined}
      >
        <table className={own.table}>
          <caption className="sr-only">
            {check.rows.length} {noun.toLowerCase()}s: ZEC for each option, the
            ZIP 1016 outcome and the published outcome
          </caption>
          <thead>
            <tr>
              <th scope="col" className={own.ballotCell}>
                #
              </th>
              <th scope="col">{noun}</th>
              {cols.map((c) => (
                <th key={c.key} scope="col" className={own.num}>
                  {c.label}
                </th>
              ))}
              <th scope="col" className={own.num}>
                Total
              </th>
              <th scope="col" className={own.num}>
                {accept} share
              </th>
              <th scope="col">Rule</th>
              <th scope="col">Published</th>
              {compared ? <th scope="col">Chain</th> : null}
            </tr>
          </thead>
          <tbody>
            {check.rows.map((r) => (
              <tr key={r.id}>
                <td className={own.ballotCell} data-label="#">
                  {r.ballot ?? "·"}
                </td>
                <th scope="row" className={own.proposal}>
                  <Link className={own.title} href={proposalVerifyHref(check.roundId, r.id)}>
                    {r.ballot !== null ? (
                      <span className={own.phoneOnly}>#{r.ballot} · </span>
                    ) : null}
                    {r.title}
                  </Link>
                  {r.applicant ? (
                    <span className={own.sub}>{r.applicant}</span>
                  ) : null}
                  {r.note ? <Note note={r.note} /> : null}
                  {r.matchesChain === false ? (
                    <span className={own.mismatch}>
                      {r.chain
                        ? `Vote chain: ${cols.map((c) => `${c.label} ${zec(r.chain![c.key])}`).join(" · ")}`
                        : "Not on the vote chain"}
                    </span>
                  ) : null}
                </th>
                {cols.map((c) => (
                  <td
                    key={c.key}
                    className={own.num}
                    data-label={c.label}
                    data-empty={r[c.key] === null || undefined}
                  >
                    {zec(r[c.key])}
                  </td>
                ))}
                <td
                  className={own.num}
                  data-label="Total"
                  data-empty={r.total === null || undefined}
                >
                  {zec(r.total)}
                </td>
                <td
                  className={own.num}
                  data-label={`${accept} share`}
                  data-empty={r.approveShare === null || undefined}
                >
                  {r.approveShare === null ? "·" : formatShare(r.approveShare)}
                </td>
                <td data-label="Rule" data-empty={r.rule === null || undefined}>
                  {r.rule ? (
                    <span className={styles.outcomeTag}>
                      <span
                        className={`${styles.swatch} ${RULE_SWATCH[r.rule]}`}
                        aria-hidden
                      />
                      {RULE_LABEL[r.rule]}
                    </span>
                  ) : (
                    "·"
                  )}
                </td>
                <td data-label="Published">
                  <Published r={r} />
                </td>
                {compared ? (
                  <td
                    data-label="Chain"
                    data-empty={r.matchesChain === null || undefined}
                  >
                    {r.matchesChain === null ? (
                      "·"
                    ) : (
                      <>
                        <Mark
                          ok={r.matchesChain}
                          yes="Matches the vote chain"
                          no="Differs from the vote chain"
                        />
                        <span
                          className={`${own.phoneOnly} ${own.chainWord}`}
                          aria-hidden
                        >
                          {r.matchesChain ? "matches" : "differs"}
                        </span>
                      </>
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
