import { createHash } from "node:crypto";
import { mergeArboristCalls, parseArboristAgenda, parseArboristYoutubeFeed, parseArboristYoutubePage, type ArboristCall } from "./feed";
import { parseNote } from "./note-parser";
import { parseArboristReadme, type ArboristRepoFile } from "./discovery";
import { ARBORIST_README_URL, ARBORIST_YOUTUBE_FEED, ARBORIST_YOUTUBE_PAGE, arboristBlobUrl, arboristRawUrl, arboristResponseText, encodeArboristPath } from "./sources";

export const ARBORIST_REFRESH_MS = 60 * 60_000;
const RETRY_MS = 5 * 60_000;
export type ArboristSourceHealth = { status: "live" | "cached" | "unavailable"; lastSuccessAt: string | null; transport: "github-api" | "readme" | "youtube-feed" | "youtube-page" | "bundled" | null };
export type ArboristStatus = { lastAttemptAt: string | null; lastSuccessAt: string | null; refreshing: boolean; notes: ArboristSourceHealth; recordings: ArboristSourceHealth };
export type ArboristNoteRecord = { path: string; sha: string; checkedAt: string; call: ArboristCall };
export type ArboristSnapshot = { schemaVersion: 1; collectedAt: string; notes: ArboristNoteRecord[]; recordings: ArboristCall[]; sourceUrls: string[] };
type Options = { fetcher?: typeof fetch; now?: () => number; token?: () => string | undefined; snapshot?: ArboristSnapshot };

