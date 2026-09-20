"use client";

import { useState } from "react";
import { copyText } from "./copy-text";

/** The install command with a copy button. */
export function InstallCommand({ skill }: { skill: string }) {
  const cmd = `npx skills add Michae2xl/openzcash --skill ${skill}`;
  const [copied, setCopied] = useState(false);
  return (
    <div className="ws-install">
      <code>{cmd}</code>
      <button
        type="button"
        onClick={async () => {
          if (await copyText(cmd)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }
        }}
        aria-label="Copy the install command"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
