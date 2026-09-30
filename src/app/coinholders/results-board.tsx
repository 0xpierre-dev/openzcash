"use client";

import { useMemo, useState } from "react";
import type {
  BallotOption,
  Outcome,
  RoundProposal,
  Tally,
} from "@/lib/coinholder/types";
import {
  OUTCOME_LABEL,
  approvalShare,
  castZec,
  decidedZec,
  formatPct,
  formatZec,
  groupByOutcome,
} from "@/lib/coinholder/derive";
import styles from "./coinholders.module.css";

type Sort = "amount" | "approval" | "turnout" | "name";
const SORT_LABEL: Record<Sort, string> = {
  amount: "Requested amount",
  approval: "Approval share",
  turnout: "ZEC for or against",
  name: "Name",
};
/** Below this share of the votes for or against, the lower-amount option is not called out. */
const LOWER_SIGNAL = 0.05;

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 ? 2 : 0,
  });

function VoteBar({ tally, ballot }: { tally: Tally; ballot: BallotOption[] }) {
  const total = castZec(tally);
  const share = approvalShare(tally);
  const decided = decidedZec(tally);
  const lower = tally.rejectLower ?? 0;
  const parts = ballot.map((o) => ({ ...o, zec: tally[o.key] ?? 0 }));
  const describe = parts
    .map((p) => `${p.label} ${formatZec(p.zec, 2)} ZEC`)
    .join(", ");
  return (
    <div className={styles.vote}>
      <div
        className={styles.voteBar}
        role="img"
        aria-label={`Vote: ${describe}.`}
      >
        {parts.map((p) =>
          total > 0 && p.zec > 0 ? (
            <span
              key={p.key}
              className={styles[`v_${p.key}`]}
              style={{ width: `${(p.zec / total) * 100}%` }}
              title={`${p.label}: ${formatZec(p.zec, 2)} ZEC`}
            />
          ) : null,
        )}
      </div>
      <p className={styles.voteLine}>
        <span>
          {share === null ? (
            "No votes for or against"
          ) : (
            <>
              <strong>{formatPct(share)}</strong>{" "}
              {ballot[0]?.label.toLowerCase() ?? "approve"}
            </>
          )}
        </span>
        <span>
          {formatZec(decided)} ZEC for or against
          {tally.abstain > 0 ? ` · ${formatZec(tally.abstain)} abstain` : ""}
        </span>
      </p>
      {decided > 0 && lower / decided >= LOWER_SIGNAL ? (
        <p className={styles.signal}>
          {formatPct(lower / decided)} asked for a lower amount (
          {formatZec(lower)} ZEC)
        </p>
      ) : null}
    </div>
  );
}

function Row({
  p,
  ballot,
  showAmount,
}: {
  p: RoundProposal;
  ballot: BallotOption[];
  showAmount: boolean;
}) {
  return (
    <li className={styles.row} data-amount={showAmount || undefined}>
      <div className={styles.rowTitle}>
        <span
          className={`${styles.dot} ${styles[`o_${p.outcome}`]}`}
          aria-hidden
        />
        <div className={styles.rowText}>
          <p className={styles.name}>
            {p.question ? (
              <span className={styles.qnum} title="Ballot number">#{p.question} · </span>
            ) : null}
            {p.title}
          </p>
          <p className={styles.applicant}>
            <span className="sr-only">
              Outcome: {OUTCOME_LABEL[p.outcome]}.{" "}
            </span>
            {p.applicant ?? p.summary ?? ""}
          </p>
          {p.notes?.map((n) => (
            <p key={n} className={styles.note}>
              {n}
            </p>
          ))}
          {p.correction ? (
            <p className={styles.dispute}>
              <strong>Result corrected.</strong> {p.correction.text}{" "}
              <a href={p.correction.href} target="_blank" rel="noreferrer">FPF&apos;s reply ↗</a>
            </p>
          ) : null}
          {p.dispute ? (
            <p className={styles.dispute}>
              <strong>Result disputed on the forum.</strong> {p.dispute.by} argued that, {p.dispute.text}{" "}
              <a href={p.dispute.href} target="_blank" rel="noreferrer">Read the post ↗</a>
            </p>
          ) : null}
        </div>
      </div>
      {showAmount ? (
        <p className={styles.amount}>
          {p.requestedUsdCents === null ? "·" : usd(p.requestedUsdCents)}
          <small>
            {p.requestedNote ??
              (p.requestedUsdCents === null ? "no request" : "requested")}
          </small>
        </p>
      ) : null}
      {p.tally ? (
        <VoteBar tally={p.tally} ballot={ballot} />
      ) : (
        <p className={`${styles.vote} ${styles.voteMissing}`}>
          No tally published.
        </p>
      )}
      {p.links.length ? (
        <p className={styles.rowLinks}>
          {p.links.map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noreferrer">
              {l.label} ↗
            </a>
          ))}
        </p>
      ) : (
        <span />
      )}
    </li>
  );
}

