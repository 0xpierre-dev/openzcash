"use client";
import type { ReactNode } from "react";
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
  return (
    <div className="rd-shell">
      <a href="#main-content" className="rd-skip">
        Skip to content
      </a>
      {isPreview && (
        <div className="rd-preview">
          <span>
            <i /> Design preview{" "}
            <span className="rd-preview-note">· Separate test environment</span>
          </span>
          <a href="https://openzcash.org" target="_blank" rel="noreferrer">
            Current website ↗
          </a>
        </div>
      )}
      <header className="rd-header">
        <div className="rd-header-inner">
          <Link href="/" className="rd-brand">
            <img src="/zcash-mark.svg" width="30" height="30" alt="" />
            <span>
              OpenZcash<small>Public transparency</small>
            </span>
          </Link>
          <nav aria-label="Main navigation" className="rd-primary-nav">
            {DESIGN_GROUPS.filter((g) => g.name !== "Manage" || isAdmin).map(
              (g) => (
                <Link
                  key={g.name}
                  href={g.routes[0][0]}
                  aria-current={group?.name === g.name ? "true" : undefined}
                >
                  {g.name}
                </Link>
              ),
            )}
          </nav>
          <div className="rd-header-actions">
            <Link href="/design-review" className="rd-explore">
              All screens <span aria-hidden>↗</span>
            </Link>
            {isAdmin && <LogoutButton />}
          </div>
        </div>
        {group && (
          <nav
            className="rd-section-nav"
            aria-label={`${group.name} navigation`}
          >
            {group.routes.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? "page" : undefined}
              >
                {label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main id="main-content" className="rd-main">
        <nav className="rd-breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Apps & treasuries</Link>
          <span aria-hidden>/</span>
          {group && (
            <>
              <Link href={group.routes[0][0]}>{group.name}</Link>
              <span aria-hidden>/</span>
            </>
          )}
          <span>
            {current ??
              (pathname === "/zcg/grant"
                ? "Grant detail"
                : pathname === "/zcg/recipient"
                  ? "Recipient detail"
                  : "Explore")}
          </span>
        </nav>
        <div className="rd-content">{children}</div>
      </main>
      <footer className="rd-footer">
        <span>
          OpenZcash <span aria-hidden>·</span> Follow the funding. See the
          sources.
        </span>
        <div>
          <Link href="/zcg/methodology">Sources & methodology</Link>
          <Link href="/design-review">Explore all screens →</Link>
        </div>
      </footer>
    </div>
  );
}
