"use client";

import { useRef, useState } from "react";
import { passkeyFetch } from "@/lib/participate/workspace/auth/passkey-client";
import type { CommitteeWorkspace } from "@/lib/participate/workspace/domain/committee";

// Committee demo deployment only. These controls call /api/participate/demo,
// which the portal mounts only in a demo build and the backend refuses unless
// its own demo database is connected.
const endpoint = "/api/participate/demo";
const messages: Record<string, string> = {
  DEMO_ROUND_REQUIRED:
    "Open the signed review first, then fill the test seats.",
  DEMO_NOT_YOUR_ROUND:
    "Another tester opened this review. Pick another proposal.",
  DEMO_SEAT_KEY_UNAVAILABLE:
    "The test seats are not ready. Refresh and try again.",
  PASSKEY_RATE_LIMITED: "The test seats are busy. Try again in a minute.",
  DEMO_UNAVAILABLE: "Demo actions are not available here.",
  unauthorized: "Sign in again to continue.",
};
const explain = (cause: unknown) =>
  cause instanceof Error && messages[cause.message]
    ? messages[cause.message]
    : "The demo could not be updated. Please try again.";

type Proposal = CommitteeWorkspace["queue"][number];
type Outcome = "SPLIT" | "APPROVE" | "REJECT";
const outcomes: { value: Outcome; label: string }[] = [
  { value: "SPLIT", label: "Split 2–2: your vote decides" },
  { value: "APPROVE", label: "All four approve" },
  { value: "REJECT", label: "All four reject" },
];

export function DemoBanner() {
  return (
    <aside
      className="participate-demo-banner"
      role="note"
      aria-label="Demo environment"
    >
      <strong>Demo · test data</strong>
      <span>
        Practice copy of the committee workspace. Proposals are real; seats,
        votes, tags and results here are tests. Nothing is anchored, posted to
        GitHub or written to Google Sheets.
      </span>
    </aside>
  );
}

export function DemoReset({
  disabled,
  onDone,
}: {
  disabled: boolean;
  onDone: (notice: string) => Promise<unknown> | void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function reset() {
    setBusy(true);
    setError("");
    try {
      const result = await passkeyFetch<{ rounds: number }>(endpoint, {
        action: "reset",
      });
      setConfirming(false);
      await onDone(
        result.rounds
          ? `Demo reset. ${result.rounds} test review${result.rounds === 1 ? "" : "s"} cleared.`
          : "Demo reset. Nothing to clear.",
      );
    } catch (cause) {
      setError(explain(cause));
    } finally {
      setBusy(false);
    }
  }
  if (!confirming) {
    return (
      <button
        type="button"
        className="dao-button participate-demo-reset"
        disabled={disabled || busy}
        onClick={() => setConfirming(true)}
      >
        Reset demo
      </button>
    );
  }
  return (
    <div
      className="participate-demo-confirm"
      role="group"
      aria-label="Reset demo"
    >
      <span>Clear your test reviews, votes and tags?</span>
      <button
        type="button"
        className="dao-button dao-button--primary"
        disabled={busy}
        onClick={() => void reset()}
      >
        {busy ? "Resetting…" : "Reset"}
      </button>
      <button
        type="button"
        className="dao-text-button"
        disabled={busy}
        onClick={() => setConfirming(false)}
      >
        Cancel
      </button>
      {error ? (
        <p className="dao-form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function DemoFillSeats({
  proposal,
  onDone,
}: {
  proposal: Proposal;
  onDone: (notice: string) => Promise<unknown> | void;
}) {
  const [outcome, setOutcome] = useState<Outcome>("SPLIT");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const guard = useRef(false);
  const seated = proposal.myPending || proposal.myChoice !== null;
  if (!proposal.roundId || proposal.state !== "OPEN") return null;
  if (!seated) {
    return (
      <p
        className="participate-demo-fill participate-demo-fill--note"
        role="note"
      >
        Another tester opened this review in the demo. Pick another proposal to
        try the full flow.
      </p>
    );
  }
  const waiting =
    proposal.eligible - proposal.signed - (proposal.myPending ? 1 : 0);
  async function fill() {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await passkeyFetch<{
        signed: { seat: string; choice: string }[];
      }>(endpoint, { action: "fill", recordId: proposal.recordId, outcome });
      await onDone(
        result.signed.length
          ? `${result.signed.length} test ballot${result.signed.length === 1 ? "" : "s"} signed: ${result.signed.map((item) => `${item.seat} ${item.choice.toLowerCase()}`).join(", ")}.`
          : "The test seats had already signed.",
      );
    } catch (cause) {
      setError(explain(cause));
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="participate-demo-fill" aria-label="Demo test seats">
      <div>
        <strong>Demo · Test seats</strong>
        <p>
          {waiting > 0
            ? `${waiting} test seat${waiting === 1 ? " is" : "s are"} waiting. Fill them with labelled test ballots to reach the result, the public card and Finish.`
            : "All test seats have signed."}
        </p>
      </div>
      {waiting > 0 ? (
        <div className="participate-demo-fill-actions">
          <label>
            Test seats vote
            <select
              value={outcome}
              disabled={busy}
              onChange={(event) => setOutcome(event.target.value as Outcome)}
            >
              {outcomes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="dao-button dao-button--primary"
            disabled={busy}
            onClick={() => void fill()}
          >
            {busy
              ? "Signing test ballots…"
              : `Fill the other ${waiting} seat${waiting === 1 ? "" : "s"}`}
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="dao-form-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
