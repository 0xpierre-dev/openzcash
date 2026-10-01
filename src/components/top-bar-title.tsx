"use client";
import { useSyncExternalStore } from "react";
import { pageNameOf } from "@/lib/mobile-tabs";

/** The document title changes on navigation: watch the <title> in the head. */
function subscribe(notify: () => void) {
  const observer = new MutationObserver(notify);
  observer.observe(document.head, {
    subtree: true,
    childList: true,
    characterData: true,
  });
  return () => observer.disconnect();
}

/**
 * The phone top bar's page name on routes the navigation model has no entry
 * for (About Zarvis, Sign in), where the breadcrumb would be empty. Read from
 * the page's own document title; the site name until the browser answers.
 * Hidden on wide screens (mobile-shell.css), where the search field sits there.
 */
export function TopBarTitle() {
  const title = useSyncExternalStore(
    subscribe,
    () => document.title,
    () => "",
  );
  return <span className="rd-topbar-title">{pageNameOf(title)}</span>;
}
