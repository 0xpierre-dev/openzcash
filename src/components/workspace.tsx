import Link from "next/link";
import type { ReactNode } from "react";

export function SectionHeading({
  title,
  count,
  description,
  action,
}: {
  title: string;
  count?: ReactNode;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="ws-section-heading">
      <div>
        <h2>
          {title}
          {count != null && <span>{count}</span>}
        </h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Facts({
  title,
  rows,
  children,
}: {
  title: string;
  rows: [string, ReactNode][];
  children?: ReactNode;
}) {
  return (
    <section className="ws-facts">
      <h2>{title}</h2>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {children}
    </section>
  );
}

export function RelatedLinks({
  title = "Connected records",
  links,
}: {
  title?: string;
  links: { href: string; label: string; description?: string }[];
}) {
  return (
    <section className="ws-related">
      <h2>{title}</h2>
      {links.map((l) => (
        <Link key={l.href} href={l.href}>
          <span>
            <strong>{l.label}</strong>
            {l.description && <small>{l.description}</small>}
          </span>
          <span aria-hidden>↗</span>
        </Link>
      ))}
    </section>
  );
}

export function RecordLayout({
  children,
  aside,
}: {
  children: ReactNode;
  aside: ReactNode;
}) {
  return (
    <div className="ws-record-layout">
      <div className="ws-record-body">{children}</div>
      <aside className="ws-record-aside">{aside}</aside>
    </div>
  );
}

export function ProgressRail({
  paid,
  total,
  note = "Payment status follows the ledger; delivery evidence should be checked at the source.",
}: {
  paid: number;
  total: number;
  note?: string;
}) {
  return (
    <section className="ws-progress">
      <div>
        <h2>From commitment to delivery</h2>
        <span>
          {paid} of {total} milestones paid
        </span>
      </div>
      <div
        className="ws-progress-track"
        role="img"
        aria-label={`${paid} of ${total} milestones paid`}
      >
        <span
          style={{
            width: `${total ? Math.min(100, (paid / total) * 100) : 0}%`,
          }}
        />
      </div>
      <p>{note}</p>
    </section>
  );
}

export function FeatureLink({
  eyebrow,
  title,
  description,
  href,
  label,
}: {
  eyebrow?: string;
  title: ReactNode;
  description: ReactNode;
  href: string;
  label: string;
}) {
  return (
    <section className="ws-feature-link">
      <div>
        {eyebrow && <small>{eyebrow}</small>}
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <Link className="ws-button" href={href}>
        {label}
        <span aria-hidden>→</span>
      </Link>
    </section>
  );
}

export function EditorialIntro({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="ws-editorial">
      <div>
        <span className="ws-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children && <div className="ws-editorial-side">{children}</div>}
    </section>
  );
}

export function SourceNote({
  children,
  href = "/zcg/methodology",
  label = "Sources & methodology",
}: {
  children: ReactNode;
  href?: string;
  label?: string;
}) {
  return (
    <div className="ws-source-note">
      <p>{children}</p>
      <Link href={href}>{label} ↗</Link>
    </div>
  );
}
