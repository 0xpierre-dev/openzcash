"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Animated terminal demo for the ZecHub Copilot: types the question, "fetches",
 * reveals the answer line by line, then loops. Every line is a real answer the
 * skill produced against the live DAO indexer (verified 2026-08-17 on proposal
 * A116, which failed at 66.67% — one hundredth of a point short of the bar).
 * Honors prefers-reduced-motion by rendering the full transcript statically.
 */

type Ev =
  | { kind: "cmd"; text: string }
  | { kind: "status"; text: string }
  | { kind: "line"; node: ReactNode }
  | { kind: "pause"; ms: number };

const Num = ({ v }: { v: string }) => (
  <span className="ws-t-usd">{v}</span>
);

const EVENTS: Ev[] = [
  {
    kind: "cmd",
    text: "Did the Zcash Ukraine proposal pass? It had twice as many yes as no",
  },
  { kind: "pause", ms: 300 },
  {
    kind: "status",
    text: "Reading A116 and its individual votes from the DAO indexer...",
  },
  {
    kind: "line",
    node: (
      <p>
        <span className="ws-t-neg">No. It failed.</span> A116
        &ldquo;Zcash Ukraine Regional Community Initiative&rdquo;:{" "}
        <Num v="12 yes" />, <Num v="6 no" />, 18 of 24 members voting
      </p>
    ),
  },
  {
    kind: "line",
    node: (
      <p>
        <span className="ws-t-accent">Quorum</span> 18/24 ={" "}
        <span className="ws-t-pos">75.0%</span> · needs 40% ·{" "}
        <span className="ws-t-pos">PASS</span>
      </p>
    ),
  },
  {
    kind: "line",
    node: (
      <p>
        <span className="ws-t-accent">Threshold</span> 12/18 ={" "}
        <span className="ws-t-neg">66.67%</span> · needs 67% ·{" "}
        <span className="ws-t-neg">FAIL</span>
      </p>
    ),
  },
  {
    kind: "line",
    node: (
      <p className="ws-t-dim">
        ZecHub needs <span className="ws-t-ink">67% of yes+no</span>, not
        a majority. One more yes (or one fewer no) and it passes.
      </p>
    ),
  },
  {
    kind: "line",
    node: (
      <p className="ws-t-dim">
        Not rare: <span className="ws-t-ink">25 proposals</span> have had
        a yes-majority and still lost.
      </p>
    ),
  },
  {
    kind: "line",
    node: (
      <p className="ws-t-note">
        sources: indexer.daodao.zone · daoProposalSingle/proposal ·
        daoProposalSingle/listVotes
      </p>
    ),
  },
];

const TYPE_MS = 26; // per character
const LINE_MS = 380; // per revealed answer line
const STATUS_MS = 900; // hold the "fetching" line
const LOOP_HOLD_MS = 6500; // hold the finished transcript, then restart

function Cursor() {
  return (
    <span className="ws-t-cursor" />
  );
}

export function Terminal() {
  // idx = fully completed events; typed = chars shown of the current cmd.
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState(0);
  const [cycle, setCycle] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Show the full transcript at once; defer the setState off the effect
      // body so it doesn't cascade a synchronous re-render.
      const t = setTimeout(() => setIdx(EVENTS.length), 0);
      return () => clearTimeout(t);
    }
    const ev = EVENTS[idx];
    let t: ReturnType<typeof setTimeout>;
    if (!ev) {
      t = setTimeout(() => {
        setIdx(0);
        setTyped(0);
        setCycle((c) => c + 1);
      }, LOOP_HOLD_MS);
    } else if (ev.kind === "cmd") {
      t =
        typed < ev.text.length
          ? setTimeout(() => setTyped((n) => n + 1), TYPE_MS)
          : setTimeout(() => {
              setIdx((i) => i + 1);
              setTyped(0);
            }, 250);
    } else if (ev.kind === "pause") {
      t = setTimeout(() => setIdx((i) => i + 1), ev.ms);
    } else if (ev.kind === "status") {
      t = setTimeout(() => setIdx((i) => i + 1), STATUS_MS);
    } else {
      t = setTimeout(() => setIdx((i) => i + 1), LINE_MS);
    }
    return () => clearTimeout(t);
  }, [idx, typed, cycle]);

  // Keep the newest line in view, like a real terminal.
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [idx, typed]);

  const done = idx >= EVENTS.length;
  const current = EVENTS[idx];

  return (
    <div className="ws-terminal">
      <div className="ws-terminal-head">your agent</div>
      <div
        ref={bodyRef}
        className="ws-terminal-body"
      >
        {EVENTS.slice(0, idx).map((ev, i) => {
          if (ev.kind === "pause") return null;
          if (ev.kind === "cmd")
            return (
              <p key={i} className="ws-t-ink">
                <span className="ws-t-prompt">❯</span>
                {ev.text}
              </p>
            );
          if (ev.kind === "status")
            return (
              <p key={i} className="ws-t-dim">
                <span className="ws-t-prompt">●</span>
                {ev.text}
              </p>
            );
          return (
            <div key={i} className="ws-t-body">
              {ev.node}
            </div>
          );
        })}
        {current?.kind === "cmd" ? (
          <p className="ws-t-ink">
            <span className="ws-t-prompt">❯</span>
            {current.text.slice(0, typed)}
            <Cursor />
          </p>
        ) : null}
        {done ? (
          <p className="ws-t-ink">
            <span className="ws-t-prompt">❯</span>
            <Cursor />
          </p>
        ) : null}
      </div>
    </div>
  );
}
