"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./coinholders.module.css";

/** Room kept beside the selected tab when it is scrolled into view. */
const EDGE_PX = 24;

/**
 * The round tabs. Where they scroll sideways (phones), the selected tab is
 * scrolled into view on load and on every round change, and an edge fades
 * wherever more tabs wait. Only the strip scrolls, never the page.
 */
export function RoundTabsNav({
  current,
  children,
}: {
  current: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const tab = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (tab) {
      const box = nav.getBoundingClientRect();
      const at = tab.getBoundingClientRect();
      if (at.left < box.left) nav.scrollLeft += at.left - box.left - EDGE_PX;
      else if (at.right > box.right)
        nav.scrollLeft += at.right - box.right + EDGE_PX;
    }
    const edges = () => {
      const max = nav.scrollWidth - nav.clientWidth;
      nav.toggleAttribute("data-more-start", nav.scrollLeft > 1);
      nav.toggleAttribute("data-more-end", nav.scrollLeft < max - 1);
    };
    edges();
    nav.addEventListener("scroll", edges, { passive: true });
    const resize = new ResizeObserver(edges);
    resize.observe(nav);
    return () => {
      nav.removeEventListener("scroll", edges);
      resize.disconnect();
    };
  }, [current]);

  return (
    <nav ref={ref} className={styles.tabs} aria-label="Rounds">
      {children}
    </nav>
  );
}
