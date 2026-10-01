"use client";

import {
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { CodeBlock } from "./code-block";
import shared from "../coinholders.module.css";
import styles from "./verify.module.css";

export type GuideStep = {
  /** The number in the circle; empty for a row that sums up the others. */
  n: string;
  title: string;
  /** One line shown while the row is folded. */
  gist: string;
  /** What the step should print, from the round's own data. */
  expect: { text: string; title?: string } | null;
  body: ReactNode;
  code?: { text: string; label: string; wrap?: boolean };
};

export type GuideTab = {
  id: string;
  label: string;
  steps: GuideStep[];
  /** A line under the steps. */
  note?: ReactNode;
};

/** The tab a viewer last chose, kept in their browser only. */
const STORAGE_KEY = "oz.coinholders.verify.path";
const readSaved = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};
const save = (id: string) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Private windows and blocked storage: the choice lasts until reload.
  }
};
const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};

/** Each step folds to its title, a line and what it should print; open, it shows the text and the command. */
function Steps({ steps }: { steps: GuideStep[] }) {
  return (
    <>
      <p className={styles.stepsHead} aria-hidden>
        <span>Step</span>
        <span>Expected result</span>
      </p>
      <ol className={styles.stepRows}>
        {steps.map((s) => (
          <li key={s.title}>
            <details className={styles.stepRow}>
              <summary>
                <span
                  className={`${shared.stepNum} ${styles.stepNum}`}
                  data-sum={s.n ? undefined : true}
                  aria-hidden
                >
                  {s.n || "all"}
                </span>
                <span className={styles.stepText}>
                  <span className={styles.stepTitle}>{s.title}</span>
                  <span className={styles.stepGist}>{s.gist}</span>
                </span>
                {s.expect ? (
                  <span className={styles.expect} title={s.expect.title}>
                    <span className="sr-only">Expected result: </span>
                    {s.expect.text}
                  </span>
                ) : (
                  <span className={styles.expectNone} aria-hidden />
                )}
                <span className={styles.chev} aria-hidden />
              </summary>
              <div className={styles.stepDetail}>
                {s.body}
                {s.code ? (
                  <CodeBlock
                    code={s.code.text}
                    label={s.code.label}
                    wrap={s.code.wrap}
                  />
                ) : null}
              </div>
            </details>
          </li>
        ))}
      </ol>
    </>
  );
}

/**
 * "Rebuild it yourself": the same three steps done with curl and jq, with
 * Python or in a spreadsheet, one tab each. The tab a viewer picks is
 * remembered in their browser. A round with one way to check it shows its
 * steps without tabs.
 */
export function Guide({
  id,
  title,
  sub,
  tabs,
}: {
  id: string;
  title: string;
  sub?: ReactNode;
  tabs: GuideTab[];
}) {
  const saved = useSyncExternalStore(subscribe, readSaved, () => null);
  const [chosen, setChosen] = useState<string | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const ids = tabs.map((t) => t.id);
  const wanted = chosen ?? saved;
  const active = wanted && ids.includes(wanted) ? wanted : ids[0];
  const tabbed = tabs.length > 1;

  const choose = (tabId: string) => {
    setChosen(tabId);
    save(tabId);
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const to =
      e.key === "ArrowRight"
        ? i + 1
        : e.key === "ArrowLeft"
          ? i - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? ids.length - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    const next = (to + ids.length) % ids.length;
    choose(ids[next]);
    buttons.current[next]?.focus();
  };

  return (
    <section className={styles.guide} aria-labelledby={id}>
      <div className={styles.chartHead}>
        <div>
          <h2 id={id} className={styles.cardHeading}>
            {title}
          </h2>
          {sub ? <p className={styles.cardSub}>{sub}</p> : null}
        </div>
        {tabbed ? (
          <div
            className={`${styles.seg} ${styles.segTabs}`}
            role="tablist"
            aria-label="Ways to check it"
          >
            {tabs.map((t, i) => (
              <button
                key={t.id}
                ref={(el) => {
                  buttons.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${id}-tab-${t.id}`}
                aria-selected={t.id === active}
                aria-controls={`${id}-panel-${t.id}`}
                tabIndex={t.id === active ? 0 : -1}
                onClick={() => choose(t.id)}
                onKeyDown={(e) => onKey(e, i)}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          id={`${id}-panel-${t.id}`}
          role={tabbed ? "tabpanel" : undefined}
          aria-labelledby={tabbed ? `${id}-tab-${t.id}` : undefined}
          hidden={t.id !== active}
        >
          <Steps steps={t.steps} />
          {t.note ? <p className={styles.guideNote}>{t.note}</p> : null}
        </div>
      ))}
    </section>
  );
}
