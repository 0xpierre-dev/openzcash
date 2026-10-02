"use client";

/* eslint-disable @next/next/no-img-element -- Edition thumbnails are small, immutable PDF exports. */
import Link from "next/link";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref, type RefObject } from "react";
import { type MonthlyEdition, monthLabel, statusLabel } from "@/lib/monthly/catalog";
import { PHONE_QUERY, pageCounter } from "@/lib/monthly/full-screen";
import { fitPage, loadPdfModule, pageFromHash, pageManifestSchema, pdfOptions, sourceUrl, type LoadingTask, type PdfDocument, type RenderTask, type ReportPage } from "@/lib/monthly/reader";
import { useFullScreenReading } from "./use-full-screen-reading";
import styles from "./monthly-reader.module.css";

export type MonthlyReaderHandle = { enterFullScreen: (opener?: HTMLElement | null) => void };

type IconName = "left" | "right" | "download" | "expand" | "collapse" | "library" | "link" | "close" | "book";
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    left: <path d="m14 6-6 6 6 6" />,
    right: <path d="m10 6 6 6-6 6" />,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4" /></>,
    expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
    collapse: <path d="M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5" />,
    library: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
    link: <path d="m10 13 4-4m-6 6-2 2a4 4 0 0 1-5-5l4-4a4 4 0 0 1 6 0m2 2a4 4 0 0 0 6 0l4-4a4 4 0 0 0-5-5l-2 2" transform="translate(1 2) scale(.88)" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    book: <><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Z" /><path d="M12 5v15" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function EditionLibrary({ editions, edition }: { editions: MonthlyEdition[]; edition: MonthlyEdition }) {
  const [month, setMonth] = useState(edition.month);
  const months = [...new Set(editions.map((e) => e.month))];
  const entries = editions.filter((e) => e.month === month);
  const cover = month === edition.month ? edition : entries[0];
  return <div className={styles.libraryContent}>
    <h1 className={styles.screenReaderOnly}>OpenZcash Monthly</h1>
    <label className={styles.archiveLabel}>
      <select aria-label="Publication month" value={month} onChange={(e) => setMonth(e.target.value)}>
        {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
      </select>
    </label>
    <Link href={`/monthly/${cover.id}`} className={styles.coverLink} aria-label={`Read ${monthLabel(cover.month)}, ${cover.label}`} prefetch={false}>
      <img src={cover.cover} width="800" height="450" alt={`OpenZcash Monthly — ${cover.label}`} />
    </Link>
    <div className={styles.editionList} aria-label="Available editions">
      {entries.map((entry) => <Link key={entry.id} href={`/monthly/${entry.id}`} prefetch={false} aria-current={entry.id === edition.id ? "page" : undefined} className={styles.edition}>
        <span className={styles.editionDot} />
        <span><strong>{entry.label}</strong><small>{statusLabel(entry)}</small></span>
        <Icon name="right" />
      </Link>)}
    </div>
  </div>;
}

