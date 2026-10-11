"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LEGACY_WORKSPACE_THEME_COOKIE, parseWorkspaceThemePreference, workspaceThemeCookie, type WorkspaceThemePreference } from "@/lib/participate/workspace/domain/workspace-theme";

type WorkspaceThemeContextValue = {
  preference: WorkspaceThemePreference;
  setPreference: (preference: WorkspaceThemePreference) => void;
};

const WorkspaceThemeContext = createContext<WorkspaceThemeContextValue>({
  preference: "system",
  setPreference: () => undefined
});

export function useWorkspaceTheme() { return useContext(WorkspaceThemeContext); }

function persistPreference(preference: WorkspaceThemePreference) {
  try {
    document.cookie = LEGACY_WORKSPACE_THEME_COOKIE;
    document.cookie = workspaceThemeCookie(preference, window.location.protocol === "https:");
  } catch {
    // The selected appearance still applies when the browser blocks cookie storage.
  }
}

/**
 * CSS owns system resolution: use [data-theme="dark"] and, inside
 * prefers-color-scheme: dark, [data-theme="system"] for the dark tokens.
 * The server supplies the initial preference so the first render already matches.
 */
export function WorkspaceThemeProvider({ initialPreference = "system", children }: {
  initialPreference?: WorkspaceThemePreference;
  children: ReactNode;
}) {
  const [preference, setPreferenceState] = useState(() => parseWorkspaceThemePreference(initialPreference));
  useEffect(() => { persistPreference(preference); }, [preference]);
  useEffect(() => {
    // Rendered natively inside OpenZcash, the workspace follows the portal shell's theme.
    const shell = document.querySelector(".rd-shell");
    if (!shell) return;
    const follow = () => {
      const theme = shell.getAttribute("data-theme");
      if (theme === "light" || theme === "dark") setPreferenceState(theme);
    };
    follow();
    const observer = new MutationObserver(follow);
    observer.observe(shell, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  const setPreference = useCallback((nextPreference: WorkspaceThemePreference) => {
    const next = parseWorkspaceThemePreference(nextPreference);
    setPreferenceState(next);
  }, []);
  const context = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);

  return (
    <WorkspaceThemeContext.Provider value={context}>
      <div className="dao-theme-root" data-theme={preference}>{children}</div>
    </WorkspaceThemeContext.Provider>
  );
}

function ThemeIcon({ mode }: { mode: "light" | "dark" }) {
  return (
    <svg className={`dao-theme-icon dao-theme-icon--${mode}`} width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {mode === "dark" ? <path d="M20.5 14.1A8.6 8.6 0 0 1 9.9 3.5 8.7 8.7 0 1 0 20.5 14.1Z" /> : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4" /></>}
    </svg>
  );
}

export function WorkspaceThemeControl() {
  const { preference, setPreference } = useContext(WorkspaceThemeContext);

  function toggle() {
    const dark = preference === "dark" || (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setPreference(dark ? "light" : "dark");
  }

  return (
    <button type="button" className="dao-theme-toggle" aria-label="Toggle light and dark mode" title="Toggle light and dark mode" onClick={toggle}>
      <ThemeIcon mode="light" />
      <ThemeIcon mode="dark" />
    </button>
  );
}
