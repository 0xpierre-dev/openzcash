import { z } from "zod";
import type { ArboristCall } from "@/lib/arborist/feed";
import { safeSourceUrl, terms } from "./sources";

export const ARBORIST_ROWS = 8;
const MONTHS =
  "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro";
const MONTH_INDEX: Record<string, number> = Object.fromEntries(
  "jan feb mar apr may jun jul aug sep oct nov dec"
    .split(" ")
    .flatMap((m, i) => [
      [m, i + 1],
      [
        "janeiro fevereiro marco abril maio junho julho agosto setembro outubro novembro dezembro".split(
          " ",
        )[i],
        i + 1,
      ],
    ]),
);
const NOISE = new Set(
  "arborist arboretum call calls chamada reuniao reunioes meeting meetings latest last newest recent ultimo ultima recente notes recording video engineering discussed discutido discutiu about sobre happened aconteceu".split(
    " ",
  ),
);
const normalize = (value: string) =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** What a question names: call numbers, meeting months/days, or agenda words. */
export function arboristFilter(query: string) {
  const q = normalize(query);
  const numbers = [
    ...new Set(
      [
        ...q.matchAll(
          /(?:#|\b(?:call|calls|chamada|reuniao)\s*#?\s*|\bno\.?\s*|\bnumero\s*)(\d{1,4})\b/g,
        ),
      ].map((m) => Number(m[1])),
    ),
  ];
  const dates = [
    ...new Set([
      ...[...q.matchAll(/\b(20\d{2})-(\d{2})(?:-(\d{2}))?\b/g)].map((m) =>
        m[3] ? `${m[1]}-${m[2]}-${m[3]}` : `${m[1]}-${m[2]}`,
      ),
      ...[
        ...q.matchAll(
          new RegExp(`\\b(${MONTHS})[a-z]*\\.?(?: de)? (20\\d{2})\\b`, "g"),
        ),
      ].map(
        (m) =>
          `${m[2]}-${String(MONTH_INDEX[m[1].slice(0, 3)] ?? MONTH_INDEX[m[1]]).padStart(2, "0")}`,
      ),
    ]),
  ];
  const tokens = terms(q).filter(
    (t) => !NOISE.has(t) && !/^\d+$/.test(t) && !/^20\d{2}-/.test(t),
  );
  return { numbers, dates, tokens };
}

type Meta = {
  fetchedAt: string | null;
  repository: string;
  recordings: string;
};
const row = (call: ArboristCall) => ({
  number: call.number,
  date: call.date,
  ...(call.date ? {} : { dateAsWritten: call.rawDate }),
  duration: call.duration,
  moderator: call.moderator,
  notetaker: call.notetaker,
  agenda: call.agenda,
  notes: call.url,
  recording: call.video,
  source:
    call.source === "notes"
      ? "published notes"
      : call.source === "agenda"
        ? "historical agenda only (calls 1-29)"
        : "recording only; notes not yet published, number provisional",
});
/** Provenance first, then the calls a question names, newest first. */
export function arboristContext(
  calls: ArboristCall[],
  query: string,
  meta: Meta,
) {
  const { numbers, dates, tokens } = arboristFilter(query);
  const score = (call: ArboristCall) => {
    const hay = normalize(
      [...call.agenda, call.moderator ?? "", call.notetaker ?? ""].join(" "),
    );
    return tokens.reduce((n, t) => n + Number(hay.includes(t)), 0);
  };
  const selected = numbers.length
    ? calls.filter((c) => c.number !== null && numbers.includes(c.number))
    : dates.length
      ? calls.filter((c) => c.date && dates.some((d) => c.date!.startsWith(d)))
      : tokens.length
        ? calls
            .map((c) => ({ c, s: score(c) }))
            .filter((x) => x.s > 0)
            .sort((a, b) => b.s - a.s)
            .map((x) => x.c)
        : calls;
  const latest = calls[0];
  return {
    archiveFetchedAt: meta.fetchedAt,
    totalCalls: calls.length,
    latestCall: latest
      ? { number: latest.number, date: latest.date, source: latest.source }
      : null,
    filter: { numbers, dates, words: tokens },
    matched: selected.length,
    calls: selected.slice(0, ARBORIST_ROWS).map(row),
    notesRepository: meta.repository,
    recordingsChannel: meta.recordings,
    note: "Community-maintained call notes (ZcashCommunityGrants/arboretum-notes) and Zcash Foundation recordings, read from the same archive as /arborist and cached up to one hour. Dates are meeting dates. Calls 1-29 have historical agendas only. Agenda items and notes are discussion records, not protocol decisions or official statements; not every call is numbered or dated in its source.",
  };
}

const url = z.string().refine((s) => !!safeSourceUrl(s));
const callSchema = z.object({
  number: z.number().int().positive().nullable(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  moderator: z.string().max(80).nullable().optional(),
  agenda: z
    .object({ shown: z.array(z.string()), totalRows: z.number().int() })
    .optional(),
  notes: url.nullable(),
  recording: url.nullable(),
  source: z.string(),
});
const plain = (s: string) =>
  s
    .replace(/[\\[\]<>*`|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const longDate = (iso: string, pt: boolean) =>
  new Intl.DateTimeFormat(pt ? "pt-BR" : "en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
/** The latest call from validated evidence only; unavailable or malformed evidence becomes a link, never an invented call. */
export function arboristAnswer(content: string, pt: boolean): string {
  const unavailable = pt
    ? "Não consegui ler o arquivo das Arborist Calls agora. [Abrir as Arborist Calls no OpenZcash](https://openzcash.org/arborist)."
    : "The Arborist call archive could not be read right now. [Open the Arborist calls on OpenZcash](https://openzcash.org/arborist).";
  let parsed;
  try {
    parsed = callSchema.safeParse(JSON.parse(content).data?.calls?.shown?.[0]);
  } catch {
    return unavailable;
  }
  if (!parsed.success) return unavailable;
  const c = parsed.data;
  const title =
    c.number === null
      ? pt
        ? "Arborist Call mais recente"
        : "Latest Arborist Call"
      : `Arborist Call #${c.number}`;
  const when = c.date
    ? pt
      ? `realizada em ${longDate(c.date, pt)}`
      : `held on ${longDate(c.date, pt)}`
    : pt
      ? "data não registrada na fonte"
      : "date not recorded in the source";
  const agenda = (c.agenda?.shown ?? []).map(plain).filter(Boolean);
  const lines = [
    `**${title}**, ${when}.${c.moderator ? (pt ? ` Moderação: ${plain(c.moderator)}.` : ` Moderator: ${plain(c.moderator)}.`) : ""}`,
  ];
  if (agenda.length)
    lines.push(
      (pt ? "Pauta: " : "Agenda: ") +
        agenda.join("; ") +
        (c.agenda && c.agenda.totalRows > agenda.length
          ? pt
            ? " (lista parcial)."
            : " (partial list)."
          : "."),
    );
  const links = [
    ...(c.notes ? [`[${pt ? "Notas" : "Notes"}](${c.notes})`] : []),
    ...(c.recording
      ? [`[${pt ? "Gravação" : "Recording"}](${c.recording})`]
      : []),
    `[${pt ? "Arquivo no OpenZcash" : "Archive on OpenZcash"}](https://openzcash.org/arborist)`,
  ];
  lines.push(links.join(" · "));
  if (c.source.startsWith("recording only"))
    lines.push(
      pt
        ? "A gravação foi publicada, mas as notas ainda não chegaram ao repositório; o número é provisório."
        : "The recording is published, but the notes have not reached the repository yet; the number is provisional.",
    );
  lines.push(
    pt
      ? "Notas mantidas pela comunidade e gravações da Zcash Foundation; pauta não é decisão de protocolo."
      : "Community-maintained notes and Zcash Foundation recordings; agenda items are not protocol decisions.",
  );
  return lines.join("\n\n");
}
