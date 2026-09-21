"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Containers that scroll sideways on phones (theme.css, "Phones" section). */
const SCROLLERS = [
  ".rd-content .ws-table-wrap",
  ".rd-content .ws-ledger",
  ".rd-content .overflow-x-auto",
  ".rd-content .ws-data-table .overflow-auto",
  ".rd-content .overflow-hidden:has(> table)",
  ".rd-content .p-0:has(> table)",
  ".rd-content pre",
  ".rd-content .ws-install",
].join(", ");
const PHONE = "(max-width: 720px)";
const EDGE = 4;

function stateOf(el: HTMLElement): string | null {
  const overflow = el.scrollWidth - el.clientWidth;
  if (overflow <= EDGE) return null;
  if (el.scrollLeft <= EDGE) return "start";
  if (el.scrollLeft >= overflow - EDGE) return "end";
  return "mid";
}

/**
 * Marks sideways-scrollable containers with data-scroll-x so the theme can
 * fade the hidden edge: on a phone a wide table otherwise looks cut, with no
 * scrollbar to say more columns exist. Recomputed on navigation, on resize and
 * when the page re-renders (pagination, filters).
 */
export function ScrollHints() {
  const pathname = usePathname();
  useEffect(() => {
    const media = window.matchMedia(PHONE);
    const tracked = new Set<HTMLElement>();
    const paint = (el: HTMLElement) => {
      const state = media.matches ? stateOf(el) : null;
      if (state) el.dataset.scrollX = state;
      else delete el.dataset.scrollX;
    };
    const onScroll = (e: Event) => paint(e.currentTarget as HTMLElement);
    const sweep = () => {
      for (const el of document.querySelectorAll<HTMLElement>(SCROLLERS)) {
        if (!tracked.has(el)) {
          tracked.add(el);
          el.addEventListener("scroll", onScroll, { passive: true });
        }
        paint(el);
      }
    };
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(sweep, 120);
    };
    sweep();
    const content = document.querySelector(".rd-content");
    const observer = new MutationObserver(schedule);
    if (content) observer.observe(content, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    media.addEventListener("change", schedule);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      media.removeEventListener("change", schedule);
      for (const el of tracked) {
        el.removeEventListener("scroll", onScroll);
        delete el.dataset.scrollX;
      }
    };
  }, [pathname]);
  return null;
}
