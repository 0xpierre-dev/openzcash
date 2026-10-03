"use client";

import { useState } from "react";
import Link from "next/link";
import { proposalVerifyHref } from "@/lib/coinholder/proposal-decision";
import type {
  DecisionRow,
  DecisionSort,
  chartText,
} from "@/lib/coinholder/verify-view";
import shared from "../coinholders.module.css";
import styles from "./verify.module.css";

const SEGMENT: Record<DecisionRow["segments"][number]["key"], string> = {
  approve: shared.v_approve,
  reject: shared.v_reject,
  rejectLower: shared.v_rejectLower,
};
const OUTCOME: Record<DecisionRow["tone"], string> = {
  funded: shared.o_funded,
  passed: shared.o_passed,
  rejected: shared.o_rejected,
  not_passed: shared.o_rejected,
  none: shared.o_discarded,
};

function Row({ row, roundId }: { row: DecisionRow; roundId: string }) {
  return (
    <li className={styles.dRow} data-flag={row.flag?.tone}>
      <span className="sr-only">{row.description}</span>
      <Link className={styles.dLabel} href={proposalVerifyHref(roundId, row.id)} title={`Tally & decision: ${row.title}`}>
        {row.ballot !== null ? (
          <span className={styles.dNum}>#{row.ballot}</span>
        ) : null}
        <span className={styles.dName}>
          <span className={styles.dTitle}>{row.title}</span>
          {row.flag ? (
            <span className={styles.dFlag} data-tone={row.flag.tone}>
              {row.flag.tag}
            </span>
          ) : null}
        </span>
      </Link>
      <span className={styles.dBar} aria-hidden title={row.tooltip}>
        <span
          className={styles.dTrack}
          data-empty={!row.segments.length || undefined}
        >
          {row.segments.map((s) =>
            s.part > 0 ? (
              <span
                key={s.key}
                className={SEGMENT[s.key]}
                style={{ width: `${s.part * 100}%` }}
              />
            ) : null,
          )}
        </span>
        <span className={styles.dMid} />
      </span>
      <span className={styles.dOutcome} aria-hidden>
        <span className={styles.dWord} data-tone={row.tone}>
          <span className={`${shared.swatch} ${OUTCOME[row.tone]}`} />
          {row.outcome}
        </span>
        <span className={styles.dShare}>{row.shareText ?? ""}</span>
      </span>
      {row.flag ? (
        <p className={styles.dNote} data-tone={row.flag.tone}>
          {row.flag.text}{" "}
          {row.flag.href ? (
            <a href={row.flag.href} target="_blank" rel="noreferrer">
              Source ↗
            </a>
          ) : null}
        </p>
      ) : null}
    </li>
  );
}

/**
 * How each question was decided: one bar per question of the ZEC for or
 * against (Abstain left out), a line at 50%, and on the right the ZIP 1016
 * outcome with the Accept share. Sorted by that share, or by ballot number.
 */
export function DecisionChart({
  rows,
  orders,
  text,
  roundId,
}: {
  rows: DecisionRow[];
  roundId: string;
  /** Row ids in each order, sorted on the server. */
  orders: Record<DecisionSort, string[]>;
  text: ReturnType<typeof chartText>;
}) {
  const [sort, setSort] = useState<DecisionSort>("share");
  const heading = "decided";
  const byId = new Map(rows.map((r) => [r.id, r]));
  const sorted = orders[sort]
    .map((id) => byId.get(id))
    .filter((r): r is DecisionRow => Boolean(r));
  const choices: [DecisionSort, string][] = [
    ["share", text.sortShare],
    ["ballot", text.sortBallot],
  ];
  return (
    <section className={styles.chartCard} aria-labelledby={heading}>
      <div className={styles.chartHead}>
        <div>
          <h2 id={heading} className={styles.cardHeading}>
            {text.title}
          </h2>
          <p className={styles.cardSub}>{text.sub}</p>
        </div>
        <div className={styles.seg} role="group" aria-label="Sort by">
          {choices.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={sort === id}
              onClick={() => setSort(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <ol className={styles.decisions}>
        {sorted.map((r) => (
          <Row key={r.id} row={r} roundId={roundId} />
        ))}
      </ol>
      <ul className={styles.chartLegend} aria-label="Legend">
        {text.legend.map((l) => (
          <li key={l.key}>
            <span
              className={`${shared.swatch} ${SEGMENT[l.key]}`}
              aria-hidden
            />
            {l.name}
          </li>
        ))}
        <li>
          <span className={styles.midKey} aria-hidden />
          50%
        </li>
        <li className={styles.legendRight}>{text.right}</li>
      </ul>
    </section>
  );
}
