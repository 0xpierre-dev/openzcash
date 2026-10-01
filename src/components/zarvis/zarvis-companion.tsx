"use client";
import { useEffect, useRef, useState } from "react";
import { welcomeExpression, type WelcomePhase } from "@/lib/zarvis/expression";
import { useZarvis } from "./zarvis-provider";
import { ZarvisFigure } from "./zarvis-figure";

/** A requested wave, and the time the shield's one emphasis has to play before it is retired. */
const WAVE_MS = 2400;
const RAISE_MS = 1300;

/** Welcome mascot: drops in centred, raises the shield as it lands and keeps it. Tapping it asks for a wave. */
export function ZarvisCompanion() {
  const { expression, motionPaused } = useZarvis();
  const hello = useRef<HTMLButtonElement>(null);
  const [phase, setPhase] = useState<WelcomePhase>("landing");
  const [waving, setWaving] = useState(false);
  const [waveId, setWaveId] = useState(0);
  // The drop is a CSS animation that starts with the first paint, before hydration; the shield goes up the moment it ends.
  // With no drop to wait for (reduced motion, paused, hidden tab) or a cancelled one, the shield is simply there.
  useEffect(() => {
    if (phase !== "landing") return;
    let current = true;
    const raise = () => { if (current) setPhase("raising"); };
    const drop = hello.current?.querySelector(".zarvis-entrance")?.getAnimations?.()[0];
    (drop ? drop.finished : Promise.resolve()).then(raise, raise);
    return () => { current = false; };
  }, [phase, motionPaused]);
  useEffect(() => {
    if (phase !== "raising") return;
    const timer = setTimeout(() => setPhase("settled"), RAISE_MS);
    return () => clearTimeout(timer);
  }, [phase]);
  useEffect(() => {
    if (!waving) return;
    const timer = setTimeout(() => setWaving(false), WAVE_MS);
    return () => clearTimeout(timer);
  }, [waving, waveId]);
  return <div className="zarvis-companion">
    <button ref={hello} type="button" className="zarvis-hello" aria-label="Say hello to Zarvis" title="Say hello to Zarvis"
      onClick={() => { setWaving(true); setWaveId((id) => id + 1); }}
      onPointerMove={(event) => {
        if (event.pointerType === "touch") return;
        const box = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty("--zarvis-look-x", `${((event.clientX - box.left) / box.width - .5) * 8}px`);
        event.currentTarget.style.setProperty("--zarvis-look-y", `${((event.clientY - box.top) / box.height - .5) * 5}px`);
      }}
      onPointerLeave={(event) => {
        event.currentTarget.style.setProperty("--zarvis-look-x", "0px");
        event.currentTarget.style.setProperty("--zarvis-look-y", "0px");
      }}>
      <ZarvisFigure className="zarvis-hero-figure"
        expression={welcomeExpression(phase, waving, expression)}
        entrance={phase === "settled" ? undefined : phase}
        animated paused={motionPaused}/>
    </button>
  </div>;
}

export function ZarvisMotionToggle({ className = "zarvis-motion" }: { className?: string }) {
  const { motionPaused, toggleMotion } = useZarvis();
  return (
    <button type="button" className={className} onClick={toggleMotion}
      aria-label={motionPaused ? "Resume mascot animation" : "Pause mascot animation"}
      title={motionPaused ? "Resume mascot animation" : "Pause mascot animation"}>
      {motionPaused ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 6 4-6 4Z" fill="currentColor"/></svg>
        : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 4v8m5-8v8" stroke="currentColor" strokeWidth="2"/></svg>}
    </button>
  );
}
