"use client";

import { useId, useState } from "react";
import { MAX_PACKAGE_BYTES, verifyArchivePackage } from "@/lib/participate/workspace/archive/format";

export function ArchiveFileVerifier({ manifestHash }: { manifestHash: string }) {
  const id = useId();
  const [state, setState] = useState<"idle" | "checking" | "matches" | "mismatch">("idle");
  const [name, setName] = useState("");
  async function verify(file?: File) {
    if (!file) return;
    setName(file.name); setState("checking");
    try {
      if (file.size > MAX_PACKAGE_BYTES) throw new Error("Package too large");
      await verifyArchivePackage(JSON.parse(await file.text()), manifestHash);
      setState("matches");
    } catch { setState("mismatch"); }
  }
  return <section className="dao-archive-file-check" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>Check your copy</h3>
    <p>Choose the downloaded package. Your file stays on this device.</p>
    <label className="dao-button dao-archive-upload" htmlFor={`${id}-file`}>{state === "checking" ? "Checking…" : "Choose a package"}</label>
    <input className="dao-sr-only" id={`${id}-file`} type="file" accept=".json,application/json" disabled={state === "checking"} onChange={event => { void verify(event.target.files?.[0]); event.target.value = ""; }} />
    {state === "matches" ? <p className="dao-archive-check-result" data-result="matches" role="status"><strong>✓ File matches this revision</strong><span>{name}</span><span>Every included file matches. Chain status is shown separately.</span></p> : null}
    {state === "mismatch" ? <p className="dao-archive-check-result" data-result="mismatch" role="alert"><strong>File does not match</strong><span>Choose this revision’s complete .zvoice.json package, up to 8 MB. Modified or missing files fail verification.</span></p> : null}
  </section>;
}
