export type ArboristCallSource = "notes" | "agenda" | "youtube";

export interface ArboristCall {
  /** Published call number. Recording-only entries stay unnumbered until confirmed. */
  number: number | null;
  /** ISO meeting date (YYYY-MM-DD) when parseable. */
  date: string | null;
  /** Header/title date as written, kept when the date could not be parsed. */
  rawDate: string;
  /** Explicit alternate source used only when the note omitted its year/date. */
  dateSource?: string;
  /** Stated meeting duration, e.g. "15 minutes". */
  duration: string | null;
  /** YouTube recording URL — most calls have one. */
  video: string | null;
  /** YouTube video id, for reconciliation and the thumbnail. */
  videoId: string | null;
  moderator: string | null;
  notetaker: string | null;
  /** Agenda items listed in the note header. */
  agenda: string[];
  /** Link to the note file on GitHub. Null while notes are pending. */
  url: string | null;
  /** The source that made this archive item available. */
  source: ArboristCallSource;
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

/** Parses the English date variants used by both notes and legacy agendas. */
export function parseArboristDate(rawDate: string): string | null {
  const dmy = rawDate.match(
    /(\d{1,2})\s*(?:st|nd|rd|th)?\s*[.,]?\s*([A-Za-z]{3,})\.?\s*[.,]?\s*(\d{4})?/,
  );
  const mdy = rawDate.match(
    /([A-Za-z]{3,})\.?\s+(\d{1,2})\s*(?:st|nd|rd|th)?\s*[.,]?\s*(\d{4})?/,
  );
  const pick = (day: string, month: string, year?: string) => {
    const monthNumber = MONTHS[month.toLowerCase().slice(0, 3)];
    if (!monthNumber || !year) return null;
    const timestamp = Date.UTC(Number(year), monthNumber - 1, Number(day));
    const parsed = new Date(timestamp);
    if (
      parsed.getUTCFullYear() !== Number(year) ||
      parsed.getUTCMonth() !== monthNumber - 1 ||
      parsed.getUTCDate() !== Number(day)
    ) {
      return null;
    }
    return `${year}-${String(monthNumber).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
  };

  if (dmy && MONTHS[dmy[2]!.toLowerCase().slice(0, 3)]) {
    return pick(dmy[1]!, dmy[2]!, dmy[3]);
  }
  return mdy ? pick(mdy[2]!, mdy[1]!, mdy[3]) : null;
}

/**
 * Parses the agenda-only records that cover Arborist Calls 1–29. These are
 * intentionally distinct from full notes so the UI never overstates what the
 * historical source contains.
 */
export function parseArboristAgenda(
  md: string,
  fileName: string,
  url: string,
): ArboristCall | null {
  const number = Number(
    md.match(/Arborist\s+Call\s+#?\s*(\d+)/i)?.[1] ??
      fileName.match(/(?:Call\s+)?(\d+)/i)?.[1] ??
      NaN,
  );
  if (!Number.isFinite(number)) return null;

  const rawDate =
    md.match(/Meeting Date(?:\/Time)?\s*:\s*([^\r\n]+)/i)?.[1]?.trim() ?? "";
  const video =
    md.match(
      /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+)/i,
    )?.[1] ?? null;
  const videoId = video?.match(/(?:v=|youtu\.be\/)([\w-]{6,})/i)?.[1] ?? null;
  const agendaBlock = md.match(/##\s*Agenda\s*\n([\s\S]*)/i)?.[1] ?? "";
  const agenda = agendaBlock
    .split(/\r?\n/)
    .filter((line) =>
      /^\s*(?:(?:\d+|[ivxlcdm]+)[.)]|[-+*])\s+/i.test(line),
    )
    .map((line) =>
      line
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/^\s*(?:(?:\d+|[ivxlcdm]+)[.)]|[-+*])\s+/i, "")
        .replace(/[*_`]/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((line) => line.length > 2 && line.length < 120)
    .slice(0, 8);

  return {
    number,
    date: parseArboristDate(rawDate),
    rawDate,
    duration:
      md.match(/^(?:Meeting )?Duration\s*:\s*([^\r\n]+)/im)?.[1]?.trim() ||
      null,
    video,
    videoId,
    moderator: null,
    notetaker: null,
    agenda,
    url,
    source: "agenda",
  };
}

function decodeXml(value: string): string {
  return value
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function elementText(entry: string, element: string): string | null {
  const value = entry.match(
    new RegExp(`<${element}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${element}>`, "i"),
  )?.[1];
  return value == null ? null : decodeXml(value);
}

function meetingDateFromTitle(title: string): string | null {
  const match = title.match(
    /^(?:Zcash\s+)?Arborist\s+Call\s+(\d{1,2})-(\d{1,2})-(\d{4})$/i,
  );
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Parses the official Zcash Foundation YouTube Atom feed. Only uploads with a
 * strict Arborist Call title and a valid meeting date are admitted; the upload
 * timestamp is deliberately not used as the meeting date.
 */
export function parseArboristYoutubeFeed(xml: string): ArboristCall[] {
  const entries = xml.match(/<entry\b[^>]*>[\s\S]*?<\/entry>/gi) ?? [];

  return entries.flatMap((entry) => {
    const title = elementText(entry, "title");
    const videoId = elementText(entry, "yt:videoId");
    if (!title || !videoId || !/^[\w-]{6,}$/.test(videoId)) return [];

    const date = meetingDateFromTitle(title);
    if (!date) return [];

    return [
      {
        number: null,
        date,
        rawDate: title.replace(/^(?:Zcash\s+)?Arborist\s+Call\s+/i, ""),
        duration: null,
        video: `https://www.youtube.com/watch?v=${videoId}`,
        videoId,
        moderator: null,
        notetaker: null,
        agenda: [],
        url: null,
        source: "youtube" as const,
      },
    ];
  });
}

/**
 * Adds recent recordings that have not reached the notes repository yet.
 * GitHub remains authoritative when the matching note arrives. A video date
 * alone does not establish the call number or justify filling a sequence gap.
 */
export function mergeArboristCalls(
  notes: ArboristCall[],
  recordings: ArboristCall[],
): ArboristCall[] {
  const recordingByVideoId = new Map(
    recordings.flatMap((call) =>
      call.videoId ? ([[call.videoId, call]] as const) : [],
    ),
  );
  const recordingByDate = new Map(
    recordings.flatMap((call) =>
      call.date ? ([[call.date, call]] as const) : [],
    ),
  );
  const enrichedNotes = notes.map((note) => {
    const recording =
      (note.videoId ? recordingByVideoId.get(note.videoId) : undefined) ??
      (note.date ? recordingByDate.get(note.date) : undefined);
    if (!recording || note.video) return note;
    return {
      ...note,
      video: recording.video,
      videoId: recording.videoId,
    };
  });

  const knownVideoIds = new Set(
    enrichedNotes.flatMap((call) => (call.videoId ? [call.videoId] : [])),
  );
  const knownDates = new Set(
    enrichedNotes.flatMap((call) => (call.date ? [call.date] : [])),
  );
  const pending: ArboristCall[] = [];

  for (const recording of recordings) {
    if (!recording.date) continue;
    if (recording.videoId && knownVideoIds.has(recording.videoId)) continue;
    if (knownDates.has(recording.date)) continue;

    pending.push(recording);
    if (recording.videoId) knownVideoIds.add(recording.videoId);
    knownDates.add(recording.date);
  }

  return [...pending.map(call => ({ ...call, number: null })), ...enrichedNotes]
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || (b.number ?? 0) - (a.number ?? 0));
}

export const ARBORIST_CHANNEL_ID = "UCi01v05DNTUEC_eB0c9rpgQ";

/** Reads JSON data, never executes scripts or follows URLs embedded by YouTube. */
export function parseArboristYoutubePage(html: string): ArboristCall[] {
  if (html.length > 3 * 1024 * 1024) throw new Error("ARBORIST_VIDEO_PAGE_TOO_LARGE");
  let data: Record<string, unknown> | null = null;
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    const payload = match[1].trim().match(/^(?:var\s+)?ytInitialData\s*=\s*(\{[\s\S]*\});?$/);
    if (!payload) continue;
    try { data = JSON.parse(payload[1]); } catch { throw new Error("ARBORIST_VIDEO_PAGE_INVALID"); }
    break;
  }
  const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const metadata = object(object(data?.metadata).channelMetadataRenderer);
  if (metadata.externalId !== ARBORIST_CHANNEL_ID) throw new Error("ARBORIST_VIDEO_CHANNEL_UNVERIFIED");
  const tabs = object(object(data?.contents).twoColumnBrowseResultsRenderer).tabs;
  if (!Array.isArray(tabs)) throw new Error("ARBORIST_VIDEO_PAGE_INVALID");
  const tab = tabs.map(value => object(object(value).tabRenderer)).find(value => value.selected === true);
  if (!tab?.content) throw new Error("ARBORIST_VIDEO_PAGE_INVALID");
  const videos = new Map<string, ArboristCall>();
  let visited = 0, videoRecords = 0;
  function walk(value: unknown, depth: number) {
    if (++visited > 30_000 || depth > 40) throw new Error("ARBORIST_VIDEO_PAGE_TOO_COMPLEX");
    if (Array.isArray(value)) { for (const part of value) walk(part, depth + 1); return; }
    const row = object(value);
    const lockup = object(row.lockupViewModel), legacy = object(row.videoRenderer);
    const candidate = Object.keys(lockup).length ? lockup : legacy;
    const pending = candidate.upcomingEventData || candidate.isLiveNow === true ||
      /"(?:style|badgeStyle)":"BADGE_STYLE_TYPE_(?:LIVE_NOW|UPCOMING)"|"text":"(?:LIVE|UPCOMING)"/.test(JSON.stringify(candidate));
    const title = lockup.contentType === "LOCKUP_CONTENT_TYPE_VIDEO"
      ? object(object(object(lockup.metadata).lockupMetadataViewModel).title).content
      : object(legacy.title).simpleText ?? (Array.isArray(object(legacy.title).runs)
        ? (object(legacy.title).runs as unknown[]).map(run => object(run).text ?? "").join("") : undefined);
    const id = lockup.contentType === "LOCKUP_CONTENT_TYPE_VIDEO" ? lockup.contentId : legacy.videoId;
    if (typeof id === "string" && /^[\w-]{11}$/.test(id) && typeof title === "string") {
      videoRecords++;
      const date = meetingDateFromTitle(title);
      if (date && !pending) videos.set(id, { number: null, date, rawDate: title.replace(/^(?:Zcash\s+)?Arborist\s+Call\s+/i, ""),
        duration: null, video: `https://www.youtube.com/watch?v=${id}`, videoId: id, moderator: null,
        notetaker: null, agenda: [], url: null, source: "youtube" });
    }
    for (const part of Object.values(row)) if (part && typeof part === "object") walk(part, depth + 1);
  }
  walk(tab.content, 0);
  if (!videoRecords) throw new Error("ARBORIST_VIDEO_PAGE_NO_RECORDS");
  return [...videos.values()];
}
