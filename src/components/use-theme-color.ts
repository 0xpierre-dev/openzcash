"use client";
import { useEffect, type RefObject } from "react";

const THEME_COLOR_META = 'meta[name="theme-color"]';
/** The canvas colour of the shell, defined once per theme in theme.css. */
const CANVAS_TOKEN = "--bg";

const themeColorMetas = () =>
  Array.from(document.querySelectorAll<HTMLMetaElement>(THEME_COLOR_META));

/**
 * Keeps the browser chrome and the phone status area on the shell's canvas
 * colour: cream in the light theme, near-black in the dark one. The server
 * always sends the light value (the theme is a per-browser choice it cannot
 * know); this follows the toggle afterwards. The colour is read from the
 * shell's own token, so theme.css stays the only place that defines it.
 */
export function useThemeColor(
  shell: RefObject<HTMLElement | null>,
  theme: string,
) {
  // Leaving the shell (the bare Monthly reader) hands back what the server sent.
  useEffect(() => {
    const served = themeColorMetas()[0]?.content;
    return () => {
      if (!served) return;
      for (const meta of themeColorMetas()) meta.content = served;
    };
  }, []);

  useEffect(() => {
    if (!shell.current) return;
    const canvas = getComputedStyle(shell.current)
      .getPropertyValue(CANVAS_TOKEN)
      .trim();
    if (!canvas) return;
    const apply = () => {
      for (const meta of themeColorMetas()) {
        if (meta.content !== canvas) meta.content = canvas;
      }
    };
    apply();
    // Navigation can render the tag again with the served value: put it back.
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true });
    return () => observer.disconnect();
  }, [shell, theme]);
}
