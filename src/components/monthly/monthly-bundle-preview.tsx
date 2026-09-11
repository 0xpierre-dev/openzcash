"use client";

/* eslint-disable @next/next/no-img-element -- Small same-origin brand mark. */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MonthlyReader } from "./monthly-reader";
import type { MonthlyEdition } from "@/lib/monthly/catalog";
import { sourceUrl } from "@/lib/monthly/reader";
import data from "./bundle-preview-data.json";
import styles from "./monthly-bundle-preview.module.css";

type View = "monthly" | "voter" | "sources";
type Register = "sources" | "communities" | "requests";
type Entry = { name: string; detail: string; url: string; amount?: number };
const docs = data.documents as Record<"monthly" | "voter", MonthlyEdition>;
const tabs: {id: View; name: string; count: string}[] = [
  {id:"monthly", name:"Monthly", count:`${docs.monthly.pageCount} pages`},
  {id:"voter", name:"Voter Supplement", count:`${docs.voter.pageCount} pages`},
  {id:"sources", name:"Sources & Data", count:`${data.sources.length} sources`},
];
function Symbol({name}: {name: View | "download" | "expand" | "left" | "right" | "search" | "external"}) {
  const paths = {
    monthly:<><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Z"/><path d="M12 5v15"/></>,
    voter:<><path d="m8 3-4 4 9 9 7-7-6-6H8Z"/><path d="m10 7 2 2 3-3M4 14v6h16v-6M8 15h8"/></>,
    sources:<><path d="M5 3h12l3 3v15H5V3ZM9 8h6M9 12h7M9 16h7"/></>,
    download:<><path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4"/></>,
    expand:<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>,
    left:<path d="m14 6-6 6 6 6"/>, right:<path d="m10 6 6 6-6 6"/>,
    search:<><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,
    external:<path d="M14 3h7v7m0-7L10 14M10 5H4v15h15v-6"/>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function SourcesPanel() {
  const [register, setRegister] = useState<Register>("sources");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(6);
  const rowsBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.max(1, Math.min(8, Math.floor(entry.contentRect.height / 66)));
      setPageSize(next); setPage(0);
    });
    if (rowsBox.current) observer.observe(rowsBox.current);
    return () => observer.disconnect();
  }, []);
  const all: Entry[] = data[register];
  const matches = all.filter(e => `${e.name} ${e.detail}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const maxPage = Math.max(0,Math.ceil(matches.length/pageSize)-1);
  const currentPage = Math.min(page,maxPage);
  const visible = matches.slice(currentPage*pageSize,(currentPage+1)*pageSize);
  const labels = {sources:"Source index",communities:"Community coverage",requests:"Q3 grant requests"};
  function exportCsv() {
    const quote = (s: string) => `"${s.replaceAll('"','""')}"`;
    const csv = ["Name,Detail,USD requested,Source",...matches.map(e=>[e.name,e.detail,e.amount?.toString()||"",e.url].map(quote).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));
    const link = document.createElement("a");link.href=url;link.download=`OpenZcash-Sep1-10-${register}.csv`;link.click();URL.revokeObjectURL(url);
  }
  return <section className={styles.dataPanel} aria-label="Sources and data explorer">
    <div className={styles.dataHeading}>
      <div><span className={styles.eyebrow}>THE EVIDENCE BEHIND THE ISSUE</span><h1>Go deeper.</h1><p>Complete registers from the September 10 snapshot.</p></div>
      <button className={styles.export} onClick={exportCsv}><Symbol name="download"/>Export CSV</button>
    </div>
    <div className={styles.filters}>
      <div className={styles.registers} aria-label="Choose a register">
        {(["sources","communities","requests"] as Register[]).map(id=><button key={id} aria-pressed={register===id} onClick={()=>{setRegister(id);setPage(0);setQuery("");}}>{id==="sources"?"Sources":id==="communities"?"Communities":"Q3 requests"}<span>{data[id].length}</span></button>)}
      </div>
      <label className={styles.search}><Symbol name="search"/><input aria-label="Search this register" placeholder="Search this register" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/>{query&&<button onClick={()=>{setQuery("");setPage(0);}} aria-label="Clear search">×</button>}</label>
    </div>
    <div className={styles.registerHeading}><strong>{labels[register]}</strong><span>{register==="requests"?"Requested funding · Unawarded at cutoff":"Original sources and dated reports"}</span></div>
    <div ref={rowsBox} className={styles.rows} role="list" aria-label={labels[register]}>
      {visible.map(e=><a key={e.url+e.name} className={styles.row} href={sourceUrl(e.url)||undefined} target="_blank" rel="noopener noreferrer" role="listitem" title={`${e.name} — ${e.detail}`}><div><strong>{e.name}</strong><span>{e.detail}</span></div>{e.amount!==undefined&&<b>{new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(e.amount)}</b>}<Symbol name="external"/></a>)}
      {!visible.length&&<div className={styles.empty}><Symbol name="search"/><strong>No matches in this register.</strong><button onClick={()=>setQuery("")}>Clear search</button></div>}
    </div>
    <div className={styles.dataFooter}><span>{matches.length?`${currentPage*pageSize+1}–${Math.min((currentPage+1)*pageSize,matches.length)} of ${matches.length}`:"0 results"}</span><div><button aria-label="Previous results" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}><Symbol name="left"/></button><span>{currentPage+1} / {maxPage+1}</span><button aria-label="Next results" disabled={currentPage===maxPage} onClick={()=>setPage(currentPage+1)}><Symbol name="right"/></button></div></div>
  </section>;
}

