"use client";
import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a media query matches, kept current as the viewport changes. False
 * on the server and during hydration (the viewport is unknown there), so the
 * markup the server sent is always the wide one and CSS decides what shows
 * until the browser answers.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", notify);
      return () => media.removeEventListener("change", notify);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