export function MonthlyReader({ editions, edition, embedded = false, baseHref, publicationName = "Monthly", onFollowLink, handle, fullScreenOpener, fullScreenHost, onFullScreenChange }: { editions: MonthlyEdition[]; edition: MonthlyEdition; embedded?: boolean; baseHref?: string; publicationName?: string; onFollowLink?: (url: string) => boolean; handle?: Ref<MonthlyReaderHandle>; fullScreenOpener?: RefObject<HTMLElement | null>; fullScreenHost?: RefObject<HTMLElement | null>; onFullScreenChange?: (on: boolean) => void }) {
  const pageHref = baseHref || `/monthly/${edition.id}`;
  const [pageNumber, setPageNumber] = useState(1);
  const [pages, setPages] = useState<ReportPage[]>([]);
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [rendered, setRendered] = useState(0);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [focused, setFocused] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [message, setMessage] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const libraryDialog = useRef<HTMLDialogElement>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPage = pages[pageNumber - 1];
  const ready = !error && rendered === pageNumber && !!pdf;

  const goTo = useCallback((requested: number) => {
    const next = Math.min(edition.pageCount, Math.max(1, Math.trunc(requested)));
    setPageNumber(next);
    // Keep the edition in shared URLs even when entered through /monthly.
    window.history.replaceState(null, "", `${pageHref}#${next}`);
  }, [pageHref, edition.pageCount]);

  // Phones read in a full screen overlay; the header button of the bundle opens it from outside.
  const reading = useFullScreenReading({ root, page: paper, closeButton, fallbackOpener: fullScreenOpener, browserHost: fullScreenHost, pageNumber, pageCount: edition.pageCount, goTo, onChange: onFullScreenChange });
  useImperativeHandle(handle, () => ({ enterFullScreen: reading.enter }), [reading.enter]);

  useEffect(() => {
    const sync = () => setPageNumber(pageFromHash(window.location.hash, edition.pageCount));
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => { window.removeEventListener("hashchange", sync); window.removeEventListener("popstate", sync); };
  }, [edition.pageCount]);

  useEffect(() => {
    let alive = true;
    let task: LoadingTask | undefined;
    const abort = new AbortController();
    async function load() {
      try {
        const [module, response] = await Promise.all([loadPdfModule(), fetch(edition.manifest, { signal: abort.signal })]);
        if (!response.ok) throw new Error("Manifest unavailable");
        const manifest = pageManifestSchema.parse(await response.json());
        if (!alive) return;
        task = module.getDocument({ url: edition.pdf, ...pdfOptions });
        const document = await task.promise;
        if (!alive) return;
        if (document.numPages !== edition.pageCount || manifest.length !== document.numPages || manifest.some((p, i) => p.number !== i + 1 || p.links.some((link) => "page" in link && link.page > document.numPages))) throw new Error("Edition mismatch");
        setPages(manifest);
        setPdf(document);
      } catch {
        if (alive && !abort.signal.aborted) setError(true);
      }
    }
    void load();
    return () => { alive = false; abort.abort(); void task?.destroy().catch(() => {}); };
  }, [edition, retry]);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = fitPage(entry.contentRect.width, entry.contentRect.height);
      setSize((old) => old.width === next.width && old.height === next.height ? old : next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdf || size.width < 1) return;
    let active = true;
    let job: RenderTask | undefined;
    async function render() {
      try {
        const page = await pdf!.getPage(pageNumber);
        if (!active) return;
        const scale = Math.max(2, window.devicePixelRatio || 1);
        const viewport = page.getViewport({ scale: size.width / edition.pageWidth * scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `Page ${pageNumber}: ${pages[pageNumber - 1]?.title || `OpenZcash ${publicationName}`}`);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas unavailable");
        job = page.render({ canvasContext: context, viewport });
        await job.promise;
        if (!active) return;
        canvasHost.current?.replaceChildren(canvas);
        setRendered(pageNumber);
      } catch (cause) {
        if (active && (cause as Error).name !== "RenderingCancelledException") setError(true);
      }
    }
    void render();
    return () => { active = false; job?.cancel(); };
  }, [pdf, pageNumber, size.width, edition.pageWidth, pages, publicationName]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || libraryDialog.current?.open || event.altKey || event.metaKey || event.ctrlKey || (event.target as HTMLElement).closest("input, select, textarea, [contenteditable=true], [role=tab]")) return;
      if (["ArrowRight", "PageDown"].includes(event.key)) { event.preventDefault(); goTo(pageNumber + 1); }
      if (["ArrowLeft", "PageUp"].includes(event.key)) { event.preventDefault(); goTo(pageNumber - 1); }
      if (event.key === "Home") { event.preventDefault(); goTo(1); }
      if (event.key === "End") { event.preventDefault(); goTo(edition.pageCount); }
    }
    const onFullScreen = () => setFullScreen(document.fullscreenElement === root.current);
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFullScreen);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("fullscreenchange", onFullScreen); };
  }, [pageNumber, goTo, edition.pageCount]);

  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);
  function notify(text: string) {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setMessage(text);
    noticeTimer.current = setTimeout(() => setMessage(""), 5000);
  }
  async function toggleFullScreen(event: React.MouseEvent<HTMLElement>) {
    if (!document.fullscreenElement && window.matchMedia(PHONE_QUERY).matches) { reading.enter(event.currentTarget); return; }
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        setFocused(true);
        if (root.current?.requestFullscreen) await root.current.requestFullscreen();
        else notify("Focus mode enabled. Full screen is unavailable in this browser.");
      }
    } catch { setFocused(true); notify("Focus mode enabled. Full screen is unavailable in this browser."); }
  }
  async function sharePage() {
    const url = `${window.location.origin}${pageHref}#${pageNumber}`;
    try { await navigator.clipboard.writeText(url); notify("Link to this page copied."); }
    catch { window.history.replaceState(null, "", url); notify("The address bar now links to this page. Copy it to share."); }
  }
  function toggleLibrary() {
    if (window.matchMedia("(max-width: 850px)").matches) libraryDialog.current?.showModal();
    else setFocused((value) => !value);
  }
  function retryLoad() {
    setError(false); setPdf(null); setRendered(0); setRetry((value) => value + 1);
  }

  const sections = pages.filter((p, i) => i === 0 || pages[i - 1].section !== p.section);
  const sectionNumber = sections.findLast((p) => p.number <= pageNumber)?.number || 1;
  const thumbStart = Math.floor((pageNumber - 1) / 5) * 5;
  const visiblePages = pages.slice(thumbStart, thumbStart + 5);

  return <div ref={root} className={`${styles.app} ${focused ? styles.focused : ""} ${embedded ? styles.embedded : ""} ${reading.active ? styles.immersive : ""}`} data-edition={edition.id} role={reading.active ? "dialog" : undefined} aria-modal={reading.active || undefined} aria-label={reading.active ? `${publicationName} in full screen` : undefined} tabIndex={reading.active ? -1 : undefined} data-zoomed={reading.active && reading.pinched || undefined} {...reading.surface}>
    <header className={styles.header}>
      <div className={styles.identity}>
        <Link href="/" className={styles.homeLink} aria-label="OpenZcash apps"><img src="/logos/marks/openzcash.png" width="29" height="29" alt="" /><span>OpenZcash</span></Link>
        <span className={styles.headerDivider} />
        <Link href="/monthly" className={styles.publicationName}>MONTHLY</Link>
      </div>
      <div className={styles.headerActions}>
        <button className={styles.iconButton} onClick={sharePage} aria-label="Copy link to this page" title="Copy page link"><Icon name="link" /></button>
        <a className={styles.download} href={edition.pdf} download><Icon name="download" /><span>Download PDF</span><small>{(edition.bytes / 1_000_000).toFixed(1)} MB</small></a>
      </div>
    </header>

    <div className={styles.workspace}>
      <aside className={styles.library} aria-label="Monthly library"><EditionLibrary editions={editions} edition={edition} /></aside>
      <main className={styles.reader} aria-label={`${publicationName} report reader`}>
        <div className={styles.readerHeading}>
          <div><span className={styles.eyebrow}>{monthLabel(edition.month)}</span><strong>{edition.label}<span className={styles.status}>{statusLabel(edition)}</span></strong></div>
          <div className={styles.readerActions}>
            <button className={styles.libraryToggle} onClick={toggleLibrary} title="Toggle library"><Icon name="library" /><span>Library</span></button>
            <button className={styles.iconButton} onClick={toggleFullScreen} aria-label={fullScreen ? "Exit full screen" : "Enter full screen"} title="Full screen"><Icon name={fullScreen ? "collapse" : "expand"} /></button>
          </div>
        </div>
        <div className={styles.readingArea}>
          <div className={styles.toolbar}>
            <label className={styles.chapter}><span>CHAPTER</span><select aria-label="Go to chapter" value={sectionNumber} disabled={!pages.length} onChange={(e) => goTo(Number(e.target.value))}>{sections.length ? sections.map((p) => <option key={p.number} value={p.number}>{p.section}</option>) : <option value="1">Overview</option>}</select></label>
            <nav className={styles.pagination} aria-label="Page navigation">
              <button className={styles.iconButton} disabled={pageNumber === 1} onClick={() => goTo(pageNumber - 1)} aria-label="Previous page"><Icon name="left" /></button>
              <label><select aria-label="Go to page" value={pageNumber} onChange={(e) => goTo(Number(e.target.value))}>{Array.from({ length: edition.pageCount }, (_, i) => <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, "0")}</option>)}</select><span>/ {edition.pageCount}</span></label>
              <button className={styles.iconButton} disabled={pageNumber === edition.pageCount} onClick={() => goTo(pageNumber + 1)} aria-label="Next page"><Icon name="right" /></button>
            </nav>
          </div>
          <div className={styles.stagePadding} style={reading.surfaceStyle} data-rotated={reading.active && reading.rotated || undefined}>
            <div ref={stage} className={styles.stage}>
              {reading.active && <div className={styles.fullScreenControls} data-resting={reading.resting || undefined} onFocus={reading.wake}>
                <button ref={closeButton} className={styles.exitFullScreen} onClick={reading.exit} aria-label="Exit full screen" title="Exit full screen"><Icon name="close" /></button>
                {reading.tip && <p className={styles.swipeTip} aria-hidden="true">{reading.tip}</p>}
                {/* aria-disabled keeps keyboard focus on a button that reaches the first or last page. */}
                <nav className={styles.fullScreenPager} aria-label="Page navigation" {...reading.pager}>
                  <button aria-disabled={pageNumber === 1} onClick={() => reading.turn("previous")} aria-label="Previous page"><Icon name="left" /></button>
                  <span aria-hidden="true">{pageCounter(pageNumber, edition.pageCount)}</span><span className={styles.screenReaderOnly}>Page {pageNumber} of {edition.pageCount}</span>
                  <button aria-disabled={pageNumber === edition.pageCount} onClick={() => reading.turn("next")} aria-label="Next page"><Icon name="right" /></button>
                </nav>
              </div>}
              <div ref={paper} onClick={reading.onPageClick} className={styles.paper} style={{ width: size.width || undefined, height: size.height || undefined }} aria-busy={!ready && !error} data-rendered-page={ready ? rendered : undefined}>
                <div ref={canvasHost} className={styles.canvasHost} style={{ visibility: ready ? "visible" : "hidden" }} />
                {ready && currentPage?.links.map((link, i) => {
                  const position = { left: `${link.x * 100}%`, top: `${link.y * 100}%`, width: `${link.w * 100}%`, height: `${link.h * 100}%` };
                  return "url" in link ? <a key={i} className={styles.pdfLink} style={position} href={sourceUrl(link.url) || undefined} target="_blank" rel="noopener noreferrer" onClick={(event)=>{if(onFollowLink?.(link.url))event.preventDefault();}} aria-label={link.label} title={link.label} /> : <a key={i} className={styles.pdfLink} style={position} href={`#${link.page}`} onClick={(event) => { event.preventDefault(); goTo(link.page); }} aria-label={link.label} title={link.label} />;
                })}
                {ready && (["previous", "next"] as const).map(direction => <button
                  key={direction} type="button" className={styles.pageTurn} data-direction={direction}
                  aria-label={direction === "previous" ? "Previous slide" : "Next slide"}
                  title={direction === "previous" ? "Previous slide" : "Next slide"}
                  aria-disabled={direction === "previous" ? pageNumber === 1 : pageNumber === edition.pageCount}
                  onClick={event => {
                    // These edges own pointer clicks, including at the first/last page.
                    // Never let an underlying PDF source or the phone opener take the tap.
                    event.preventDefault(); event.stopPropagation();
                    if (event.detail > 0 && (window.visualViewport?.scale ?? 1) > 1.01) return;
                    if (reading.active) reading.turn(direction);
                    else goTo(pageNumber + (direction === "next" ? 1 : -1));
                  }}
                ><span aria-hidden="true"><Icon name={direction === "previous" ? "left" : "right"} /></span></button>)}
                {!ready && <div className={styles.loading} role="status">{error ? <><Icon name="book" /><strong>This edition couldn’t load.</strong><span>{reading.active ? "Try again, or leave full screen to download the PDF." : "Try again, or open the PDF using the download button."}</span><button onClick={retryLoad}>Try again</button></> : <><span className={styles.loader} /><span>Opening your report…</span></>}</div>}
              </div>
            </div>
          </div>
          <div className={styles.pageCaption}><span>{currentPage?.title || `OpenZcash ${publicationName}`}</span><button className={styles.captionFullScreen} onClick={(event) => reading.enter(event.currentTarget)}><Icon name="expand" />Read in full screen</button><small>Click the edges or use ← →</small></div>
        </div>
        <nav className={styles.filmstrip} aria-label="Page previews">
          <button className={styles.iconButton} disabled={pageNumber === 1} onClick={() => goTo(pageNumber - 1)} aria-label="Previous page" title="Previous page"><Icon name="left" /></button>
          <div className={styles.thumbnails}>{visiblePages.map((p) => <button key={p.number} className={styles.thumbnail} aria-current={p.number === pageNumber ? "page" : undefined} aria-label={`Page ${p.number}: ${p.title}`} title={p.title} onClick={() => goTo(p.number)}><img src={`${edition.assetBase}/page-${String(p.number).padStart(3, "0")}.jpg`} width="360" height="203" alt="" /><span>{String(p.number).padStart(2, "0")}</span></button>)}</div>
          <button className={styles.iconButton} disabled={pageNumber === edition.pageCount} onClick={() => goTo(pageNumber + 1)} aria-label="Next page" title="Next page"><Icon name="right" /></button>
        </nav>
        <label className={styles.mobileProgress}><span>Page {pageNumber} of {edition.pageCount}</span><input aria-label="Turn to page" type="range" min="1" max={edition.pageCount} value={pageNumber} onChange={(e) => goTo(Number(e.target.value))} /></label>
      </main>
    </div>
    <dialog ref={libraryDialog} className={styles.libraryDialog} aria-label="Monthly library" onClick={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).closest("a")) libraryDialog.current?.close(); }}>
      <button className={`${styles.iconButton} ${styles.closeLibrary}`} onClick={() => libraryDialog.current?.close()} aria-label="Close library"><Icon name="close" /></button>
      <EditionLibrary editions={editions} edition={edition} />
    </dialog>
    <div className={styles.screenReaderOnly} aria-live="polite">Page {pageNumber} of {edition.pageCount}. {currentPage?.title}</div>
    <div className={styles.screenReaderOnly} aria-live="polite">{reading.announcement}</div>
    {ready && <div className={styles.screenReaderOnly} aria-label="Page text">{currentPage?.text}</div>}
    {reading.shielded && <div className={styles.exitShield} aria-hidden="true" onMouseDown={(event) => event.preventDefault()} />}
    {message && <div className={styles.toast} role="status">{message}</div>}
  </div>;
}
