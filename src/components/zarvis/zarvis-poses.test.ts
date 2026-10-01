import { describe, expect, it } from "vitest";
import type { ZarvisExpression } from "@/lib/zarvis/types";
import {
  inkRows,
  measurePoses,
} from "../../../scripts/measure-zarvis-poses.mjs";
import metrics from "./zarvis-pose-metrics.json";
import {
  FIGURE_VIEW_BOX,
  POSE_ANCHOR,
  poses,
  selectedPose,
} from "./zarvis-poses";

const names = Object.keys(poses) as (keyof typeof poses)[];
const expressions: ZarvisExpression[] = [
  "idle",
  "listening",
  "thinking",
  "explaining",
  "error",
  "greeting",
  "pleased",
  "reading",
  "exploring",
  "protecting",
  "comparing",
  "uncertain",
  "clarifying",
];

describe("Zarvis pose alignment", () => {
  it("covers the eight poses, and every expression selects one of them", () => {
    expect(names).toHaveLength(8);
    for (const expression of expressions)
      expect(names, expression).toContain(selectedPose[expression]);
  });

  it.each(names)("%s has a measured offset within sane bounds", (name) => {
    const { dx, dy } = poses[name].offset;
    expect(Number.isFinite(dx) && Number.isFinite(dy)).toBe(true);
    // The artwork is roughly centred in its cell: a larger correction means a wrong cell or a broken measurement.
    expect(Math.abs(dx)).toBeLessThanOrEqual(80);
    expect(Math.abs(dy)).toBeLessThanOrEqual(40);
  });

  it.each(names)(
    "%s stands on the shared spot: feet centre and baseline",
    (name) => {
      const measured = metrics.poses[name];
      const { dx, dy } = poses[name].offset;
      expect(Math.abs(measured.feetX + dx - POSE_ANCHOR.x)).toBeLessThanOrEqual(
        0.5,
      );
      expect(measured.bbox[3] + dy).toBe(POSE_ANCHOR.baseline);
    },
  );

  it.each(names)(
    "%s stays inside the figure once moved, with room for the gestures",
    (name) => {
      const [left, top, right, bottom] = metrics.poses[name].bbox;
      const { dx, dy } = poses[name].offset;
      const margin = 20;
      expect(left + dx).toBeGreaterThanOrEqual(FIGURE_VIEW_BOX.x + margin);
      expect(right + dx).toBeLessThanOrEqual(
        FIGURE_VIEW_BOX.x + FIGURE_VIEW_BOX.width - margin,
      );
      expect(top + dy).toBeGreaterThanOrEqual(FIGURE_VIEW_BOX.y + margin);
      expect(bottom + dy).toBeLessThanOrEqual(
        FIGURE_VIEW_BOX.y + FIGURE_VIEW_BOX.height - margin,
      );
    },
  );

  it.each(names)(
    "%s is measured on its own feet: every row of the feet band has ink",
    async (name) => {
      // A neighbour's pixels bleeding into the cell sit beyond an empty gap; a bbox that reaches them would lift the pose off the baseline.
      const [, top, , bottom] = metrics.poses[name].bbox;
      const band = Math.round((bottom - top + 1) * metrics.feetBand);
      const rows = await inkRows(name);
      const empty = rows
        .map((ink, y) => (ink ? -1 : y))
        .filter((y) => y > bottom - band && y <= bottom);
      expect(empty).toEqual([]);
    },
  );

  it("keeps the ear tip that bleeds in from the cell below out of the reading pose", () => {
    expect(metrics.poses.reading.bbox[3]).toBe(618);
    expect(poses.reading.offset.dy).toBe(2);
  });

  it.each(names)("%s draws only the rows of its own body", (name) => {
    const [, top, , bottom] = metrics.poses[name].bbox;
    expect(poses[name].rows).toEqual({ top, bottom });
  });

  it("centres the figure and its ground on the shared spot", () => {
    expect(FIGURE_VIEW_BOX.x + FIGURE_VIEW_BOX.width / 2).toBe(POSE_ANCHOR.x);
    expect(POSE_ANCHOR.x).toBe(metrics.cell / 2);
    expect(POSE_ANCHOR.baseline).toBe(metrics.anchor.baseline);
  });

  it("gives the shield its own top layer for the welcome emphasis", () => {
    expect(poses.protecting.emblem).toMatch(/^M[\d .A-Za-z-]+Z$/);
    expect(poses.protecting.emblemPivot).toMatch(/^\d+px \d+px$/);
  });

  it("keeps the recorded numbers in step with the sprite sheets", async () => {
    expect(await measurePoses()).toEqual(metrics);
  });
});
