import "server-only";

import {
  mergeArboristCalls,
  parseArboristAgenda,
  parseArboristDate,
  parseArboristYoutubeFeed,
  type ArboristCall,
} from "./feed";

export type { ArboristCall } from "./feed";

/**
 * The Zcash Arborist Call archive.
 *
 * Full notes from call 30 onward and historical agendas for calls 1–29 live as
 * markdown in the community-maintained ZcashCommunityGrants/arboretum-notes
 * repo. The official Zcash Foundation YouTube feed fills the gap between a
 * recording being published and its note reaching GitHub. On every refresh,
 * GitHub notes replace matching provisional videos.
 */

const OWNER = "ZcashCommunityGrants";
const REPO = "arboretum-notes";
const DIR = "AllArboristCallNotes";
const AGENDA_DIR = "AgendaArchive";
const TTL_MS = 60 * 60_000; // notes change at most a couple of times a month
const YOUTUBE_CHANNEL_ID = "UCi01v05DNTUEC_eB0c9rpgQ";
const YOUTUBE_FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`;

export const ARBORIST_REPO_URL = `https://github.com/${OWNER}/${REPO}`;
export const ARBORIST_YOUTUBE_URL =
  "https://www.youtube.com/@zcashfoundation/videos";
export const ARBORIST_FORUM_URL =
  "https://forum.zcashcommunity.com/c/ecosystem-updates/foundation/21";

function encodedPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function rawUrl(path: string): string {
  return `https://raw.githubusercontent.com/${OWNER}/${REPO}/main/${encodedPath(path)}`;
}

function blobUrl(path: string): string {
  return `https://github.com/${OWNER}/${REPO}/blob/main/${encodedPath(path)}`;
}

/**
 * Scheduling announcements from the Zcash Foundation forum category.
 *
 * The notes repository only gets a file once a call has happened, so the
 * forum runs ahead of it: "no call this week", "next call on the 23rd",
 * holiday schedules. Those live here, above the archive. (Arborist news also
 * goes out on X, which has no free read API, so the forum is the source.)
 */
export interface ArboristAnnouncement {
  id: number;
  title: string;
  url: string;
  date: string;
}

let annCache: { at: number; items: ArboristAnnouncement[] } | null = null;

export async function getArboristAnnouncements(): Promise<
  ArboristAnnouncement[]
