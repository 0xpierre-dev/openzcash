"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceSignInForm } from "@/components/participate/workspace/workspace-auth";
import { PasskeyConfirmationForm } from "@/components/participate/workspace/passkey-confirmation-form";
import {
  SignedDecision,
  type DecisionState,
} from "@/components/participate/workspace/signed-decision";
import { ReviewFinish } from "./review-finish";
import { DemoReset } from "./committee-demo";
import { passkeyFetch } from "@/lib/participate/workspace/auth/passkey-client";
import type { CommitteeWorkspace } from "@/lib/participate/workspace/domain/committee";

// Committee demo deployment only: one guided page from sign-in to result.
// The vote is the real signed-ballot component; the four TEST seats sign
// through /api/participate/demo right after it, one per request.
export const PRACTICE_PATH = "/zcg/participate?view=practice";
const demoEndpoint = "/api/participate/demo";
const steps = ["Sign in", "Passkey", "Practice review", "Result"] as const;
type Practice = {
  hostId: string;
  recordId: string;
  title: string;
  revision: number;
  roundId: string;
  signed: number;
  eligible: number;
  complete: boolean;
};
type Outcome = "SPLIT" | "APPROVE" | "REJECT";
type Seat = { seat: string; choice: string };
const outcomes: { value: Outcome; label: string }[] = [
  { value: "SPLIT", label: "2 approve, 2 reject: your vote decides" },
  { value: "APPROVE", label: "All four approve" },
  { value: "REJECT", label: "All four reject" },
];
const messages: Record<string, string> = {
  DEMO_NO_PROPOSAL_AVAILABLE:
    "Every proposal already has a test review. Reset the demo to start over.",
  DEMO_RATE_LIMITED: "Too many demo actions. Try again in a few minutes.",
  PASSKEY_RATE_LIMITED: "The test seats are busy. Try again in a minute.",
  DECISION_ROSTER_NOT_READY:
    "Your passkey is not ready yet. Refresh and try again.",
  unauthorized: "Sign in again to continue.",
};
const explain = (cause: unknown) =>
  cause instanceof Error && messages[cause.message]
    ? messages[cause.message]
    : "The demo could not continue. Refresh and try again.";
const archiveEndpoint = (p: Practice) =>
  `/api/communities/${encodeURIComponent(p.hostId)}/archives/${encodeURIComponent(p.recordId)}`;
const recordHref = (recordId: string) =>
  `/zcg/participate?record=${encodeURIComponent(recordId)}`;

