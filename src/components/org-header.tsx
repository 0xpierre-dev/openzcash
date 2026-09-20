import type { ReactNode } from "react";
import { Stat } from "@/components/ui";

export type OrgLink = { href: string; label: string };
export type OrgStat = { label: string; value: ReactNode; sub?: ReactNode };

/**
 * The head of an organisation's page: its official mark (the same PNG the
 * sidebar and the Monthly report use), the name, one line of what it is, its
 * public addresses and, when there are figures, a stat strip.
 */
export function OrgHeader({
  name,
  logo,
  tagline,
  links = [],
  actions,
  stats = [],
}: {
  name: string;
  logo: string;
  tagline: string;
  links?: OrgLink[];
  actions?: ReactNode;
  stats?: OrgStat[];
}) {
  return (
    <>
      <header className="ws-org-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" width={64} height={64} className="ws-org-logo" />
        <div className="ws-org-text">
          <h1>{name}</h1>
          <p>{tagline}</p>
          {links.length > 0 ? (
            <p className="ws-org-links">
              {links.map((l) => (
                <a key={l.href} href={l.href} target="_blank" rel="noreferrer">
                  {l.label} ↗
                </a>
              ))}
            </p>
          ) : null}
        </div>
        {actions ? <div className="ws-org-actions">{actions}</div> : null}
      </header>
      {stats.length > 0 ? (
        <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <Stat key={s.label} label={s.label} value={s.value} sub={s.sub} />
          ))}
        </section>
      ) : null}
    </>
  );
}
