"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { MOBILE_NAV_QUERY } from "@/lib/mobile-tabs";
import { useMediaQuery } from "./use-media-query";

/**
 * One pool of the treasury bar. On wide screens it links to the pool's own
 * page; at tab-bar width the pool sits in the Treasury sheet as plain
 * figures, with nothing that opens another screen.
 */
export function TreasuryPool({
  href,
  className,
  title,
  children,
}: {
  href: string;
  className: string;
  title?: string;
  children: ReactNode;
}) {
  const compact = useMediaQuery(MOBILE_NAV_QUERY);
  if (compact) {
    return (
      <div className={className} title={title}>
        {children}
      </div>
    );
  }
  return (
    <Link href={href} className={className} title={title}>
      {children}
    </Link>
  );
}
