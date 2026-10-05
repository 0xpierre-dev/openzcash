import { describe, expect, it } from "vitest";
import { parseArboristReadme } from "./discovery";

const root = "https://github.com/ZcashCommunityGrants/arboretum-notes/blob/main/";
const row = (url: string, date = "17 Sept 2026", number = 132, label = "notes") => `${number} | ${date} | [${label}](${url}) | [video](https://youtube.com/watch?v=ignored)`;

describe("official Arborist README discovery", () => {
  it("preserves linked filename and explicit meeting date while stripping fragments", () => {
    expect(parseArboristReadme(row(`${root}AllArboristCallNotes/Arborist%20call%20132%20-%20notes.md#section`))).toEqual([
      { name: "Arborist call 132 - notes.md", path: "AllArboristCallNotes/Arborist call 132 - notes.md", type: "file", kind: "notes", number: 132, date: "2026-09-17" },
    ]);
  });
  it("prioritizes notes but retains explicit agenda fallbacks and unique candidates", () => {
    const md = `${row("AgendaArchive/Arborist Call 88 Agenda.md", "17 Oct 2024", 88, "agenda")}\n${row("./AllArboristCallNotes/Arborist Call 88-Notes.md", "17 Oct 2024", 88)}\n${row("./AllArboristCallNotes/Arborist Call 88-Notes.md", "17 Oct 2024", 88)}\n${row("AgendaArchive/Arborist Call 1 Agenda.md", "30 Oct 2020", 1, "agenda")}`;
    const files = parseArboristReadme(md);
    expect(files.map(file => [file.number, file.kind])).toEqual([[88, "notes"], [88, "agenda"], [1, "agenda"]]);
    expect(files[2].date).toBe("2020-10-30");
  });
  it("never repairs the known broken call 99 link or invents a root fallback", () => {
    const files = parseArboristReadme(row(`${root}AllArboristCallNotes/update%20Arborist%20call%2099%20Notes.md#arborist-call-99-notes`, "17 April 2025", 99));
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("AllArboristCallNotes/update Arborist call 99 Notes.md");
    expect(parseArboristReadme(row("Arborist Call 99 - notes.md", "17 April 2025", 99))[0].path).toBe("Arborist Call 99 - notes.md");
  });
  it.each([
    `${root}AllArboristCallNotes/../AllArboristCallNotes/Arborist%20call%20132.md`,
    `${root}AllArboristCallNotes/%2e%2e/Arborist%20call%20132.md`,
    `${root}AllArboristCallNotes%2fArborist%20call%20132.md`,
    `${root}AllArboristCallNotes/Arborist%2520call%2520132.md`,
    `${root}AllArboristCallNotes/Arborist%20call%20132.md?raw=1`,
    `${root.replace("main/", "other/")}AllArboristCallNotes/Arborist%20call%20132.md`,
    `${root.replace("github.com/", "github.com.evil.test/")}AllArboristCallNotes/Arborist%20call%20132.md`,
    `${root.replace("github.com/", "user@github.com/")}AllArboristCallNotes/Arborist%20call%20132.md`,
    "//github.com/ZcashCommunityGrants/arboretum-notes/blob/main/AllArboristCallNotes/Arborist call 132.md",
    "../AllArboristCallNotes/Arborist call 132.md",
    "AllArboristCallNotes/Arborist call 131.md",
    "Arborist Call 132 Notes.md",
    "AllArboristCallNotes/Arborist%ZZcall132.md",
  ])("rejects unsafe, mismatched or out-of-scope path %s", url => {
    expect(() => parseArboristReadme(row(url))).toThrow("ARBORIST_README_RECORDS_UNAVAILABLE");
  });
  it("keeps the real call77 mislabeled notes link as an agenda record", () => {
    expect(parseArboristReadme(row("AgendaArchive/Arborist Call 77 Agenda.md", "16 May 2024", 77))[0]).toMatchObject({ number: 77, kind: "agenda" });
  });
  it.each(["17 Sept", "31 Feb 2026", "2026-13-01", "17 Septober 2026", "TBD"])("does not infer an invalid or incomplete date %s", date => {
    const [file] = parseArboristReadme(row("AllArboristCallNotes/Arborist call 132.md", date));
    expect(file.date).toBeUndefined();
  });
  it("ignores illustrative code, comments and unrelated links", () => {
    expect(() => parseArboristReadme(`\`\`\`md\n${row("AllArboristCallNotes/Arborist call 132.md")}\n\`\`\`\n<!-- ${row("AllArboristCallNotes/Arborist call 132.md")} -->`)).toThrow();
    expect(() => parseArboristReadme("No previous meetings")).toThrow();
    expect(() => parseArboristReadme("x".repeat(512 * 1024 + 1))).toThrow("ARBORIST_README_INVALID");
  });
});