> {
  const now = Date.now();
  if (annCache && now - annCache.at < 30 * 60_000) return annCache.items;
  try {
    const res = await fetch(
      "https://forum.zcashcommunity.com/search.json?q=arborist%20in%3Atitle%20order%3Alatest_topic",
      {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      },
    );
    if (!res.ok) return annCache?.items ?? [];
    const j = (await res.json()) as {
      topics?: Array<{ id: number; title: string; slug: string; created_at: string }>;
    };
    // Scheduling news is only useful while it is still true: a "next call on
    // the 23rd" notice from seven weeks ago is archive, not news. Anything
    // older than six weeks is dropped, and the section hides when empty.
    const FRESH_MS = 42 * 86_400_000;
    const cutoff = Date.now() - FRESH_MS;
    const items = (j.topics ?? [])
      .filter((t) => /arborist/i.test(t.title))
      .filter((t) => Date.parse(t.created_at) > cutoff)
      .slice(0, 4)
      .map((t) => ({
        id: t.id,
        title: t.title,
        url: `https://forum.zcashcommunity.com/t/${t.slug}/${t.id}`,
        date: t.created_at.slice(0, 10),
      }));
    if (items.length > 0) annCache = { at: now, items };
    return items;
  } catch {
    return annCache?.items ?? [];
  }
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function cleanName(v: string | undefined): string | null {
  if (!v) return null;
  const s = v
    .replace(/\(.*?\)/g, "")
    .replace(/[@#].*$/, "")
    .replace(/[-–—:,.]+$/, "")
    .trim();
  return s.length > 0 && s.length < 60 ? s : null;
}

/** Parses the header block of one note. Format drifted over the years, so
 * both "6th Aug, 2026" and "February 6th, 2026" (and a missing year) occur. */
export function parseNote(
  md: string,
  fallbackNumber: number | null,
  fileName: string,
  sourcePath = `${DIR}/${fileName}`,
): ArboristCall | null {
  if (md.length < 200) return null;

  const numMatch = md.match(/Arborist\s+[Cc]all\s+(\d+)/);
  const number = numMatch
    ? Number(numMatch[1])
    : (fallbackNumber ?? Number(fileName.match(/(\d+)/)?.[1] ?? NaN));
  if (!Number.isFinite(number)) return null;

  const rawDate =
    md.match(/Meeting Date\/?\s*Time\s*:?\s*([^\n]+)/i)?.[1]?.trim() ?? "";

  const date = parseArboristDate(rawDate);

  const video =
    md.match(
      /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+)/,
    )?.[1] ?? null;
  const videoId = video?.match(/(?:v=|youtu\.be\/)([\w-]{6,})/)?.[1] ?? null;

  // Agenda: the lines between "Agenda:" and the video/moderator block.
  const agendaBlock = md.match(
    /Agenda\s*:?\s*\n([\s\S]*?)(?:\n\s*(?:Video of the meeting|Moderator|## Full Notes))/i,
  )?.[1];
  const agenda = (agendaBlock ?? "")
    .split("\n")
    .map((l) =>
      l
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // markdown links -> text
        .replace(/^[-*\d.\s]+/, "")
        .trim(),
    )
    .filter((l) => l.length > 2 && l.length < 120)
    .slice(0, 8);

  return {
    number,
    date,
    rawDate,
    duration:
      md.match(/Meeting Duration\s*:?\s*([^\n]+)/i)?.[1]?.trim() ?? null,
    video,
    videoId,
    moderator: cleanName(md.match(/Moderator\s*:?\s*([^\n]+)/i)?.[1]),
    notetaker: cleanName(md.match(/^Notes\s*:?\s*([^\n]+)/im)?.[1]),
    agenda,
    url: blobUrl(sourcePath),
    source: "notes",
  };
}

/** Fills in years the header omitted, using the surrounding calls. */
function inferMissingDates(calls: ArboristCall[]): ArboristCall[] {
  const sorted = [...calls].sort(
    (a, b) => (a.number ?? 0) - (b.number ?? 0),
  );
  return sorted.map((c, i) => {
    if (c.date || !c.rawDate) return c;
    const mon = c.rawDate.match(/([A-Za-z]{3,})/)?.[1];
    const day = c.rawDate.match(/(\d{1,2})\s*(?:st|nd|rd|th)/)?.[1];
    const mi = mon ? MONTHS[mon.toLowerCase().slice(0, 3)] : undefined;
    if (!mi || !day) return c;
    // Nearest neighbour with a known year, walking outwards.
    for (let d = 1; d < sorted.length; d++) {
      const near = sorted[i - d]?.date ?? sorted[i + d]?.date;
      if (near) {
        const year = Number(near.slice(0, 4));
        return {
          ...c,
          date: `${year}-${String(mi).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`,
        };
      }
    }
    return c;
  });
}

let cache: { at: number; items: ArboristCall[] } | null = null;
let inflight: Promise<ArboristCall[]> | null = null;

async function fetchYoutubeRecordings(): Promise<ArboristCall[]> {
  try {
    const res = await fetch(YOUTUBE_FEED_URL, {
      headers: { accept: "application/atom+xml" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!res.ok) return [];
    return parseArboristYoutubeFeed(await res.text());
  } catch {
    return [];
  }
}

async function youtubeFallback(
  now: number,
  recordingsPromise: Promise<ArboristCall[]>,
): Promise<ArboristCall[]> {
  const recordings = await recordingsPromise;
  const cachedNotes =
    cache?.items.filter((call) => call.source !== "youtube") ?? [];
  const result = mergeArboristCalls(cachedNotes, recordings);
  if (result.length > 0) cache = { at: now, items: result };
  return result;
}

/** Every Arborist call, newest first. Cached ~1h in-process; concurrent
 * refreshes share one sweep, and a stale cache is served while it runs. */
export async function getArboristCalls(): Promise<ArboristCall[]> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.items;
  if (inflight) return cache ? cache.items : inflight;
  inflight = (async () => {
    try {
      return await refresh(now);
    } finally {
      inflight = null;
    }
  })();
  return cache ? cache.items : inflight;
}

interface RepoFile {
  name: string;
  path: string;
  type: string;
}

async function fetchRepoListing(directory?: string): Promise<RepoFile[] | null> {
  const suffix = directory ? `/contents/${encodedPath(directory)}` : "/contents";
  const response = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}${suffix}`,
    {
      headers: {
        accept: "application/vnd.github+json",
        ...(process.env.GITHUB_TOKEN
          ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    },
  );
  if (!response.ok) return null;
  const listing = (await response.json()) as RepoFile[];
  return Array.isArray(listing) ? listing : null;
}

function callNumberFromFileName(fileName: string): number | null {
  const value = Number(fileName.match(/\bCall\s+#?\s*(\d+)/i)?.[1] ?? NaN);
  return Number.isFinite(value) ? value : null;
}

async function refresh(now: number): Promise<ArboristCall[]> {
  const youtube = fetchYoutubeRecordings();
  try {
    const [notesListing, agendaListing, rootListing] = await Promise.all([
      fetchRepoListing(DIR),
      fetchRepoListing(AGENDA_DIR),
      fetchRepoListing(),
    ]);
    if (!notesListing) return youtubeFallback(now, youtube);

    const notesFiles = notesListing
      .filter((f) => f.type === "file" && /\.md$/i.test(f.name))
      .filter((f) => /call/i.test(f.name));
    const coveredNumbers = new Set(
      notesFiles.flatMap((file) => {
        const number = callNumberFromFileName(file.name);
        return number == null ? [] : [number];
      }),
    );

    // Call 99 was accidentally committed at the repository root. Treat root
    // note files as a fallback without allowing them to override canonical
    // files in AllArboristCallNotes.
    const rootNoteFiles: RepoFile[] = [];
    const rootCandidates = (rootListing ?? [])
      .filter((f) => f.type === "file" && /\.md$/i.test(f.name))
      .filter((f) => /call/i.test(f.name))
      .sort(
        (a, b) =>
          Number(/^Arborist\s+Call/i.test(b.name)) -
          Number(/^Arborist\s+Call/i.test(a.name)),
      );
    for (const file of rootCandidates) {
      const number = callNumberFromFileName(file.name);
      if (number == null || coveredNumbers.has(number)) continue;
      rootNoteFiles.push(file);
      coveredNumbers.add(number);
    }

    // Calls 1–29 predate full notes but have official historical agendas with
    // dates and recordings. Load only numbers still absent after note sources.
    const agendaFiles: RepoFile[] = [];
    for (const file of agendaListing ?? []) {
      if (file.type !== "file" || !/\.md$/i.test(file.name)) continue;
      const number = callNumberFromFileName(file.name);
      if (number == null || coveredNumbers.has(number)) continue;
      agendaFiles.push(file);
      coveredNumbers.add(number);
    }

    const files = [
      ...notesFiles.map((file) => ({ ...file, kind: "notes" as const })),
      ...rootNoteFiles.map((file) => ({ ...file, kind: "notes" as const })),
      ...agendaFiles.map((file) => ({ ...file, kind: "agenda" as const })),
    ];

    const items: ArboristCall[] = [];
    const CHUNK = 12;
    for (let i = 0; i < files.length; i += CHUNK) {
      const batch = await Promise.all(
        files.slice(i, i + CHUNK).map(async (f) => {
          try {
            const r = await fetch(rawUrl(f.path), {
              signal: AbortSignal.timeout(8_000),
              cache: "no-store",
            });
            if (!r.ok) return null;
            const markdown = await r.text();
            return f.kind === "agenda"
              ? parseArboristAgenda(markdown, f.name, blobUrl(f.path))
              : parseNote(markdown, null, f.name, f.path);
          } catch {
            return null;
          }
        }),
      );
      items.push(...batch.filter((x): x is ArboristCall => x !== null));
    }
    if (items.length === 0) return youtubeFallback(now, youtube);

    // De-duplicate by call number after combining canonical notes, root note
    // fallbacks and agenda-only history in that authority order.
    const byNumber = new Map<number, ArboristCall>();
    for (const c of items) {
      if (c.number == null) continue;
      const prev = byNumber.get(c.number);
      if (!prev || (!prev.date && c.date)) byNumber.set(c.number, c);
    }
    const notes = inferMissingDates([...byNumber.values()]).sort(
      (a, b) => (b.number ?? 0) - (a.number ?? 0),
    );
    const result = mergeArboristCalls(notes, await youtube);
    cache = { at: now, items: result };
    return result;
  } catch {
    return youtubeFallback(now, youtube);
  }
}
