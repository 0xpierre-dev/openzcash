import Link from "next/link";
import { Suspense } from "react";
import { IconBalance } from "@/components/icons";
import type { LegalFeed } from "@/lib/legal/types";
import { legalDate } from "@/lib/legal/presentation";
import { LegalNewsroom } from "./newsroom";
import styles from "./legal.module.css";

export function LegalPage({ feed, pgpOnly = false }: { feed: LegalFeed; pgpOnly?: boolean }) {
  const sources = feed.sources.filter(source => !pgpOnly || source.id === "pgp");
  const health = (feed.sourceHealth ?? [{ sourceId: "pgp", status: feed.pgpStatus, lastSuccessAt: feed.pgpLastSuccessAt }]).filter(source => !pgpOnly || source.sourceId === "pgp");
  return <div className={styles.page}>
    <header className={styles.hero}>
      <div><div className={styles.kicker}><IconBalance/>PRIVACY · POLICY · RIGHTS</div><h1>{pgpOnly ? "PGP for Zcash" : "Privacy & Policy"}</h1><p>{pgpOnly ? "Pretty Good Policy for Zcash. Independent policy education, analysis and advocacy for financial privacy." : "The rules and debates shaping financial privacy. Follow Zcash, countries and public policy."}</p></div>
      {pgpOnly && <a className={styles.heroLink} href="https://pgpz.org" target="_blank" rel="noopener noreferrer">Official website ↗</a>}
    </header>
    <nav className={styles.tabs} aria-label="Privacy & Policy"><Link href="/legal" aria-current={!pgpOnly ? "page" : undefined}>Updates</Link><Link href="/legal/pgp" aria-current={pgpOnly ? "page" : undefined}>PGP</Link></nav>
    {pgpOnly && <div className={styles.pgpIntro}><p><strong>Public highlights.</strong> Full memos and the wider archive may require PGPZ sign-in.</p><a href="https://community.pgpz.org" target="_blank" rel="noopener noreferrer">PGPZ community ↗</a></div>}
    <Suspense fallback={<p>Loading filters…</p>}><LegalNewsroom feed={feed} pgpOnly={pgpOnly}/></Suspense>
    <details className={styles.sources}><summary>Sources & coverage <span aria-hidden="true">+</span></summary>
      <div className={styles.sourceContent}><p>{pgpOnly ? "Public PGPZ highlights refresh hourly when this section is visited. Publication dates come from the publisher." : "Public PGPZ highlights and relevant Banco Central do Brasil press notes refresh hourly when this section is visited. Reviewed documents add context from other authorities. Publication, update and application dates stay separate."}</p>
      {health.map(health => <p key={health.sourceId}><strong>{feed.sources.find(source => source.id === health.sourceId)?.name ?? health.sourceId}:</strong> {health.status === "live" ? "Public feed retrieved successfully." : health.status === "cached" ? "Temporarily unavailable. Showing the last successful retrieval." : "Could not refresh. Reviewed records remain available."}{health.lastSuccessAt ? ` Last successful read: ${legalDate(health.lastSuccessAt)}.` : ""}</p>)}
      <p>The complete PGPZ archive is not covered. Feed caches reset on restart; selected reviewed records remain available.</p>
      <ul>{sources.map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.name} ↗</a><span>{source.role} · {source.mode === "live" ? "Public feed + reviewed records" : "Reviewed documents"}</span></li>)}</ul>
      <p>Coverage is selective. Status labels summarize dated source documents; they do not replace legal advice or establish Zcash’s legality in every jurisdiction.</p></div>
    </details>
  </div>;
}
