"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ZarvisDock } from "./zarvis/zarvis-dock";
import { LogoutButton } from "./logout-button";
import { ScrollHints } from "./scroll-hints";
import { APPS, backOf, overviewEntry, placeOf } from "@/lib/design-routes";
import { AppMark, GLYPH, Glyph, PageMark } from "./app-marks";
import { CommandPalette } from "./command-palette";

type Theme = "light" | "dark";
const THEME_KEY = "oz-theme";
const OPEN_KEY = "oz-nav-open";
// The light workspace is the default everywhere; dark is a per-browser choice.
const THEME_ORDER: Theme[] = ["light", "dark"];
const THEME_LABEL: Record<Theme, string> = {
  light: "Light theme (switch to dark)",
  dark: "Dark theme (switch to light)",
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
  const rawPlace = placeOf(pathname);
  // Data-management pages exist for administrators only; an anonymous visitor
  // on the public /onboarding route gets no trail into them.
  const place = rawPlace?.app.admin && !isAdmin ? undefined : rawPlace;
  // Hidden apps (Lockbox) open only from the treasury bar.
  const apps = APPS.filter((a) => (!a.admin || isAdmin) && !a.hidden);
  const back = backOf(pathname);
  const isHome = pathname === "/zcg" || pathname === "/";

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [openApps, setOpenApps] = useState<Record<string, boolean>>({});
  const [counts, setCounts] = useState<Record<string, string>>({});

  // Per-browser conveniences: the theme and which apps stay expanded.
  // Read after mount (reading storage during render breaks hydration).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const t = window.localStorage.getItem(THEME_KEY) as Theme | null;
      if (t && THEME_ORDER.includes(t)) setTheme(t);
      const o = window.localStorage.getItem(OPEN_KEY);
      if (o) setOpenApps(JSON.parse(o) as Record<string, boolean>);
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

  // The drawer and the search close on navigation; ⌘K / Ctrl+K toggles the search.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setNavOpen(false);
    setPaletteOpen(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [pathname]);
  // The page behind an open drawer stays put.
  useEffect(() => {
    document.body.style.overflow = navOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [navOpen]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((isOpen) => !isOpen);
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
  function saveOpenApps(next: Record<string, boolean>) {
    setOpenApps(next);
    try {
      window.localStorage.setItem(OPEN_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  function toggleApp(id: string, fallbackOpen: boolean) {
    saveOpenApps({ ...openApps, [id]: !(openApps[id] ?? fallbackOpen) });
  }
  /** Following an app's name also opens its list, even after the visitor collapsed it. */
  function openApp(id: string) {
    if (openApps[id] === false) saveOpenApps({ ...openApps, [id]: true });
  }

  return (
    <div
      className={cn("rd-shell", isPreview && "rd-shell-preview")}
      data-theme={theme}
      data-nav={navOpen ? "open" : undefined}
      data-section={place?.app.label ?? "Explore"}
    >
      <a href="#main-content" className="rd-skip">
        Skip to content
      </a>

      <aside className="rd-side" aria-label="OpenZcash">
        <div className="rd-side-banner">
          <button
            type="button"
            className="rd-side-close"
            onClick={() => setNavOpen(false)}
            aria-label="Close menu"
          >
            <Glyph d={GLYPH.close} />
          </button>
          <Link href="/zcg" className="rd-brand" aria-label="OpenZcash home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/marks/openzcash.png" width="68" height="68" alt="" />
            <span className="rd-brand-text">
              <strong>OpenZcash</strong>
            </span>
          </Link>
        </div>
        <nav className="rd-side-nav" aria-label="Apps">
          {apps.map((app) => {
            const isCurrentApp = place?.app.id === app.id;
            const open = app.pages.length
              ? (openApps[app.id] ?? (isCurrentApp || app.open === true))
              : false;
            const appActive = isCurrentApp && !place?.page;
            // Apps with inner pages list their landing page as "Overview", so the
            // open list carries the highlight; the name keeps it when collapsed.
            const overview = overviewEntry(app);
            return (
              <div key={app.id} className="rd-side-app" data-open={open}>
                <div className="rd-side-app-row">
                  <Link
                    href={app.href}
                    className="rd-side-item"
                    aria-current={appActive && !(overview && open) ? "page" : undefined}
                    title={app.sub}
                    onClick={() => openApp(app.id)}
                    data-long={app.label.length > 18 || undefined}
                  >
                    <AppMark app={app} />
                    <span className="rd-side-label">{app.label}</span>
                    {app.share ? (
                      <small className="rd-side-share tnum" title={app.share.label}>
                        <span aria-hidden>{app.share.value}</span>
                        <span className="sr-only">, {app.share.label}</span>
                      </small>
                    ) : null}
                    {counts[app.href] ? (
                      <small className="tnum">{counts[app.href]}</small>
                    ) : null}
                  </Link>
                  {app.pages.length ? (
                    <button
                      type="button"
                      className="rd-side-toggle"
                      aria-expanded={open}
                      aria-label={`${open ? "Collapse" : "Expand"} ${app.label}`}
                      onClick={() => toggleApp(app.id, isCurrentApp || app.open === true)}
                    >
                      <Glyph d={GLYPH.chevron} size={12} />
                    </button>
                  ) : null}
                </div>
                {open ? (
                  <div className="rd-side-pages">
                    {overview ? (
                      <Link
                        href={overview.href}
                        className="rd-side-item rd-side-page"
                        aria-current={appActive ? "page" : undefined}
                      >
                        <PageMark mark={overview.mark} href={overview.href} />
                        <span className="rd-side-label">{overview.label}</span>
                      </Link>
                    ) : null}
                    {app.pages.filter((p) => !p.hidden).map((p) => {
                      const active =
                        place?.page?.href === p.href ||
                        place?.detail?.parent.href === p.href;
                      return (
                        <Link
                          key={p.href}
                          href={p.href}
                          className="rd-side-item rd-side-page"
                          aria-current={active ? "page" : undefined}
                        >
                          <PageMark mark={p.mark} href={p.href} />
                          <span className="rd-side-label">{p.label}</span>
                          {counts[p.href] ? (
                            <small className="tnum">{counts[p.href]}</small>
                          ) : null}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
        <div className="rd-side-foot">
          <Link href="/zcg/methodology">Sources &amp; methodology</Link>
          <Link href="/zarvis/about">About Zarvis</Link>
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
            <Glyph d={GLYPH.menu} size={17} />
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
            {place ? (
              <>
                {place.page ? (
                  <Link href={place.app.href}>{place.app.label}</Link>
                ) : (
                  <span>{place.app.label}</span>
                )}
                {place.page ? (
                  <>
                    <span aria-hidden>›</span>
                    {place.detail ? (
                      <Link href={place.page.href}>{place.page.label}</Link>
                    ) : (
                      <span>{place.page.label}</span>
                    )}
                  </>
                ) : null}
                {place.detail ? (
                  <>
                    <span aria-hidden>›</span>
                    <span>{place.detail.label}</span>
                  </>
                ) : null}
              </>
            ) : null}
          </nav>
          <button
            type="button"
            className="rd-search"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search pages, grants and apps"
            aria-haspopup="dialog"
          >
            <Glyph d={GLYPH.search} size={14} />
            <span>Search pages, grants, apps…</span>
            <kbd>⌘K</kbd>
          </button>
          <div className="rd-topbar-actions">
            <Link href="/zarvis" className="rd-button rd-button-primary">
              Ask Zarvis
            </Link>
            <button
              type="button"
              className="rd-icon-button"
              onClick={cycleTheme}
              aria-label={THEME_LABEL[theme]}
              title={THEME_LABEL[theme]}
            >
              <Glyph d={theme === "dark" ? GLYPH.moon : GLYPH.sun} size={16} />
            </button>
          </div>
        </header>

        <main id="main-content" className="rd-main">
          <ScrollHints />
          <div className="rd-content">{children}</div>
        </main>

        {footer ? (
          <footer className="rd-treasury-bar" aria-label="Treasury at a glance">
            {footer}
          </footer>
        ) : null}
      </div>

      <ZarvisDock />
      <CommandPalette apps={apps} open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
