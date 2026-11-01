"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppShell } from "./app-shell";
import { ZarvisProvider } from "./zarvis/zarvis-provider";

/** Monthly and Network own compact headers and use the full viewport. */
function isBare(pathname: string): boolean {
  return (
    pathname === "/zcash-network" ||
    pathname === "/monthly" ||
    pathname === "/monthly-preview" ||
    pathname.startsWith("/monthly/")
  );
}

/**
 * Decides the chrome on the CLIENT via usePathname, so it reacts to client-side
 * navigation. Deciding this in the root layout (server) was stale: the layout
 * does not re-render on navigation, so the shell from one route leaked onto the
 * next, duplicating the header.
 */
export function ShellGate({
  isAdmin,
  children,
  isPreview = false,
  bare = false,
  footer,
}: {
  isAdmin: boolean;
  children: ReactNode;
  isPreview?: boolean;
  /** Every page renders without the portal chrome (the committee demo host). */
  bare?: boolean;
  /** Server-rendered treasury bar, pinned to the bottom of shell pages. */
  footer?: ReactNode;
}) {
  const pathname = usePathname();
  // The conversation lives in the provider, above the chrome decision, so
  // opening a bare page (Monthly) and coming back keeps the chat intact.
  return (
    <ZarvisProvider>
      {bare || isBare(pathname) ? (
        children
      ) : (
        <AppShell isAdmin={isAdmin} isPreview={isPreview} footer={footer}>
          {children}
        </AppShell>
      )}
    </ZarvisProvider>
  );
}
