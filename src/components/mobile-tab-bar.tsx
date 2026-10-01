"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  MOBILE_TABS,
  currentTab,
  type MobileSheetId,
  type MobileTab,
} from "@/lib/mobile-tabs";
import { BottomSheet } from "./bottom-sheet";
import { ZarvisMark } from "./zarvis/zarvis-mark";
import { useZarvisOptional } from "./zarvis/zarvis-provider";

function TabIcon({ tab }: { tab: MobileTab }) {
  const chat = useZarvisOptional();
  if (!tab.icon) {
    // The centre tab: the Zarvis mark in a round badge, alive like the launcher it replaces.
    return (
      <span className="rd-tab-badge" aria-hidden="true">
        <ZarvisMark
          expression={chat?.expression}
          animated
          paused={chat?.motionPaused}
        />
      </span>
    );
  }
  return (
    <span className="rd-tab-glyph" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={tab.icon} alt="" width={22} height={22} />
    </span>
  );
}

/**
 * The phone shell's bottom tab bar (shown where the sidebar is a drawer; see
 * mobile-shell.css): Home, Treasury, Zarvis, Search, Apps. Home and Zarvis are
 * places; Treasury opens the treasury sheet, Search the ⌘K palette and Apps
 * the navigation drawer. The treasury sheet shows the same server-rendered
 * node the desktop pins to the bottom of the page.
 */
export function MobileTabBar({
  pathname,
  compact,
  treasury,
  appsOpen,
  onApps,
  searchOpen,
  onSearch,
}: {
  pathname: string;
  /** The viewport is at tab-bar width (the sidebar is a drawer). */
  compact: boolean;
  /** The server-rendered treasury node, handed over only at tab-bar width. */
  treasury?: ReactNode;
  appsOpen: boolean;
  onApps: () => void;
  searchOpen: boolean;
  onSearch: () => void;
}) {
  // The sheet remembers the page it was opened on, so it closes on navigation
  // and when the viewport leaves tab-bar width, with no effect to keep in sync.
  const [treasuryAt, setTreasuryAt] = useState<string | null>(null);
  const treasuryOpen = compact && treasuryAt === pathname;
  const current = currentTab(pathname);
  const sheets: Record<MobileSheetId, { open: boolean; press: () => void }> = {
    treasury: { open: treasuryOpen, press: () => setTreasuryAt(pathname) },
    search: { open: searchOpen, press: onSearch },
    apps: { open: appsOpen, press: onApps },
  };

  return (
    <>
      {/* Under the open drawer the bar is out of reach, like the page. */}
      <nav className="rd-tabbar" aria-label="Primary" inert={appsOpen}>
        {MOBILE_TABS.map((tab) =>
          tab.kind === "link" ? (
            <Link
              key={tab.id}
              href={tab.href}
              className={cn("rd-tab", !tab.icon && "rd-tab-centre")}
              aria-current={current === tab.id ? "page" : undefined}
            >
              <TabIcon tab={tab} />
              <span className="rd-tab-label">{tab.label}</span>
            </Link>
          ) : (
            <button
              key={tab.id}
              type="button"
              className="rd-tab"
              aria-haspopup="dialog"
              aria-expanded={sheets[tab.id].open}
              onClick={sheets[tab.id].press}
            >
              <TabIcon tab={tab} />
              <span className="rd-tab-label">{tab.label}</span>
            </button>
          ),
        )}
      </nav>
      <BottomSheet
        open={treasuryOpen}
        onOpenChange={(open) => setTreasuryAt(open ? pathname : null)}
        title="Treasury"
      >
        <div className="rd-treasury-sheet">{treasury}</div>
      </BottomSheet>
    </>
  );
}