function Steps({ current }: { current: number }) {
  return (
    <ol className="demo-practice-steps" aria-label="Demo steps">
      {steps.map((label, index) => (
        <li
          key={label}
          data-state={
            index < current ? "done" : index === current ? "current" : "next"
          }
          aria-current={index === current ? "step" : undefined}
        >
          <span>{index + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}

export function DemoPractice({
  committee,
  signedIn,
}: {
  committee: CommitteeWorkspace | null;
  signedIn: boolean;
}) {
  const me = committee?.members.find(
    (member) => member.isMe && member.status === "ACTIVE",
  );
  const ready = Boolean(me?.ready);
  const [practice, setPractice] = useState<Practice | null>(null);
  const [result, setResult] = useState<DecisionState | null>(null);
  const [progress, setProgress] = useState<Seat[] | null>(null);
  const [outcome, setOutcome] = useState<Outcome>("SPLIT");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [finish, setFinish] = useState(false);
  const [notice, setNotice] = useState("");
  const filling = useRef(false);
  const router = useRouter();

  const loadResult = useCallback(async (round: Practice) => {
    setResult(
      await passkeyFetch<DecisionState>(
        `${archiveEndpoint(round)}/decisions?revision=${round.revision}`,
        undefined,
        "GET",
      ),
    );
  }, []);

  const start = useCallback(
    async (fresh = false) => {
      setBusy(true);
      setError("");
      setResult(null);
      setProgress(null);
      setFinish(false);
      try {
        const round = await passkeyFetch<Practice>(demoEndpoint, {
          action: "practice",
          ...(fresh ? { fresh: true } : {}),
        });
        setPractice(round);
        if (round.complete) await loadResult(round);
      } catch (cause) {
        setError(explain(cause));
      } finally {
        setBusy(false);
      }
    },
    [loadResult],
  );

  useEffect(() => {
    if (!ready) return;
    // Deferred so the effect itself never sets state synchronously.
    const timer = setTimeout(() => void start(), 0);
    return () => clearTimeout(timer);
  }, [ready, start]);

  async function afterVote() {
    if (!practice || filling.current) return;
    const state = await passkeyFetch<DecisionState>(
      `${archiveEndpoint(practice)}/decisions?revision=${practice.revision}`,
      undefined,
      "GET",
    );
    if (!state.myChoice) return;
    filling.current = true;
    setBusy(true);
    setError("");
    setProgress([]);
    try {
      for (let guard = 0; guard < 4; guard++) {
        const step = await passkeyFetch<{ signed: Seat[]; remaining: number }>(
          demoEndpoint,
          { action: "fill", recordId: practice.recordId, outcome, limit: 1 },
        );
        setProgress((previous) => [...(previous ?? []), ...step.signed]);
        if (!step.remaining) break;
      }
      await loadResult(practice);
    } catch (cause) {
      setError(explain(cause));
    } finally {
      filling.current = false;
      setBusy(false);
    }
  }

  const current = !signedIn ? 0 : !ready ? 1 : result?.tally ? 3 : 2;
  return (
    <section className="demo-practice" aria-labelledby="demo-practice-heading">
      <header className="demo-practice-head">
        <div>
          <h1 id="demo-practice-heading">Try the committee review</h1>
          <p>
            Real ZCG proposals, test seats. Sign one vote and see the whole
            result.
          </p>
        </div>
        {signedIn && committee?.access === "MEMBER" ? (
          <div className="demo-practice-tools">
            <DemoReset
              disabled={busy}
              onDone={async (text) => {
                setNotice(text);
                await start();
              }}
            />
            <a
              className="dao-text-button"
              href="/zcg/participate?view=committee"
            >
              Full committee workspace →
            </a>
          </div>
        ) : null}
      </header>
      <Steps current={current} />
      {notice ? (
        <p className="committee-notice" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="dao-form-error" role="alert">
          {error}
        </p>
      ) : null}

      {current === 0 ? (
        <div className="demo-practice-card demo-practice-card--narrow">
          <h2>Sign in with your email</h2>
          <p>
            You get a 6-digit code, then a demo coordinator seat. No invitation
            needed.
          </p>
          <WorkspaceSignInForm next={PRACTICE_PATH} />
        </div>
      ) : null}

      {current === 1 ? (
        <div className="demo-practice-card demo-practice-card--narrow">
          <h2>Create your signing key</h2>
          <p>
            Committee votes are signed with a passkey on this device: Touch ID,
            Face ID or your device PIN.
          </p>
          {committee?.access !== "MEMBER" ? (
            <p className="dao-form-error" role="alert">
              This account could not take a demo seat. Sign in with another
              email.
            </p>
          ) : adding ? (
            <PasskeyConfirmationForm
              onComplete={() => router.refresh()}
              onCancel={() => setAdding(false)}
              onPendingChange={setBusy}
            />
          ) : (
            <button
              type="button"
              className="dao-button dao-button--primary"
              onClick={() => setAdding(true)}
            >
              Create passkey
            </button>
          )}
        </div>
      ) : null}

      {current === 2 ? (
        <div className="demo-practice-card">
          {!practice ? (
            <p aria-busy="true">
              {busy
                ? "Preparing your practice review…"
                : "Your practice review is not ready."}
            </p>
          ) : (
            <>
              <p className="demo-practice-kicker">
                Suggested proposal · revision {practice.revision}
              </p>
              <h2>{practice.title}</h2>
              <p>
                <a
                  href={recordHref(practice.recordId)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Read the proposal ↗
                </a>
              </p>
              {progress ? (
                <ol
                  className="demo-practice-progress"
                  aria-label="Signatures"
                  aria-live="polite"
                >
                  <li data-state="done">Your vote · signed</li>
                  {[0, 1, 2, 3].map((index) => {
                    const seat = progress[index];
                    return (
                      <li key={index} data-state={seat ? "done" : "next"}>
                        {seat
                          ? `${seat.seat} · ${seat.choice.toLowerCase()}`
                          : `Test seat ${index + 2} · signing…`}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <>
                  <label className="demo-practice-outcome">
                    Test seats vote
                    <select
                      value={outcome}
                      onChange={(event) =>
                        setOutcome(event.target.value as Outcome)
                      }
                    >
                      {outcomes.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <SignedDecision
                    key={practice.roundId}
                    endpoint={archiveEndpoint(practice)}
                    revision={practice.revision}
                    initiallyOpen
                    compact
                    visible
                    onChanged={afterVote}
                  />
                </>
              )}
            </>
          )}
        </div>
      ) : null}

      {current === 3 && practice && result?.tally ? (
        <div className="demo-practice-card">
          <p className="demo-practice-kicker">{practice.title}</p>
          <h2>
            {result.tally.outcome === "APPROVED" ? "Approved" : "Rejected"} ·{" "}
            {result.tally.approve} of 5 approve
          </h2>
          <p>
            {result.tally.approve} approve · {result.tally.reject} reject ·{" "}
            {result.tally.abstain} abstain. Your signed vote plus four labelled
            test ballots: this is what the public card and the Finish tab show.
          </p>
          <div className="demo-practice-actions">
            <a
              className="dao-button"
              href={recordHref(practice.recordId)}
              target="_blank"
              rel="noreferrer"
            >
              View public card ↗
            </a>
            <button
              type="button"
              className="dao-button"
              aria-expanded={finish}
              onClick={() => setFinish((open) => !open)}
            >
              Finish: Sheets row A–G
            </button>
            <button
              type="button"
              className="dao-button dao-button--primary"
              disabled={busy}
              onClick={() => void start(true)}
            >
              Try another proposal
            </button>
          </div>
          {finish ? (
            <ReviewFinish
              endpoint={archiveEndpoint(practice)}
              recordId={practice.recordId}
              revision={practice.revision}
              roundId={practice.roundId}
              visible
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
