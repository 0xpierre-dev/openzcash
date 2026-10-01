"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { GLYPH, Glyph } from "./app-marks";

/** Read by the scroll lock in mobile-shell.css. */
const GUTTER_VAR = "--sheet-gutter";

/**
 * A sheet that rises from the bottom edge on phones (mobile-shell.css). It is
 * a modal <dialog>, like the ⌘K palette: the page behind is inert and stays
 * put, focus is kept inside and returns to the control that opened it, and
 * Esc, the close button or a tap on the backdrop close it. No drag gesture.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // The native dialog follows the state its owner holds.
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      // The page is locked while the sheet is open. Where its scrollbar takes
      // room, that room stays reserved, so nothing behind shifts sideways.
      const root = document.documentElement;
      const hasScrollbar = window.innerWidth > root.clientWidth;
      root.style.setProperty(GUTTER_VAR, hasScrollbar ? "stable" : "auto");
      el.showModal();
    }
    if (!open && el.open) el.close();
  }, [open]);

  const close = () => dialog.current?.close();

  return (
    <dialog
      ref={dialog}
      className="rd-sheet"
      aria-labelledby={titleId}
      onClose={() => {
        document.documentElement.style.removeProperty(GUTTER_VAR);
        onOpenChange(false);
      }}
      onClick={(e) => {
        // The panel fills the dialog, so a click on the dialog itself is the backdrop.
        if (e.target === dialog.current) close();
      }}
    >
      <div className="rd-sheet-panel">
        <header className="rd-sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="rd-sheet-close"
            aria-label={`Close ${title}`}
            onClick={close}
          >
            <Glyph d={GLYPH.close} size={16} />
          </button>
        </header>
        <div
          className="rd-sheet-body"
          onClick={(e) => {
            // Following a link inside the sheet closes it, even when the link
            // leads to the page already open.
            if (e.target instanceof Element && e.target.closest("a")) close();
          }}
        >
          {children}
        </div>
      </div>
    </dialog>
  );
}
