import { parseArboristDate, type ArboristCall } from "./feed";
import { arboristBlobUrl } from "./sources";
const DIR = "AllArboristCallNotes";
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
    md.match(/Meeting Date(?:\/?\s*Time)?\s*:?\s*([^\n]+)/i)?.[1]?.trim() ?? "";

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
    url: arboristBlobUrl(sourcePath),
    source: "notes",
  };
}

