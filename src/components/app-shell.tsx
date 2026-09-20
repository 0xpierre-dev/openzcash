"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LogoutButton } from "./logout-button";
import { DESIGN_GROUPS, designGroup } from "@/lib/design-routes";
import {
  IconArrowUp,
  IconBalance,
  IconBook,
  IconChart,
  IconCheck,
  IconCoins,
  IconDashboard,
  IconGlobe,
  IconGrant,
  IconGrid,
  IconKey,
  IconList,
  IconMail,
  IconNews,
  IconPencil,
  IconReceipt,
  IconShield,
  IconSigma,
  IconSwap,
  IconTerminal,
  IconUsers,
  IconVote,
  IconWallet,
} from "./icons";
import type { ComponentType } from "react";

/** One line icon per route, from the set the launcher and the ZCG tiles use. */
const ROUTE_ICON: Record<string, ComponentType<{ className?: string }>> = {
  "/zcg": IconDashboard,
  "/zcg/grants": IconGrant,
  "/zcg/recipients": IconUsers,
  "/zcg/disbursements": IconReceipt,
  "/zcg/schedule": IconList,
  "/zcg/totals": IconChart,
  "/zcg/analytics": IconArrowUp,
  "/zcg/fpf": IconWallet,
  "/zcg/coinholder": IconCoins,
  "/zcg/proposals": IconVote,
  "/zcg/committee": IconUsers,
  "/zcg/meetings": IconBook,
  "/zcg/stipends": IconCoins,
  "/zcg/budget": IconBalance,
  "/zcg/office": IconGrid,
  "/lockbox": IconShield,
  "/zcg/reconciliation": IconCheck,
  "/zechub": IconGlobe,
  "/zf": IconBalance,
  "/shielded-labs": IconShield,
  "/z3": IconTerminal,
  "/ecosystem": IconGlobe,
  "/wallets": IconWallet,
  "/communities": IconUsers,
  "/defi": IconSwap,
  "/development": IconTerminal,
  "/news": IconNews,
  "/arborist": IconSigma,
  "/zcg/methodology": IconBook,
  "/zcg/copilot": IconTerminal,
  "/zcg/coinholder/copilot": IconTerminal,
  "/zechub/copilot": IconTerminal,
  "/projects": IconGrid,
  "/viewing-keys": IconKey,
  "/invites": IconMail,
  "/onboarding": IconPencil,
  "/login": IconShield,
};

/**
 * "Back" follows the trail, as the production BackButton did: a drill-down
 * returns to its own list, any other ZCG screen returns to the ZCG home (not
 * the launcher), a copilot returns to the app it serves, and every top-level
 * screen returns to Home.
 */
const DRILLDOWN: Record<string, { href: string; label: string }> = {
  "/zcg/grant": { href: "/zcg/grants", label: "Grants" },
  "/zcg/recipient": { href: "/zcg/recipients", label: "Recipients" },
  "/zechub/copilot": { href: "/zechub", label: "ZecHub" },
};

function backTarget(pathname: string): { href: string; label: string } {
  return (
    DRILLDOWN[pathname] ??
    (pathname.startsWith("/zcg/")
      ? { href: "/zcg", label: "ZCG" }
      : { href: "/", label: "Home" })
  );
}

type Theme = "light" | "dark";
const THEME_KEY = "oz-theme";
const GROUPS_KEY = "oz-nav-groups";
// The light workspace is the default everywhere; dark is a per-browser choice.
const THEME_ORDER: Theme[] = ["light", "dark"];
const THEME_LABEL: Record<Theme, string> = {
  light: "Light theme (switch to dark)",
  dark: "Dark theme (switch to light)",
};

function Icon({ d, size = 15 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d}></path>
    </svg>
  );
}
const ICON = {
  menu: "M2.5 4h11M2.5 8h11M2.5 12h11",
  search: "M11 11l3 3M3 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0z",
  home: "M2.5 7.5L8 3l5.5 4.5V13H9.5V9.5h-3V13H2.5z",
  sun: "M8 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M13 3l-1 1M4 12l-1 1",
  moon: "M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z",
  close: "M4 4l8 8M12 4l-8 8",
};

