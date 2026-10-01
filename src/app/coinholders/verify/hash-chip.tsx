"use client";

import { useState } from "react";
import { copyText } from "@/components/copilot/copy-text";
import styles from "./verify.module.css";

const RESET_MS = 1600;

/**
 * The SHA-256 of what the page compared, shortened in a chip. The full hash
 * is its title (hover) and what a click copies; screen readers hear it whole.
 */
export function HashChip({
  hash,
  short,
  about,
}: {
  hash: string;
  short: string;
  /** What was hashed, for the tooltip. */
  about: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const ok = await copyText(hash);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), RESET_MS);
  };
  return (
    <>
      <button
        type="button"
        className={styles.hashChip}
        title={`${about}: ${hash} · click to copy`}
        aria-label={`SHA-256 ${hash}. Copy the full hash`}
        onClick={copy}
      >
        <span className={styles.hashKey}>sha256</span> {short}
        <span className={styles.hashCopied} aria-hidden>
          {copied ? "copied" : ""}
        </span>
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? "Hash copied to the clipboard" : ""}
      </span>
    </>
  );
}