/** Filter by outcome, search and sort in one quiet row; groups keep the order of the results post (funded first). */
export function ResultsBoard({
  proposals,
  ballot,
}: {
  proposals: RoundProposal[];
  ballot: BallotOption[];
}) {
  const [filter, setFilter] = useState<Outcome | "all">("all");
  const [sort, setSort] = useState<Sort>("amount");
  const [query, setQuery] = useState("");
  const hasTallies = proposals.some((p) => p.tally);
  const showAmount = proposals.some((p) => p.requestedUsdCents !== null);
  const sorts = (Object.keys(SORT_LABEL) as Sort[]).filter(
    (s) =>
      (showAmount || s !== "amount") &&
      (hasTallies || (s !== "approval" && s !== "turnout")),
  );
  // The list follows what the select shows: a sort this round cannot offer falls back to the first one it can.
  const activeSort = sorts.includes(sort) ? sort : sorts[0];
  const sorted = useMemo(() => {
    const key = (p: RoundProposal): number | string => {
      if (activeSort === "name") return p.title.toLowerCase();
      if (activeSort === "amount") return -(p.requestedUsdCents ?? -1);
      if (activeSort === "approval")
        return -(p.tally ? (approvalShare(p.tally) ?? -1) : -1);
      return -(p.tally ? decidedZec(p.tally) : -1);
    };
    return [...proposals].sort((a, b) => {
      const ka = key(a),
        kb = key(b);
      return ka < kb ? -1 : ka > kb ? 1 : (a.question ?? 0) - (b.question ?? 0);
    });
  }, [proposals, activeSort]);
  const q = query.trim().toLowerCase();
  const matches = (p: RoundProposal) =>
    !q || `${p.title} ${p.applicant ?? ""}`.toLowerCase().includes(q);
  const groups = groupByOutcome(sorted.filter(matches))
    .filter((g) => filter === "all" || g.outcome === filter);
  const shown = groups.reduce((n, g) => n + g.rows.length, 0);
  const counts = groupByOutcome(proposals).map((g) => ({
    outcome: g.outcome,
    n: g.rows.length,
  }));
  const chips = counts.length > 1;
  // A poll (no money asked) is made of questions, not proposals.
  const noun = showAmount ? "proposals" : "questions";

  return (
    <>
      <div className={styles.boardBar}>
        <div className={styles.boardControls}>
          {chips ? (
            <div
              className={styles.segmented}
              role="group"
              aria-label="Filter by outcome"
            >
              <button
                type="button"
                className={styles.segment}
                aria-pressed={filter === "all"}
                onClick={() => setFilter("all")}
              >
                All <span className={styles.segmentCount}>{proposals.length}</span>
              </button>
              {counts.map((c) => (
                <button
                  key={c.outcome}
                  type="button"
                  className={styles.segment}
                  aria-pressed={filter === c.outcome}
                  onClick={() => setFilter(c.outcome)}
                >
                  <span
                    className={`${styles.dot} ${styles[`o_${c.outcome}`]}`}
                    aria-hidden
                  />
                  {OUTCOME_LABEL[c.outcome]}{" "}
                  <span className={styles.segmentCount}>{c.n}</span>
                </button>
              ))}
            </div>
          ) : null}
          <label className={`ws-field ${styles.boardSearch}`}>
            <span aria-hidden>⌕</span>
            <input
              type="search"
              aria-label={showAmount ? "Search proposals or applicants" : "Search questions"}
              placeholder={showAmount ? "Search proposals or applicants" : "Search questions"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {sorts.length > 1 ? (
            <label className={styles.boardSort}>
              <span>Sort</span>
              <select
                value={activeSort}
                onChange={(e) => setSort(e.target.value as Sort)}
              >
                {sorts.map((s) => (
                  <option key={s} value={s}>
                    {SORT_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        {hasTallies ? (
          <div className={styles.boardFoot}>
            <ul className={styles.voteLegend} aria-label="Vote bar legend">
              {ballot.map((o) => (
                <li key={o.key}>
                  <span
                    className={`${styles.dot} ${styles[`v_${o.key}`]}`}
                    aria-hidden
                  />
                  {o.label}
                </li>
              ))}
            </ul>
            <p className={styles.boardCount} aria-live="polite">
              {shown === proposals.length
                ? `${shown} ${noun}`
                : `${shown} of ${proposals.length} ${noun}`}
            </p>
          </div>
        ) : null}
      </div>
      {shown === 0 ? (
        <p className={styles.boardEmpty}>
          No {showAmount ? "proposal" : "question"} matches
          {q ? ` “${query.trim()}”` : " this filter"}.
        </p>
      ) : null}
      {groups.map((g) => (
        <section
          key={g.outcome}
          className={styles.group}
          aria-labelledby={`group-${g.outcome}`}
        >
          <h3 id={`group-${g.outcome}`} className={styles.groupHead}>
            {OUTCOME_LABEL[g.outcome]}
            {/* With filter chips, each chip already carries the count. */}
            {chips ? null : <span>{g.rows.length}</span>}
          </h3>
          <ul className={styles.list}>
            {g.rows.map((p) => (
              <Row key={p.id} p={p} ballot={ballot} showAmount={showAmount} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
