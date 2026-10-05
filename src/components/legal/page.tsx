import Image from "next/image";
import { Suspense } from "react";
import { IconBalance } from "@/components/icons";
import type { LegalFeed } from "@/lib/legal/types";
import { legalDate } from "@/lib/legal/presentation";
import { LegalNewsroom } from "./newsroom";
import styles from "./legal.module.css";

const PGP_JOIN_URL = "https://community.pgpz.org/signin?callbackUrl=%2F&reason=signup";

function PgpSpotlight({ feed }: { feed: LegalFeed }) {
  const latest = [...feed.items].filter(item => item.sourceId === "pgp").sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
  return <section id="pgp" className={styles.pgpFeature} aria-labelledby="pgp-title">
    <div className={styles.pgpArt}>
      <span className={styles.artLabel}>A VOICE FOR FINANCIAL PRIVACY</span>
      <Image src="/logos/pgpz.png" alt="Pretty Good Policy for Zcash" width={440} height={198} unoptimized priority/>
      <span className={styles.artCaption}>Privacy. Policy. People.</span>
    </div>
    <div className={styles.pgpContent}>
      <p className={styles.eyebrow}>FEATURED · PGP FOR ZCASH</p>
      <h2 id="pgp-title">Follow the policy debate.</h2>
      <p className={styles.pgpDescription}>Pretty Good Policy for Zcash brings financial privacy into the public policy debate through education, analysis and advocacy.</p>
      <ul className={styles.pgpTopics} aria-label="PGP coverage"><li>Weekly policy memos</li><li>Public statements</li><li>Community discussions</li></ul>
      <div className={styles.pgpActions}>
        <a className={styles.primaryAction} href={PGP_JOIN_URL} target="_blank" rel="noopener noreferrer"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>Join PGP by email <span aria-hidden="true">↗</span></a>
        <a className={styles.secondaryAction} href="https://pgpz.org/" target="_blank" rel="noopener noreferrer">About PGP <span aria-hidden="true">↗</span></a>
      </div>
      <p className={styles.signupNote}>Create an account on PGPZ with an email sign-in link. Full memos and discussions may require membership.</p>
      {latest && <a className={styles.latestMemo} href={latest.url} target="_blank" rel="noopener noreferrer"><span>Latest public highlight · <time dateTime={latest.publishedAt}>{legalDate(latest.publishedAt)}</time></span><strong>{latest.title}<span aria-hidden="true"> ↗</span></strong></a>}
    </div>
  </section>;
}

export function LegalPage({ feed }: { feed: LegalFeed }) {
  const health = feed.sourceHealth ?? [{ sourceId: "pgp", status: feed.pgpStatus, lastSuccessAt: feed.pgpLastSuccessAt }];
  return <div className={styles.page}>
    <header className={styles.hero}>
      <div><h1 className={styles.kicker}><IconBalance/>PRIVACY · POLICY · RIGHTS</h1><p>The rules and debates shaping financial privacy. Zcash, countries and public policy, with original sources.</p></div>
      <a className={styles.heroLink} href="#updates">Browse updates <span aria-hidden="true">↓</span></a>
    </header>
    <PgpSpotlight feed={feed}/>
    <section id="updates" className={styles.updates} aria-labelledby="updates-title">
      <div className={styles.sectionHeading}><h2 id="updates-title">Updates</h2><span>Public sources. Dated context.</span></div>
      <Suspense fallback={<p>Loading filters…</p>}><LegalNewsroom feed={feed}/></Suspense>
    </section>
    <details className={styles.sources}><summary>Sources &amp; coverage <span aria-hidden="true">+</span></summary>
      <div className={styles.sourceContent}><p>Public PGPZ highlights and relevant Banco Central do Brasil press notes are collected from their official public feeds. Reviewed documents add context from other authorities. Publication, update and application dates stay separate.</p>
      {feed.archive && <p><strong>Daily collection:</strong> {feed.archive.status === "available" && feed.archive.lastCollectedAt ? `Public-source history is stored. Last successful collection: ${legalDate(feed.archive.lastCollectedAt)} (São Paulo calendar).` : "The daily archive is not available in this environment. Reviewed source records remain visible."}</p>}
      {health.map(health => <p key={health.sourceId}><strong>{feed.sources.find(source => source.id === health.sourceId)?.name ?? health.sourceId}:</strong> {health.status === "live" ? "Public feed retrieved successfully." : health.status === "cached" ? "Temporarily unavailable. Showing the last successful retrieval." : "Could not refresh. Reviewed records remain available."}{health.lastSuccessAt ? ` Last successful read: ${legalDate(health.lastSuccessAt)}.` : ""}</p>)}
      <p>The complete PGPZ member archive is not covered. PGP is an independent source of advocacy and analysis; it does not speak for regulators.</p>
      <ul>{feed.sources.map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.name} ↗</a><span>{source.role} · {source.mode === "live" ? "Public feed + reviewed records" : "Reviewed documents"}</span></li>)}</ul>
      <p>Coverage is selective. Status labels summarize dated source documents; they do not replace legal advice or establish Zcash’s legality in every jurisdiction.</p></div>
    </details>
  </div>;
}
