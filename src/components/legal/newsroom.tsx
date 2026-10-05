"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { LEGAL_REGIONS, LEGAL_TOPICS, type LegalFeed } from "@/lib/legal/types";
import { filterLegalItems, legalDate } from "@/lib/legal/presentation";
import styles from "./legal.module.css";

export function LegalNewsroom({ feed, pgpOnly = false }: { feed: LegalFeed; pgpOnly?: boolean }) {
  const params = useSearchParams();
  const [limit, setLimit] = useState(12);
  const region = LEGAL_REGIONS.some(item => item.id === params.get("region")) ? params.get("region")! : "all";
  const topic = LEGAL_TOPICS.some(item => item === params.get("topic")) ? params.get("topic")! : "";
  const q = params.get("q") ?? "";
  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value && value !== "all") next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    window.history.replaceState(null, "", `${pgpOnly ? "/legal/pgp" : "/legal"}${query ? `?${query}` : ""}`);
    setLimit(12);
  };
  const baseItems = feed.items.filter(item => !pgpOnly || item.sourceId === "pgp");
  const shown = filterLegalItems(baseItems, { region, topic, q });
  const filtered = region !== "all" || !!topic || !!q;
  const sources = new Map(feed.sources.map(source => [source.id, source]));
  return <div className={styles.newsroom}>
    <div className={styles.feedMain}>
      <nav className={styles.regions} aria-label="Policy update regions">
        {LEGAL_REGIONS.map(item => <button key={item.id} type="button" aria-pressed={region === item.id} onClick={() => update({ region: item.id })}>{item.label}</button>)}
      </nav>
      <div className={styles.filters}>
        <label className={`ws-field ${styles.search}`}><span className={styles.srOnly}>Search policy updates</span><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input type="search" value={q} placeholder="Search a country, topic or update…" onChange={event => update({ q: event.target.value })}/></label>
        <label className={styles.topic}><span className={styles.srOnly}>Topic</span><select value={topic} onChange={event => update({ topic: event.target.value })}><option value="">All topics</option>{LEGAL_TOPICS.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      </div>
      <div className={styles.results}><p role="status">{shown.length} {shown.length === 1 ? "update" : "updates"}<span> · newest first</span></p>{filtered && <button type="button" onClick={() => update({ q: "", region: "", topic: "" })}>Clear filters ×</button>}</div>
      <div className={styles.articles}>
        {shown.slice(0, limit).map(item => <article key={item.id} className={styles.article}>
          <div className={styles.articleMeta}><time dateTime={item.publishedAt}>{item.dateBasis === "updated" && "Updated "}{legalDate(item.publishedAt)}</time><span>{item.jurisdictions.join(" · ")}</span></div>
          <div className={styles.articleBody}>
            <div className={styles.sourceLine}><span>{sources.get(item.sourceId)?.name ?? item.sourceId}</span><span aria-hidden="true">·</span><span>{item.kind}</span></div>
            <h2><a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}<span aria-hidden="true">↗</span><span className={styles.srOnly}> (opens source in a new tab)</span></a></h2>
            <p className={styles.summary}>{item.summary}</p>
            <div className={styles.articleFoot}><span className={styles.status} data-status={item.status}>{item.status}</span>{item.effectiveAt && <span>Applies from {legalDate(item.effectiveAt)}</span>}{item.reportingPeriod && <span>{item.reportingPeriod}</span>}</div>
            {item.statusDetail && <p className={styles.context}>{item.statusDetail}</p>}
          </div>
        </article>)}
      </div>
      {!shown.length && <div className={styles.empty}><h2>No matching updates</h2><p>Try another region or topic. Our coverage is selective; no entry does not mean no legal developments.</p><button type="button" onClick={() => update({ q: "", region: "", topic: "" })}>Show all updates</button></div>}
      {shown.length > limit && <button className={styles.more} type="button" onClick={() => setLimit(limit + 12)}>Show more updates</button>}
    </div>
    <aside className={styles.sidebar} aria-label="Policy coverage">
      {!pgpOnly && <div className={styles.pgpCard}><span className={styles.eyebrow}>POLICY DESK</span><div className={styles.pgpWordmark}><Image src="/logos/pgpz.png" alt="Pretty Good Policy for Zcash" width={180} height={81} unoptimized/></div><h2>Privacy in the policy debate.</h2><p>Public policy memos and advocacy from the PGPZ community.</p><Link href="/legal/pgp">Explore PGP <span aria-hidden="true">↗</span></Link></div>}
      <div className={styles.guide}><h2>Read the status.</h2><p>A proposal is not a law. Analysis is not an official decision.</p><div><b>Analysis</b><span>Reporting and advocacy</span></div><div><b>Proposal / consultation</b><span>Under consideration</span></div><div><b>Adopted / in force</b><span>Check the scope and start date</span></div><p className={styles.guideNote}>Jurisdictions describe the source’s scope, not a rating of whether Zcash is legal in a country.</p></div>
    </aside>
  </div>;
}
