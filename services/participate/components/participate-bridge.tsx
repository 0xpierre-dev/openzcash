"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useWorkspaceTheme } from "@/components/workspace-theme";
import { participationThemeMessage } from "@/lib/domain/participate-embed";

type HostView = "proposals" | "history" | "committee" | "about";
const ParticipateHost = createContext<((view: HostView) => void) | null>(null);
export const useParticipateHost = () => useContext(ParticipateHost);

/** Only appearance and fixed public views cross the boundary, never account state or actions. */
export function ParticipateBridge({ parentOrigin, children }: { parentOrigin: string | null; children?: ReactNode }) {
  const { preference, setPreference } = useWorkspaceTheme();
  const [connected, setConnected] = useState(false);
  const openView = useCallback((view: HostView) => {
    if (parentOrigin && window.parent !== window && ["proposals", "history", "committee", "about"].includes(view)) {
      window.parent.postMessage({ type: "participate:view", version: 1, view }, parentOrigin);
    }
  }, [parentOrigin]);
  useEffect(() => {
    if (!parentOrigin || window.parent === window) return;
    // Browser-only embed detection; standalone visits keep working without a host.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConnected(true);
    const receive = (event: MessageEvent) => {
      if (event.origin !== parentOrigin || event.source !== window.parent) return;
      const theme = participationThemeMessage(event.data);
      if (theme) setPreference(theme);
    };
    window.addEventListener("message", receive);
    window.parent.postMessage({ type: "participate:ready", version: 1 }, parentOrigin);
    return () => window.removeEventListener("message", receive);
  }, [parentOrigin, setPreference]);
  useEffect(() => {
    if (!connected || !parentOrigin || (preference !== "light" && preference !== "dark")) return;
    window.parent.postMessage({ type: "participate:theme", version: 1, theme: preference }, parentOrigin);
  }, [connected, parentOrigin, preference]);
  return <ParticipateHost.Provider value={connected ? openView : null}>{children}</ParticipateHost.Provider>;
}
