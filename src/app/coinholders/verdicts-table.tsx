"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { tableCsv } from "@/lib/table-csv";
import type { Outcome } from "@/lib/coinholder/types";
import { OUTCOME_LABEL, formatPct, formatZec } from "@/lib/coinholder/derive";
import styles from "./coinholders.module.css";

/** One question of one round, flattened for the cross-round table. */
export type VerdictRow = {
  key: string;
  roundId: string;
  roundLabel: string;
  roundHref: string;
  question: number | null;
  title: string;
  applicant: string | null;
  requestedUsdCents: number | null;
  outcome: Outcome;
  approvalShare: number | null;
  decidedZec: number | null;
  abstainZec: number | null;
  href: string | null;
  corrected: boolean;
};

type Sort = "round" | "amount" | "approval" | "name";
const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 ? 2 : 0,
  });

/** Every question of every round: search, filter by round or outcome, sort, export. */
export function VerdictsTable({
  rows,
  rounds,
}: {
  rows: VerdictRow[];
  rounds: { id: string; label: string }[];
}) {
  const [query, setQuery] = useState("");
  const [round, setRound] = useState("all");
  const [outcome, setOutcome] = useState<Outcome | "all">("all");
  const [sort, setSort] = useState<Sort>("round");
  const order = useMemo(
    () => new Map(rounds.map((r, i) => [r.id, i])),
    [rounds],
  );
  const outcomes = useMemo(
    () => [...new Set(rows.map((r) => r.outcome))],
    [rows],
  );
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (round === "all" || r.roundId === round) &&
        (outcome === "all" || r.outcome === outcome) &&
        (!q || `${r.title} ${r.applicant ?? ""}`.toLowerCase().includes(q)),
    );
    const key = (r: VerdictRow): [number, number | string] => {
      if (sort === "amount") return [0, -(r.requestedUsdCents ?? -1)];
      if (sort === "approval") return [0, -(r.approvalShare ?? -1)];
      if (sort === "name") return [0, r.title.toLowerCase()];
      return [order.get(r.roundId) ?? 0, r.question ?? 0];
    };
    return [...list].sort((a, b) => {
      const [a1, a2] = key(a),
        [b1, b2] = key(b);
      return a1 - b1 || (a2 < b2 ? -1 : a2 > b2 ? 1 : 0);
    });
  }, [rows, query, round, outcome, sort, order]);

  const exportCsv = () => {
    const csv = tableCsv(
      [
        "Round",
        "Ballot #",
        "Proposal",
        "Applicant",
        "Requested (USD)",
        "Outcome",
        "Approve share (of ZEC for or against)",
        "ZEC for or against",
        "ZEC abstain",
      ],
      shown.map((r) => [
        r.roundLabel,
        r.question ? String(r.question) : "",
        r.title,
        r.applicant ?? "",
        r.requestedUsdCents === null
          ? ""
          : (r.requestedUsdCents / 100).toFixed(2),
        OUTCOME_LABEL[r.outcome],
        r.approvalShare === null ? "" : formatPct(r.approvalShare),
        r.decidedZec === null ? "" : r.decidedZec.toFixed(3),
        r.abstainZec === null ? "" : r.abstainZec.toFixed(3),
      ]),
    );
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "coinholder-verdicts.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className={styles.boardBar}>
        <div className={styles.boardControls}>
          <label className={`ws-field ${styles.boardSearch}`}>
            <span aria-hidden>⌕</span>
            <input
              type="search"
              aria-label="Search proposals or applicants"
              placeholder="Search proposals or applicants"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className={styles.boardSort}>
            <span>Round</span>
            <select value={round} onChange={(e) => setRound(e.target.value)}>
              <option value="all">All rounds</option>
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.boardSort}>
            <span>Outcome</span>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as Outcome | "all")}
            >
              <option value="all">All outcomes</option>
              {outcomes.map((o) => (
                <option key={o} value={o}>
                  {OUTCOME_LABEL[o]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.boardSort}>
            <span>Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
            >
              <option value="round">Round and ballot order</option>
              <option value="amount">Requested amount</option>
              <option value="approval">Approval share</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>
        <div className={styles.boardFoot}>
          <button type="button" className={styles.boardButton} onClick={exportCsv}>
            ↓ Export CSV
          </button>
          <p className={styles.boardCount} aria-live="polite">
            {shown.length === rows.length
              ? `${rows.length} verdicts`
              : `${shown.length} of ${rows.length} verdicts`}
          </p>
        </div>
      </div>
      <div className={styles.historyWrap}>
        <table className={styles.history}>
          <caption className="sr-only">
            Every coinholder verdict, {shown.length} shown
          </caption>
          <thead>
            <tr>
              <th scope="col">Proposal</th>
              <th scope="col">Round</th>
              <th scope="col" className={styles.num}>
                Requested
              </th>
              <th scope="col">Outcome</th>
              <th scope="col" className={styles.num}>
                Approve
              </th>
              <th scope="col" className={styles.num}>
                ZEC for or against
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key}>
                <th scope="row" className={styles.wrapCell}>
                  {r.href ? (
                    <Link href={r.href}>
                      {r.title}
                    </Link>
                  ) : (
                    r.title
                  )}
                  <small className={styles.cellSub}>
                    {r.applicant ?? ""}
                    {r.corrected ? " · result corrected" : ""}
                  </small>
                </th>
                <td>
                  <Link href={r.roundHref} scroll={false}>
                    {r.roundLabel}
                  </Link>
                  {r.question ? <span> · #{r.question}</span> : null}
                </td>
                <td className={styles.num}>
                  {r.requestedUsdCents === null ? (
                    <span>·</span>
                  ) : (
                    usd(r.requestedUsdCents)
                  )}
                </td>
                <td>
                  <span className={styles.outcomeTag}>
                    <span
                      className={`${styles.swatch} ${styles[`o_${r.outcome}`]}`}
                      aria-hidden
                    />
                    {OUTCOME_LABEL[r.outcome]}
                  </span>
                </td>
                <td className={styles.num}>
                  {r.approvalShare === null ? (
                    <span>·</span>
                  ) : (
                    formatPct(r.approvalShare)
                  )}
                </td>
                <td className={styles.num}>
                  {r.decidedZec === null ? (
                    <span>·</span>
                  ) : (
                    formatZec(r.decidedZec)
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <span>No proposal matches these filters.</span>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
