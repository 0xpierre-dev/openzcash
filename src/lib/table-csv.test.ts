import { describe, expect, it } from "vitest";
import { tableCsv } from "./table-csv";

describe("financial table export", () => {
  it("retains cents, full ZEC precision, source labels and records beyond the first page", () => {
    const records = Array.from({ length: 57 }, (_, i) => [
      `Grant ${i}`,
      "$649,999.98",
      "4,859.7741499",
      "Unknown",
    ]);
    const csv = tableCsv(["Grant", "Budgeted USD", "ZEC", "Date"], records);
    expect(csv).toContain('"Grant 56","$649,999.98","4,859.7741499","Unknown"');
    expect(csv.split("\r\n")).toHaveLength(58);
  });
  it("escapes quoted and multiline source text and prevents labels becoming formulas", () => {
    const csv = tableCsv(
      ["Record"],
      [
        ['A "quoted", label\nwith a second line'],
        ["=1+1"],
        ["  +1"],
        ["Normal name"],
      ],
    );
    expect(csv).toContain('"A ""quoted"", label\nwith a second line"');
    expect(csv).toContain('"\'=1+1"');
    expect(csv).toContain('"\'  +1"');
    expect(csv).toContain('"Normal name"');
  });
});
