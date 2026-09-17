"use client";
import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "./logout-button";
import { DESIGN_GROUPS, designGroup } from "@/lib/design-routes";

export function AppShell({
  children,
  isAdmin = false,
  isPreview = false,
}: {
  children: ReactNode;
  isAdmin?: boolean;
  isPreview?: boolean;
}) {
  const pathname = usePathname();
  const group = designGroup(pathname);
  const current = group?.routes.find(([href]) => href === pathname)?.[1];
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const groups = DESIGN_GROUPS.filter((g) => g.name !== "Manage" || isAdmin);
  const close = () => dialog.current?.close();
  const back =
    pathname === "/zcg/grant"
      ? "/zcg/grants"
      : pathname === "/zcg/recipient"
        ? "/zcg/recipients"
        : group?.routes[0][0] === pathname
          ? "/"
          : (group?.routes[0][0] ?? "/");
  return (
    <div className="rd-shell" data-section={group?.name ?? "Explore"}>
      <a href="#main-content" className="rd-skip">
        Skip to content
      </a>
      {isPreview && (
        <div className="rd-preview">
          <span>
            <i />
            OpenZcash preview
            <span className="rd-preview-note"> / New workspace</span>
          </span>
          <div className="rd-preview-actions">
            <a href="https://openzcash.org" target="_blank" rel="noreferrer">
              Current website ↗
            </a>
            <button type="button" onClick={() => dialog.current?.showModal()}>
              Browse apps <span aria-hidden>⌘</span>
            </button>
          </div>
        </div>
      )}
      <header className="rd-header">
        <div className="rd-header-inner">
          <div className="rd-brand-group">
            <Link
              href={back}
              className="rd-back"
              aria-label="Back to parent page"
            >
              ‹
            </Link>
            <Link href="/" className="rd-brand">
              <img src="/zcash-mark.svg" width="30" height="30" alt="" />
              <span>OpenZcash</span>
            </Link>
          </div>
          <nav aria-label="Main navigation" className="rd-primary-nav">
            <Link href="/">Apps & treasuries ↗</Link>
            <Link
              href="/ecosystem"
              aria-current={group?.name === "Ecosystem" ? "true" : undefined}
            >
              Ecosystem
            </Link>
            <Link
              href="/zcg/grants"
              aria-current={group?.name === "Funding" ? "true" : undefined}
            >
              Grants
            </Link>
            <Link
              href="/news"
              aria-current={pathname === "/news" ? "page" : undefined}
            >
              News
            </Link>
            <Link href="/monthly">Monthly ↗</Link>
          </nav>
          <div className="rd-header-actions">
            <button
              type="button"
              className="rd-explore"
              onClick={() => dialog.current?.showModal()}
            >
              Explore <span aria-hidden>↗</span>
            </button>
            {isAdmin && <LogoutButton />}
          </div>
        </div>
      </header>
      <main id="main-content" className="rd-main">
        <nav className="rd-breadcrumb" aria-label="Breadcrumb">
          <Link href={group?.routes[0][0] ?? "/"}>
            {group?.name ?? "Apps & treasuries"}
          </Link>
          <span aria-hidden>›</span>
          <span>
            {current ??
              (pathname === "/zcg/grant"
                ? "Grant detail"
                : pathname === "/zcg/recipient"
                  ? "Recipient detail"
                  : "All apps")}
          </span>
        </nav>
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
                    <span aria-hidden>↗</span>
                  </Link>
                ))}
            </div>
          </nav>
        )}
      </main>
      <footer className="rd-footer">
        <span>
          <strong>OpenZcash</strong>
          <span aria-hidden> / </span>Public transparency, thoughtfully
          connected.
        </span>
        <div>
          <Link href="/zcg/methodology">Sources & methodology ↗</Link>
          <Link href="/design-review">All apps ↗</Link>
        </div>
      </footer>
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
                    <span aria-hidden>↗</span>
                  </Link>
                ))}
              </section>
            ) : null;
          })}
        </div>
        <div className="ws-dialog-foot">
          <Link href="/design-review" onClick={close}>
            Explore all apps →
          </Link>
          {!isAdmin && (
            <Link href="/login" onClick={close}>
              Administrator sign in ↗
            </Link>
          )}
        </div>
      </dialog>
    </div>
  );
}
