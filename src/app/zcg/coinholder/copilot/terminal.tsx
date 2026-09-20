"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Animated terminal demo for the Coinholder Copilot: types the question,
 * "fetches", reveals the answer line by line, then loops. Every line is a
 * real answer the skill produced against the live APIs, validated during the
 * Q3 2026 review round (2026-08-14). Honors prefers-reduced-motion by
 * rendering the full transcript statically.
 */

type Ev =
  | { kind: "cmd"; text: string }
  | { kind: "status"; text: string }
  | { kind: "line"; node: ReactNode }
  | { kind: "pause"; ms: number };

const USD = ({ v }: { v: string }) => (
  <span className="ws-t-usd">{v}</span>
);

const EVENTS: Ev[] = [
  {
    kind: "cmd",
    text: "Run diligence on the Nozy Wallet proposal before I vote",
  },
  { kind: "pause", ms: 350 },
  {
    kind: "status",
    text: "Fetching the round, prior verdicts, and the payment ledger...",
  },
  { kind: "pause", ms: 1000 },
  {
    kind: "line",
    node: (
      <p>
        <span className="ws-t-pos">The ask:</span> #21
        Nozy Wallet (Leonine DAO), <USD v="$60,000" /> retroactive, for a
        shielded-first wallet: CLI, desktop, companion API
      </p>
    ),
  },
  {
    kind: "line",
    node: (
      <p>
        <span className="ws-t-neg">History:</span> rejected
        at <USD v="$21,000" /> in the Oct 2025 round, back now at nearly 3× that
        ask
      </p>
    ),
  },
  {
    kind: "line",
    node: (
      <p>
        <span className="ws-t-accent">Ledger:</span> no paid ZCG
        or Coinholder rows, so approval would be their first public funding
      </p>
    ),
  },
  {
    kind: "line",
    node: (
      <p className="ws-t-note">
        sources: /api/zcg/coinholder/round · ZCG sheet (Coinholder tab) ·
        /api/zcg/data/grants
      </p>
    ),
  },
  { kind: "pause", ms: 1600 },
  { kind: "cmd", text: "Who in this round already got paid before?" },
  { kind: "pause", ms: 350 },
  {
    kind: "status",
    text: "Cross-referencing 37 applicants against the ledger...",
  },
  { kind: "pause", ms: 900 },
  {
    kind: "line",
    node: (
      <p>
        <span className="ws-t-pos">
          Funded and delivered:
        </span>{" "}
        Horizontal Systems has <USD v="$48,000" /> paid (Unstoppable Wallet,
        completed) and now asks <USD v="$80,000" /> for the next phase
      </p>
    ),
  },
  {
    kind: "line",
    node: (
      <p>
        <span className="ws-t-accent">Two tracks:</span> ZcashMe,
        Inc asks <USD v="$122,400" /> for ZcashNames here, plus an open $92,200
        ZCG grant with 0 ZEC settled
      </p>
    ),
  },
  {
    kind: "line",
    node: (
      <p>
        <span className="ws-t-neg">Same org, twice:</span>{" "}
        ValarGroup #32 + #36 add up to a <USD v="$1,802,000" /> combined ask
      </p>
    ),
  },
  {
    kind: "line",
    node: (
      <p className="ws-t-note">
        sources: /api/zcg/data/grants · /api/zcg/data/recipients ·
        /api/zcg/coinholder/round
      </p>
    ),
  },
];

const TYPE_MS = 26; // per character
const LINE_MS = 360; // per revealed answer line
const STATUS_MS = 350; // before a status line shows
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
