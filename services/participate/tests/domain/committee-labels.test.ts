import { committeeAction } from "@/lib/domain/committee";
import { COMMITTEE_LABELS, committeeLabelIds, committeeLabelInk } from "@/lib/domain/committee-labels";

it("accepts every catalog label, normalizes order, and rejects unknown or repeated labels", () => {
  const ids = COMMITTEE_LABELS.map(label => label.id);
  expect(committeeLabelIds.parse(ids)).toEqual([...ids].sort());
  expect(committeeLabelIds.parse([])).toEqual([]);
  expect(() => committeeLabelIds.parse([ids[0], ids[0]])).toThrow();
  expect(() => committeeLabelIds.parse(["999999999999999999"])).toThrow();
  expect(() => committeeAction.parse({ action: "labels", recordId: "proposal", labels: ids, version: -1 })).toThrow();
  expect(() => committeeAction.parse({ action: "labels", recordId: "proposal", labels: ids, version: 0, committeeId: "other" })).toThrow();
});

it("uses a readable foreground for each original GitHub background color", () => {
  for (const label of COMMITTEE_LABELS) {
    expect(label.color).toMatch(/^[a-f0-9]{6}$/);
    const rgb = label.color.match(/../g)!.map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
    const luminance = .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
    const contrast = committeeLabelInk(label.color) === "#ffffff" ? 1.05 / (luminance + .05) : (luminance + .05) / .05;
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  }
});
