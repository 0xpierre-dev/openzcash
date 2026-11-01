"use client";

import { useEffect, useRef } from "react";

const INTERACTIVE = "a, button, [role='button'], label, summary, select";

/**
 * App-wide tactile feedback on tap.
 *  - Android / Chromium PWAs: the Vibration API (`navigator.vibrate`).
 *  - iOS 17.4+ Safari: toggling a hidden `<input switch>` inside the user
 *    gesture plays the system haptic (the Vibration API is unsupported there).
 * The CSS active-press animation carries the feedback everywhere else.
 */
export function TapFeedback() {
  const labelRef = useRef<HTMLLabelElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // `switch` is a non-standard iOS attribute — set it here to avoid React
    // prop warnings; it's what turns the checkbox toggle into a haptic.
    inputRef.current?.setAttribute("switch", "");

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || !e.isPrimary) return;
      const target = e.target as Element | null;
      if (!target?.closest(INTERACTIVE)) return;
      // Android / Chromium: the Vibration API is enough. Never also toggle the
      // hidden switch there: focusing it scrolled the page back to the top.
      if (typeof navigator.vibrate === "function") {
        try {
          navigator.vibrate(10);
        } catch {
          /* unsupported */
        }
        return;
      }
      // iOS haptic: toggle the hidden switch within this user gesture.
      try {
        labelRef.current?.click();
      } catch {
        /* unsupported */
      }
    };
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <label
      ref={labelRef}
      aria-hidden="true"
      // Fixed, not absolute: if the browser focuses the switch it must not scroll the page.
      style={{ position: "fixed", left: "-9999px", top: 0, pointerEvents: "none" }}
    >
      <input ref={inputRef} type="checkbox" tabIndex={-1} />
    </label>
  );
}