export function AppShell({
  children,
  isAdmin = false,
  isPreview = false,
  footer,
}: {
  children: ReactNode;
  isAdmin?: boolean;
  isPreview?: boolean;
  /** Server-rendered treasury bar, pinned to the bottom of every page. */
  footer?: ReactNode;
}) {
  const pathname = usePathname();
  // The "Manage" trail only exists for administrators; anonymous visitors on a
  // public route such as /onboarding must not be offered admin pages.
  const rawGroup = designGroup(pathname);
  const group = rawGroup?.name === "Manage" && !isAdmin ? undefined : rawGroup;
  const current = group?.routes.find(([href]) => href === pathname)?.[1];
  const groups = DESIGN_GROUPS.filter((g) => g.name !== "Manage" || isAdmin);
  const back = backTarget(pathname);
  const isHome = pathname === "/";

  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [counts, setCounts] = useState<Record<string, string>>({});
  const close = () => dialog.current?.close();
  const openDialog = () => dialog.current?.showModal();

  // Per-browser conveniences: the theme and which sidebar groups stay open.
  // Read after mount (reading storage during render breaks hydration).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const t = window.localStorage.getItem(THEME_KEY) as Theme | null;
      if (t && THEME_ORDER.includes(t)) setTheme(t);
      const g = window.localStorage.getItem(GROUPS_KEY);
      if (g) setOpenGroups(JSON.parse(g) as Record<string, boolean>);
    } catch {
      /* private mode or blocked storage: defaults apply */
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Record counts beside the sidebar items, read after the page paints.
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/nav-counts", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: Record<string, string>) => setCounts(d ?? {}))
      .catch(() => {
        /* counts are a convenience; the navigation works without them */
      });
    return () => ctrl.abort();
  }, []);

  // The drawer closes on navigation; ⌘K / Ctrl+K opens the record search.
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setNavOpen(false);
  }, [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (dialog.current?.open) close();
        else openDialog();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function cycleTheme() {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
    setTheme(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
  }
  function toggleGroup(name: string, fallbackOpen: boolean) {
    const next = { ...openGroups, [name]: !(openGroups[name] ?? fallbackOpen) };
    setOpenGroups(next);
    try {
      window.localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className={cn("rd-shell", isPreview && "rd-shell-preview")}
      data-theme={theme}
      data-nav={navOpen ? "open" : undefined}
      data-section={group?.name ?? (isHome ? "Home" : "Explore")}
    >
      <a href="#main-content" className="rd-skip">
        Skip to content
      </a>

      <aside className="rd-side" aria-label="OpenZcash">
        <div className="rd-side-brand">
          <Link href="/" className="rd-brand" aria-label="OpenZcash home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/zcash-mark.svg" width="28" height="28" alt="" />
            <span>OpenZcash</span>
          </Link>
          <span className="rd-side-tag">{isPreview ? "preview" : "public"}</span>
          <button
            type="button"
            className="rd-side-close"
            onClick={() => setNavOpen(false)}
            aria-label="Close menu"
          >
            <Icon d={ICON.close} />
          </button>
        </div>
        <nav className="rd-side-nav" aria-label="Apps">
          <Link
            href="/"
            className="rd-side-item rd-side-home"
            aria-current={isHome ? "page" : undefined}
          >
            <Icon d={ICON.home} />
            <span>Home</span>
            <small>treasuries · apps</small>
          </Link>
          {groups.map((g) => {
            const containsCurrent = g.routes.some(([href]) => href === pathname) ||
              (g.name === "Funding" &&
                (pathname === "/zcg/grant" || pathname === "/zcg/recipient"));
            const open = openGroups[g.name] ?? containsCurrent;
            return (
              <section key={g.name} className="rd-side-group" data-open={open}>
                <button
                  type="button"
                  className="rd-side-group-title"
                  aria-expanded={open}
                  onClick={() => toggleGroup(g.name, containsCurrent)}
                >
                  <span>{g.name}</span>
                  <span aria-hidden>{open ? "−" : "+"}</span>
                </button>
                {open
                  ? g.routes.map(([href, label]) => {
                      const RouteIcon = ROUTE_ICON[href];
                      return (
                        <Link
                          key={href}
                          href={href}
                          className="rd-side-item"
                          aria-current={href === pathname ? "page" : undefined}
                        >
                          {RouteIcon ? (
                            <RouteIcon className="rd-side-icon" />
                          ) : (
                            <span className="rd-side-icon" aria-hidden />
                          )}
                          <span className="rd-side-label">{label}</span>
                          {counts[href] ? (
                            <small className="tnum">{counts[href]}</small>
                          ) : null}
                        </Link>
                      );
                    })
                  : null}
              </section>
            );
          })}
        </nav>
        <div className="rd-side-foot">
          <Link href="/zcg/methodology">Sources &amp; methodology</Link>
          {isPreview ? (
            <a href="https://openzcash.org" target="_blank" rel="noreferrer">
              Current website ↗
            </a>
          ) : null}
          {isAdmin ? <LogoutButton /> : null}
        </div>
      </aside>
      <div
        className="rd-backdrop"
        aria-hidden="true"
        onClick={() => setNavOpen(false)}
      />

      <div className="rd-body">
        <header className="rd-topbar">
          <button
            type="button"
            className="rd-icon-button rd-menu"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
          >
            <Icon d={ICON.menu} size={17} />
          </button>
          {!isHome ? (
            <Link
              href={back.href}
              className="rd-back"
              aria-label={`Back to ${back.label}`}
              title={`Back to ${back.label}`}
            >
              ‹
            </Link>
          ) : null}
          <nav className="rd-breadcrumb" aria-label="Breadcrumb">
            <Link href={group?.routes[0][0] ?? "/"}>
              {group?.name ?? "Home"}
            </Link>
            {!isHome ? (
              <>
                <span aria-hidden>›</span>
                <span>
                  {current ??
                    (pathname === "/zcg/grant"
                      ? "Grant detail"
                      : pathname === "/zcg/recipient"
                        ? "Recipient detail"
                        : "All apps")}
                </span>
              </>
            ) : null}
          </nav>
          <button
            type="button"
            className="rd-search"
            onClick={openDialog}
            aria-label="Search records and apps"
          >
            <Icon d={ICON.search} size={14} />
            <span>Search records, grants, apps…</span>
            <kbd>⌘K</kbd>
          </button>
          <div className="rd-topbar-actions">
            <Link href="/zcg/copilot" className="rd-button rd-button-primary">
              Ask Copilot
            </Link>
            <button
              type="button"
              className="rd-icon-button"
              onClick={cycleTheme}
              aria-label={THEME_LABEL[theme]}
              title={THEME_LABEL[theme]}
            >
              <Icon d={theme === "dark" ? ICON.moon : ICON.sun} size={16} />
            </button>
          </div>
        </header>

        <main id="main-content" className="rd-main">
          <div className="rd-content">{children}</div>
          {group && (
            <nav className="ws-page-trail" aria-label="Related pages">
              <span>{group.name}</span>
              <div>
                {group.routes
                  .filter(([href]) => href !== pathname)
                  .map(([href, label]) => (
                    <Link key={href} href={href}>
                      {label}
                      <span aria-hidden>→</span>
                    </Link>
                  ))}
              </div>
            </nav>
          )}
          <footer className="rd-footer">
            <span>
              <strong>OpenZcash</strong>
              <span aria-hidden> / </span>Public transparency, thoughtfully
              connected.
            </span>
            <div>
              <Link href="/zcg/methodology">Sources &amp; methodology →</Link>
              <Link href={isPreview ? "/design-review" : "/"}>All apps →</Link>
            </div>
          </footer>
        </main>

        {footer ? (
          <footer className="rd-treasury-bar" aria-label="Treasury at a glance">
            {footer}
          </footer>
        ) : null}
      </div>

      <dialog
        aria-labelledby="app-directory-title"
        className="ws-app-dialog"
        ref={dialog}
        onClick={(e) => {
          if (e.target === dialog.current) close();
        }}
      >
        <div className="ws-dialog-heading">
          <div>
            <span className="ws-eyebrow">THE OPENZCASH WORKSPACE</span>
            <h2 id="app-directory-title">Where would you like to go?</h2>
          </div>
          <button
            type="button"
            aria-label="Close app directory"
            onClick={close}
          >
            ×
          </button>
        </div>
        <input
          aria-label="Find an app"
          placeholder="Find an app, record or source…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="ws-app-directory">
          {groups.map((g) => {
            const routes = g.routes.filter(([, label]) =>
              (label + " " + g.name)
                .toLowerCase()
                .includes(query.toLowerCase()),
            );
            return routes.length ? (
              <section key={g.name}>
                <h3>{g.name}</h3>
                {routes.map(([href, label]) => (
                  <Link key={href} href={href} onClick={close}>
                    {label}
                    <span aria-hidden>→</span>
                  </Link>
                ))}
              </section>
            ) : null;
          })}
        </div>
        <div className="ws-dialog-foot">
          <Link href="/" onClick={close}>
            All apps and treasuries →
          </Link>
        </div>
      </dialog>
    </div>
  );
}
