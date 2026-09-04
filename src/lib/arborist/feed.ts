export type ArboristCallSource = "notes" | "youtube";

export interface ArboristCall {
  /** Published number, or the next sequence number while notes are pending. */
  number: number | null;
  /** ISO meeting date (YYYY-MM-DD) when parseable. */
  date: string | null;
  /** Header/title date as written, kept when the date could not be parsed. */
  rawDate: string;
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
 * Pending calls continue from the highest published call number in meeting
 * order. GitHub remains authoritative when the matching note arrives.
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

  const latestNoteDate = enrichedNotes.reduce<string | null>(
    (latest, call) =>
      call.date && (!latest || call.date > latest) ? call.date : latest,
    null,
  );
  const knownVideoIds = new Set(
    enrichedNotes.flatMap((call) => (call.videoId ? [call.videoId] : [])),
  );
  const knownDates = new Set(
    enrichedNotes.flatMap((call) => (call.date ? [call.date] : [])),
  );
  const pending: ArboristCall[] = [];

  for (const recording of recordings) {
    if (!recording.date) continue;
    if (latestNoteDate && recording.date <= latestNoteDate) continue;
    if (recording.videoId && knownVideoIds.has(recording.videoId)) continue;
    if (knownDates.has(recording.date)) continue;

    pending.push(recording);
    if (recording.videoId) knownVideoIds.add(recording.videoId);
    knownDates.add(recording.date);
  }

  const latestNoteNumber = enrichedNotes.reduce<number | null>(
    (latest, call) =>
      call.number != null && (latest == null || call.number > latest)
        ? call.number
        : latest,
    null,
  );
  const chronological = pending.sort((a, b) =>
    (a.date ?? "").localeCompare(b.date ?? ""),
  );
  const numbered = chronological.map((call, index) => ({
    ...call,
    number:
      latestNoteNumber == null ? call.number : latestNoteNumber + index + 1,
  }));

  return [...numbered.reverse(), ...enrichedNotes];
}
