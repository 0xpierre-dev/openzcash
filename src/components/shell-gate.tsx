"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppShell } from "./app-shell";

/** Monthly owns its compact header so a complete PDF page fits the viewport. */
function isBare(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/monthly" ||
    pathname === "/monthly-preview" ||
    pathname.startsWith("/monthly/") ||
    pathname.startsWith("/onboarding")
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
}: {
  isAdmin: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  if (isBare(pathname)) return <>{children}</>;
  return <AppShell isAdmin={isAdmin}>{children}</AppShell>;
}
