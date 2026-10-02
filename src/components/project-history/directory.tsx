"use client";
import Link from "next/link";
import { useState } from "react";
import styles from "./history.module.css";

export function HistoryDirectory({ items }: { items: { id: string; name: string; description: string; category: string }[] }) {
  const [search, setSearch] = useState(""), [category, setCategory] = useState("");
  const [limit, setLimit] = useState(24);
  const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matched = items.filter(item => (!category || item.category === category) && terms.every(term => `${item.name} ${item.id}`.toLowerCase().includes(term)));
  return <>
    <div className={styles.filters}>
      <label className={styles.search}>Find a project or community<input type="search" value={search} placeholder="Zaino, Zcash Brazil, ZecHub…" onChange={event => { setSearch(event.target.value); setLimit(24); }} /></label>
      <label>Category<select value={category} onChange={event => { setCategory(event.target.value); setLimit(24); }}><option value="">All categories</option>{[...new Set(items.map(item => item.category))].sort().map(name => <option key={name}>{name}</option>)}</select></label>
    </div>
    <p className={styles.muted} aria-live="polite">{matched.length} {matched.length === 1 ? "history" : "histories"} · curated identities, with source coverage shown in each profile</p>
    <div className={styles.directory}>{matched.slice(0, limit).map(item => <Link className={styles.entry} key={item.id} href={`/ecosystem/history/${item.id}`} prefetch={false}>
      <span>{item.category}</span><h2>{item.name}</h2><p>{item.description}</p><span>Open history ↗</span>
    </Link>)}</div>
    {!matched.length && <p className={styles.empty}>No matching identity in the current catalog. Try a project name or another category.</p>}
    {matched.length > limit && <button className={styles.more} onClick={() => setLimit(limit + 24)}>Show more histories</button>}
  </>;
}
