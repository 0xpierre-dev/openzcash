"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ZarvisChat } from "./zarvis-chat";
import { ZarvisMark } from "./zarvis-mark";
import { ZarvisWordmark } from "./zarvis-wordmark";
import { useZarvis } from "./zarvis-provider";

/** Hiding the floating button lasts for the visit (this tab); Zarvis stays in the menu and the top bar. */
const HIDDEN_KEY = "oz.zarvis.launcher.hidden";
const hiddenListeners = new Set<() => void>();
let hiddenOverride = false;
function readHidden(): boolean {
  try {
    return sessionStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}
function hideLauncher() {
  try {
    sessionStorage.setItem(HIDDEN_KEY, "1");
  } catch {
    // Storage blocked: the button still hides until the next page load.
  }
  hiddenOverride = true;
  hiddenListeners.forEach((l) => l());
}
function subscribeHidden(listener: () => void) {
  hiddenListeners.add(listener);
  return () => hiddenListeners.delete(listener);
}

export function ZarvisDock() {
  const pathname = usePathname();
  const { expression, motionPaused } = useZarvis();
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const [opened, setOpened] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const hidden = useSyncExternalStore(
    subscribeHidden,
    () => hiddenOverride || readHidden(),
    () => false,
  );
  useEffect(() => { dialog.current?.close(); }, [pathname]);
  // Keep the launcher above the treasury bar at every responsive size.
  useEffect(() => {
    const footer = document.querySelector(".rd-treasury-bar");
    if (!footer) return;
    const update = () => wrap.current?.style.setProperty("--zarvis-footer-height", `${footer.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(update); observer.observe(footer); update();
    return () => observer.disconnect();
  }, [pathname, hidden]);
  if (/^\/zarvis(\/|$)/.test(pathname) || /^\/(login|onboarding|invites|projects|viewing-keys)(\/|$)/.test(pathname)) return null;
  return <>{hidden ? null : <div ref={wrap} className="zarvis-launcher-wrap"><button ref={launcher} type="button" className="zarvis-launcher" aria-label="Ask Zarvis" aria-haspopup="dialog" onClick={() => { setOpened(true); dialog.current?.showModal(); }}><ZarvisMark expression={expression} animated paused={motionPaused}/><span>Ask Zarvis</span></button><button type="button" className="zarvis-launcher-close" aria-label="Hide the Ask Zarvis button" title="Hide for this visit" onClick={hideLauncher}>×</button></div>}
    <dialog className="zarvis-dock" ref={dialog} aria-label="Zarvis, your Zcash guide" onClick={(e) => { if (e.target === dialog.current) dialog.current.close(); }}>
      <header className="zarvis-dock-heading"><div><ZarvisMark expression={expression} animated paused={motionPaused}/><span><strong><ZarvisWordmark/></strong><small>Your Zcash guide</small></span></div><nav aria-label="Chat controls"><Link href="/zarvis" onClick={() => dialog.current?.close()} aria-label="Open full Zarvis page">↗</Link><button type="button" aria-label="Close Zarvis" onClick={() => dialog.current?.close()}>×</button></nav></header>
      {opened ? <ZarvisChat compact/> : null}
    </dialog>
  </>;
}