export function MonthlyBundlePreview({initialView}: {initialView:View}) {
  const [view,setView]=useState<View>(initialView);
  const [fullScreen,setFullScreen]=useState(false);
  const root=useRef<HTMLDivElement>(null);
  const positions=useRef<Record<string,string>>({monthly:"#1",voter:"#1"});
  const tabButtons=useRef<Array<HTMLButtonElement|null>>([]);
  useEffect(()=>{
    const sync=()=>{const v=new URLSearchParams(location.search).get("publication");setView(v==="voter"||v==="sources"?v:"monthly");};
    const fullscreen=()=>setFullScreen(document.fullscreenElement===root.current);
    window.addEventListener("popstate",sync);document.addEventListener("fullscreenchange",fullscreen);
    return()=>{window.removeEventListener("popstate",sync);document.removeEventListener("fullscreenchange",fullscreen);};
  },[]);
  function changeView(next:View) {
    if(next===view)return;
    if(view!=="sources")positions.current[view]=window.location.hash||"#1";
    window.history.replaceState(null,"",`/monthly-preview?publication=${next}${next==="sources"?"":positions.current[next]}`);
    setView(next);
  }
  async function expand() {
    try { if(document.fullscreenElement)await document.exitFullscreen();else await root.current?.requestFullscreen(); } catch { /* Browser may restrict fullscreen; the fitted reader remains usable. */ }
  }
  return <div ref={root} className={styles.preview} data-publication={view}>
    <header className={styles.header}>
      <Link href="/monthly" className={styles.brand}><img src="/zcash-mark.svg" alt="" width="25" height="25"/><strong>OpenZcash</strong><i/><span>MONTHLY</span></Link>
      <div className={styles.month}><select aria-label="Publication month" defaultValue="2026-09"><option value="2026-09">September 2026</option></select><small>Sep 1–10 reference</small></div>
      <div className={styles.actions}><span className={styles.previewBadge}>Layout preview</span><button onClick={expand} aria-label={fullScreen?"Exit full screen":"Enter full screen"}><Symbol name="expand"/></button>{view!=="sources"?<a href={docs[view].pdf} download className={styles.download}><Symbol name="download"/><span>Download PDF</span></a>:<a href="/monthly/editions/2026-09-01-to-10/e4f57c352cd0/OpenZcash-Monthly-September-01-10-2026.pdf" target="_blank" rel="noopener noreferrer" className={styles.download}><Symbol name="external"/><span>Full reference</span></a>}</div>
    </header>
    <nav className={styles.tabBar} aria-label="Publications for this month">
      <div role="tablist" aria-label="Choose what to read" className={styles.tabs}>{tabs.map((t,i)=><button key={t.id} ref={el=>{tabButtons.current[i]=el;}} role="tab" id={`tab-${t.id}`} aria-controls={`panel-${t.id}`} aria-selected={view===t.id} tabIndex={view===t.id?0:-1} className={styles.tab} onClick={()=>changeView(t.id)} onKeyDown={e=>{if(["ArrowLeft","ArrowRight","Home","End"].includes(e.key)){e.preventDefault();const j=e.key==="Home"?0:e.key==="End"?tabs.length-1:(i+(e.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length;changeView(tabs[j].id);tabButtons.current[j]?.focus();}}}><Symbol name={t.id}/><span>{t.name}</span><small>{t.count}</small></button>)}</div>
      <span className={styles.tabContext}>{view==="monthly"?"Teams & operations":view==="voter"?"Decisions & participation":"The complete record"}</span>
    </nav>
    <div className={styles.panel} role="tabpanel" id={`panel-${view}`} aria-labelledby={`tab-${view}`}>{view==="sources"?<SourcesPanel/>:<MonthlyReader key={view} editions={[docs[view]]} edition={docs[view]} embedded baseHref={`/monthly-preview?publication=${view}`}/>}</div>
  </div>;
}
