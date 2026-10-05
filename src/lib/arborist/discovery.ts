/** Paths are source records, not guessed filenames or evidence that a file exists. */
export type ArboristRepoFile = {
  name: string;
  path: string;
  type: "file";
  sha?: string;
  kind: "notes" | "agenda";
  number: number;
  date?: string;
};

const PREFIX = "https://github.com/ZcashCommunityGrants/arboretum-notes/blob/main/";
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function explicitDate(value: string): string | undefined {
  const match = value.trim().match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (!match) return;
  const month = MONTHS[match[2].toLowerCase().slice(0, 3)];
  if (!month || !/^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)$/i.test(match[2])) return;
  const date = `${match[3]}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date) return date;
}

function sourcePath(target: string, kind: ArboristRepoFile["kind"], number: number): string | null {
  // Reject traversal before URL normalization could hide it. Fragments identify
  // sections of the same file; queries, userinfo and alternate refs are not files.
  let raw = target.trim().split("#", 1)[0];
  if (!raw || raw.includes("?") || /[\\\x00-\x1f\x7f]/.test(raw)) return null;
  if (raw.startsWith(PREFIX)) raw = raw.slice(PREFIX.length);
  else if (/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(raw)) return null;
  else if (raw.startsWith("./")) raw = raw.slice(2);
  let path: string;
  try { path = decodeURIComponent(raw); } catch { return null; }
  // Encoded separators and double-encoded paths cannot change the fixed scope.
  if (/%(?:2f|5c)/i.test(raw) || /[%?#\\\x00-\x1f\x7f]/.test(path)) return null;
  const parts = path.split("/");
  if (parts.some(part => !part || part === "." || part === "..")) return null;
  const name = parts.at(-1)!;
  if (!/^[A-Za-z0-9 ()_.-]+\.md$/i.test(name)) return null;
  const fileNumber = name.match(/\bcall[ _-]*(\d+)\b/i);
  if (!fileNumber || Number(fileNumber[1]) !== number) return null;
  const scoped = parts.length === 2 && ["AllArboristCallNotes", "AgendaArchive"].includes(parts[0]);
  const root99 = kind === "notes" && number === 99 && parts.length === 1 &&
    ["Arborist Call 99 - notes.md", "AllArboristCallNotes Arborist call 99 Notes.md"].includes(name);
  return scoped || root99 ? path : null;
}

/** Discover only explicit table links. Multiple candidates remain available for
 * recovery; notes precede agendas, without turning an agenda into meeting notes. */
export function parseArboristReadme(md: string): ArboristRepoFile[] {
  if (typeof md !== "string" || !md.trim() || md.length > 512 * 1024) throw new Error("ARBORIST_README_INVALID");
  const files = new Map<string, ArboristRepoFile>();
  let fenced = false;
  for (const line of md.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/)) {
    if (/^\s*(?:```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const row = line.match(/^\s*\|?\s*(\d{1,4})\s*\|\s*([^|]*)\|([\s\S]*)$/);
    if (!row) continue;
    const number = Number(row[1]);
    if (number < 1) continue;
    const date = explicitDate(row[2]);
    for (const link of row[3].matchAll(/\[\s*(notes|agenda)\s*\]\(([^)\n]*)\)/gi)) {
      const label = link[1].toLowerCase() as ArboristRepoFile["kind"];
      const path = sourcePath(link[2], label, number);
      if (!path || files.has(path)) continue;
      const kind = path.startsWith("AgendaArchive/") ? "agenda" : "notes";
      files.set(path, { name: path.split("/").at(-1)!, path, type: "file", kind, number, ...(date ? { date } : {}) });
    }
  }
  if (!files.size) throw new Error("ARBORIST_README_RECORDS_UNAVAILABLE");
  return [...files.values()].sort((a, b) => b.number - a.number || (a.kind === b.kind ? a.path.localeCompare(b.path) : a.kind === "notes" ? -1 : 1));
}
