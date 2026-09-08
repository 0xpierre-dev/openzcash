import { describe, expect, it } from "vitest";
import { spreadsheetSource } from "./source-links";

describe("spreadsheet source links", () => {
  it("links the exact source row without an off-by-one error", () => {
    expect(spreadsheetSource("803214474", 0)).toMatchObject({ sourceRow: 1 });
    expect(spreadsheetSource("803214474", 183)).toEqual({
      sourceRow: 184,
      sourceUrl: expect.stringMatching(/\/edit#gid=803214474&range=A184$/),
    });
  });
  it("links only the sheet when its row is unknown", () => {
    for (const row of [null, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER]) {
      const result = spreadsheetSource("803214474", row);
      expect(result.sourceRow).toBeNull();
      expect(result.sourceUrl).toMatch(/#gid=803214474$/);
    }
  });
  it("does not manufacture provenance when the source tab is unknown", () => {
    for (const gid of [null, "", "invalid#gid=1"]) {
      expect(spreadsheetSource(gid, 10)).toEqual({ sourceRow: null, sourceUrl: null });
    }
  });
});