export function createArboristLoader({ fetcher = fetch, now = Date.now, token = () => undefined, snapshot }: Options = {}) {
  const records = new Map((snapshot?.notes ?? []).map(record => [record.path, record]));
  const videos = new Map((snapshot?.recordings ?? []).flatMap(call => call.videoId ? [[call.videoId, call] as const] : []));
  const health = (present: boolean): ArboristSourceHealth => ({ status: present ? "cached" : "unavailable", lastSuccessAt: present ? snapshot!.collectedAt : null, transport: present ? "bundled" : null });
  const status: ArboristStatus = { lastAttemptAt: null, lastSuccessAt: snapshot?.collectedAt || null, refreshing: false,
    notes: health(records.size > 0), recordings: health(videos.size > 0) };
  let inflight: Promise<ArboristCall[]> | null = null, nextAttempt = 0;
  const calls = () => {
    const byNumber = new Map<number, ArboristCall>();
    for (const { call } of [...records.values()].sort((a, b) => Number(a.call.source === "agenda") - Number(b.call.source === "agenda"))) {
      if (call.number != null && !byNumber.has(call.number)) byNumber.set(call.number, call);
    }
    return mergeArboristCalls([...byNumber.values()], [...videos.values()]);
  };
  async function request(url: string, bytes: number, media: RegExp, authenticated = false): Promise<string> {
    const credential = authenticated ? token() : undefined;
    return arboristResponseText(await fetcher(url, {
      headers: { accept: "application/vnd.github+json, application/atom+xml, text/plain, text/html", "accept-language": "en-US,en;q=0.9",
        "user-agent": "OpenZcash public Arborist archive", ...(credential ? { authorization: `Bearer ${credential}` } : {}) },
      signal: AbortSignal.timeout(8_000), cache: "no-store", redirect: "error", credentials: "omit",
    }), bytes, media);
  }
  async function listing(directory: string): Promise<ArboristRepoFile[]> {
    const suffix = directory ? `/${encodeArboristPath(directory)}` : "";
    const text = await request(`https://api.github.com/repos/ZcashCommunityGrants/arboretum-notes/contents${suffix}`, 512 * 1024, /^application\/(?:json|vnd\.github\+json)/i, true);
    const rows: unknown = JSON.parse(text);
    if (!Array.isArray(rows) || rows.length > 1000) throw new Error("ARBORIST_LIST_INVALID");
    return rows.flatMap(row => {
      if (!row || typeof row !== "object" || row.type !== "file" || typeof row.name !== "string" || !/\.md$/i.test(row.name) || !/call/i.test(row.name)) return [];
      const number = Number(row.name.match(/\bcall\s+#?\s*(\d+)/i)?.[1]);
      const expected = directory ? `${directory}/${row.name}` : row.name;
      if (!Number.isInteger(number) || number < 1 || row.path !== expected || /[\\/\x00-\x1f]/.test(row.name) || row.name.includes("..")) throw new Error("ARBORIST_LIST_INVALID");
      return [{ name: row.name, path: row.path, type: "file" as const, number,
        kind: directory === "AgendaArchive" ? "agenda" as const : "notes" as const,
        ...(typeof row.sha === "string" && /^[\da-f]{40}$/i.test(row.sha) ? { sha: row.sha } : {}) }];
    });
  }
  async function refreshNotes(): Promise<boolean> {
    const directories = ["AllArboristCallNotes", "AgendaArchive", ""];
    const [lists, readme] = await Promise.all([
      Promise.allSettled(directories.map(listing)),
      request(ARBORIST_README_URL, 128 * 1024, /^text\/plain/i).then(parseArboristReadme).catch(() => null),
    ]);
    let files = lists.flatMap(result => result.status === "fulfilled" ? result.value : []);
    let complete = lists.every(result => result.status === "fulfilled");
    let transport: ArboristSourceHealth["transport"] = "github-api";
    if (!complete) {
      if (readme) { files = [...files, ...readme]; complete = true; transport = "readme"; }
    }
    if (!files.length) complete = false;
    const groups = new Map<number, ArboristRepoFile[]>();
    const explicitDates = new Map((readme ?? []).flatMap(file => file.date ? [[file.path, file.date] as const] : []));
    for (const file of files) {
      const group = groups.get(file.number) ?? [];
      if (!group.some(candidate => candidate.path === file.path)) group.push({ ...file, date: file.date ?? explicitDates.get(file.path) });
      groups.set(file.number, group);
    }
    let failures = 0;
    const work = [...groups.values()];
    for (let offset = 0; offset < work.length; offset += 12) {
      await Promise.all(work.slice(offset, offset + 12).map(async group => {
        group.sort((a, b) => Number(a.kind === "agenda") - Number(b.kind === "agenda") || Number(!a.path.startsWith("AllArboristCallNotes/")) - Number(!b.path.startsWith("AllArboristCallNotes/")));
        let loaded = false, failedCandidate = false;
        for (const file of group) {
          const previous = records.get(file.path);
          if (file.sha && previous?.sha === file.sha) {
            if (!previous.call.date && file.date) records.set(file.path, { ...previous, call: { ...previous.call, date: file.date, dateSource: ARBORIST_README_URL } });
            loaded = true; break;
          }
          try {
            const markdown = await request(arboristRawUrl(file.path), 512 * 1024, /^text\/plain/i);
            const call = file.kind === "agenda" ? parseArboristAgenda(markdown, file.name, arboristBlobUrl(file.path)) : parseNote(markdown, file.number, file.name, file.path);
            if (!call || call.number !== file.number) throw new Error("ARBORIST_NOTE_INVALID");
            // The README date is an explicit published source value, not a guessed neighbouring year.
            if (!call.date && file.date) { call.date = file.date; call.dateSource = ARBORIST_README_URL; }
            const sha = createHash("sha1").update(`blob ${Buffer.byteLength(markdown)}\0`).update(markdown).digest("hex");
            records.set(file.path, { path: file.path, sha, checkedAt: new Date(now()).toISOString(), call });
            loaded = true; break;
          } catch { failedCandidate = true; /* Try an explicitly published alternate, never construct a guessed path. */ }
        }
        if (!loaded || failedCandidate) failures++;
      }));
    }
    const success = complete && failures === 0;
    status.notes = { status: success ? "live" : records.size ? "cached" : "unavailable", lastSuccessAt: success ? new Date(now()).toISOString() : status.notes.lastSuccessAt, transport: files.length ? transport : status.notes.transport };
    return success;
  }
  async function refreshRecordings(): Promise<boolean> {
    let parsed: ArboristCall[] | null = null, transport: ArboristSourceHealth["transport"] = "youtube-feed";
    try {
      const xml = await request(ARBORIST_YOUTUBE_FEED, 256 * 1024, /^(?:application\/(?:atom\+xml|xml)|text\/xml)/i);
      if (!/<feed\b/.test(xml) || !/<\/feed>/.test(xml)) throw new Error("ARBORIST_VIDEO_FEED_INVALID");
      parsed = parseArboristYoutubeFeed(xml);
    } catch {
      try { parsed = parseArboristYoutubePage(await request(ARBORIST_YOUTUBE_PAGE, 3 * 1024 * 1024, /^text\/html/i)); transport = "youtube-page"; } catch { /* Keep previously verified recordings. */ }
    }
    if (parsed) for (const call of parsed) if (call.videoId && call.date && call.date <= new Date(now()).toISOString().slice(0, 10)) videos.set(call.videoId, call);
    status.recordings = { status: parsed ? "live" : videos.size ? "cached" : "unavailable", lastSuccessAt: parsed ? new Date(now()).toISOString() : status.recordings.lastSuccessAt, transport: parsed ? transport : status.recordings.transport };
    return parsed !== null;
  }
  async function refresh() {
    if (inflight) return inflight;
    status.lastAttemptAt = new Date(now()).toISOString(); status.refreshing = true;
    inflight = (async () => {
      const outcomes = await Promise.allSettled([refreshNotes(), refreshRecordings()]);
      const success = outcomes.every(result => result.status === "fulfilled" && result.value);
      if (success) status.lastSuccessAt = new Date(now()).toISOString();
      nextAttempt = now() + (success ? ARBORIST_REFRESH_MS : RETRY_MS);
      return calls();
    })().finally(() => { inflight = null; status.refreshing = false; });
    return inflight;
  }
  return {
    async getCalls() { const current = calls(); if (now() >= nextAttempt) { const pending = refresh(); if (!current.length) return pending; } return current; },
    refresh,
    getStatus: (): ArboristStatus => ({ ...status, notes: { ...status.notes }, recordings: { ...status.recordings } }),
    getSnapshot: (): ArboristSnapshot => ({ schemaVersion: 1, collectedAt: status.lastSuccessAt ?? "", notes: [...records.values()], recordings: [...videos.values()], sourceUrls: [ARBORIST_README_URL, ARBORIST_YOUTUBE_FEED, ARBORIST_YOUTUBE_PAGE] }),
  };
}
