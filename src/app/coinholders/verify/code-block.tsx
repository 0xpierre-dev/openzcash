"use client";

import { Fragment, useRef, useState } from "react";
import { copyText } from "@/components/copilot/copy-text";
import styles from "./code-block.module.css";

const RESET_MS = 1600;
type State = "idle" | "copied" | "selected";
const BUTTON: Record<State, string> = {
  idle: "Copy",
  copied: "Copied",
  selected: "Selected",
};
const ANNOUNCE: Record<State, string> = {
  idle: "",
  copied: "Copied to the clipboard",
  selected:
    "The browser blocked copying; the command is selected, copy it with your keyboard",
};

/** A URL's path, offered a line break after each "/" (never inside "//"): a wrapped URL then folds at a slash, not at a hyphen. */
const URL_SLASH = /(?<=[^/]\/)(?=\w)/;
function Wrapped({ code }: { code: string }) {
  return code.split(URL_SLASH).map((part, i) => (
    <Fragment key={i}>
      {i ? <wbr /> : null}
      {part}
    </Fragment>
  ));
}

/**
 * A command in a quiet block, with a copy button; the text copies exactly as
 * shown. Lines keep their indentation and scroll inside the block; `wrap`
 * folds a single long line at the block's edge instead, at spaces and a URL's
 * slashes. Where the browser refuses the clipboard, the command is selected
 * instead, ready for ⌘C / Ctrl+C.
 */
export function CodeBlock({
  code,
  label,
  wrap = false,
}: {
  code: string;
  label: string;
  wrap?: boolean;
}) {
  const [state, setState] = useState<State>("idle");
  const pre = useRef<HTMLPreElement>(null);
  const copy = async () => {
    const copied = await copyText(code);
    if (!copied && pre.current)
      window.getSelection()?.selectAllChildren(pre.current);
    setState(copied ? "copied" : "selected");
    setTimeout(() => setState("idle"), RESET_MS);
  };
  return (
    <div className={wrap ? `${styles.code} ${styles.codeWrap}` : styles.code}>
      {/* The shell's ScrollHints marks a sideways-scrolling block (data-scroll-x) on phones, sometimes before this streamed page hydrates. */}
      <pre ref={pre} tabIndex={0} aria-label={label} suppressHydrationWarning>
        <code>{wrap ? <Wrapped code={code} /> : code}</code>
      </pre>
      <button
        type="button"
        className={styles.copy}
        aria-label={`Copy: ${label}`}
        onClick={copy}
      >
        {BUTTON[state]}
      </button>
      <span className="sr-only" aria-live="polite">
        {ANNOUNCE[state]}
      </span>
    </div>
  );
}
