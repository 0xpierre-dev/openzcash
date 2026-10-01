// Measures where each Zarvis pose really stands inside its sprite cell, so the
// figure can put every pose on the same spot and a pose change never slides.
//
// The two atlases are 2 x 2 sheets of 627 px cells. The artist did not draw the
// character at the same place in every cell, so for each pose this reads the
// alpha channel and records:
//   bbox      the alpha bounding box [left, top, right, bottom], inclusive, of the
//             character itself: the tallest unbroken run of rows with ink. The
//             sheets are packed tight, so a neighbour can bleed a few pixels
//             into a cell (the ear tip of "protecting" shows up under the feet
//             of "reading"); those sit beyond an empty gap and are left out.
//   feetX     the centre of alpha mass in the bottom 8% of the bbox height.
//             The feet, not the full bbox: a raised arm or the shield widens
//             the bbox to one side and would pull the body off centre.
//   dx, dy    the translation that puts feetX on the cell centre and the
//             bottom of the bbox on the shared baseline.
//
// Run from the repository root:
//   node scripts/measure-zarvis-poses.mjs           print the table
//   node scripts/measure-zarvis-poses.mjs --write   record it in the data file
//   node scripts/measure-zarvis-poses.mjs --check   fail when the data file is stale
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA_FILE = "src/components/zarvis/zarvis-pose-metrics.json";
const SHEET_DIR = "public/zarvis";
const CELL = 627;
/** Feet centre goes to the middle of the cell; the baseline is where the resting pose already stands. */
const ANCHOR = { x: CELL / 2, baseline: 620 };
/** Ignores the faint halo around the cutout. */
const ALPHA_THRESHOLD = 16;
const FEET_BAND = 0.08;
/** Pose name, sheet and the top-left corner of its cell. */
const CELLS = [
  ["resting", "ironwood-poses-v2.png", 0, 0],
  ["greeting", "ironwood-poses-v2.png", CELL, 0],
  ["thinking", "ironwood-poses-v2.png", 0, CELL],
  ["explaining", "ironwood-poses-v2.png", CELL, CELL],
  ["reading", "ironwood-actions-v3.png", 0, 0],
  ["exploring", "ironwood-actions-v3.png", CELL, 0],
  ["protecting", "ironwood-actions-v3.png", 0, CELL],
  ["celebrating", "ironwood-actions-v3.png", CELL, CELL],
];
const round = (value) => Math.round(value * 10) / 10;

/** Reads one cell and answers the alpha of any of its pixels. */
async function readCell(sheet, left, top) {
  const { data, info } = await sharp(`${ROOT}${SHEET_DIR}/${sheet}`)
    .extract({ left, top, width: CELL, height: CELL })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return (x, y) => data[(y * info.width + x) * info.channels + 3];
}

/** For every row of the cell, whether it holds any pixel above the threshold. */
function rowsWithInk(alpha) {
  return Array.from({ length: CELL }, (_, y) => {
    for (let x = 0; x < CELL; x++) if (alpha(x, y) > ALPHA_THRESHOLD) return true;
    return false;
  });
}

/** The tallest unbroken run of rows with ink, as [first, last]: the character itself. */
function tallestRun(rows) {
  let best = null, start = -1;
  for (let y = 0; y <= rows.length; y++) {
    if (rows[y] && start < 0) start = y;
    if (!rows[y] && start >= 0) {
      if (!best || y - start > best[1] - best[0] + 1) best = [start, y - 1];
      start = -1;
    }
  }
  return best;
}

/** The rows of a pose's cell that hold artwork, for checks on the recorded numbers. */
export async function inkRows(name) {
  const cell = CELLS.find(([pose]) => pose === name);
  if (!cell) throw new Error(`Unknown pose: ${name}`);
  return rowsWithInk(await readCell(cell[1], cell[2], cell[3]));
}

async function measureCell(sheet, left, top) {
  const alpha = await readCell(sheet, left, top);
  const body = tallestRun(rowsWithInk(alpha));
  if (!body) throw new Error(`${sheet} has an empty cell at ${left},${top}`);
  const [minY, maxY] = body;
  let minX = CELL, maxX = -1;
  for (let y = minY; y <= maxY; y++) {
    for (let x = 0; x < CELL; x++) {
      if (alpha(x, y) <= ALPHA_THRESHOLD) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  const band = Math.round((maxY - minY + 1) * FEET_BAND);
  let weighted = 0, mass = 0;
  for (let y = maxY - band + 1; y <= maxY; y++) {
    for (let x = 0; x < CELL; x++) {
      const value = alpha(x, y);
      if (value <= ALPHA_THRESHOLD) continue;
      weighted += x * value;
      mass += value;
    }
  }
  const feetX = round(weighted / mass);
  return { bbox: [minX, minY, maxX, maxY], feetX, dx: round(ANCHOR.x - feetX), dy: ANCHOR.baseline - maxY };
}

/** The whole record, in the shape of the data file. */
export async function measurePoses() {
  const poses = {};
  for (const [name, sheet, left, top] of CELLS) {
    poses[name] = { sheet, cell: [left, top], ...(await measureCell(sheet, left, top)) };
  }
  return { cell: CELL, anchor: ANCHOR, alphaThreshold: ALPHA_THRESHOLD, feetBand: FEET_BAND, poses };
}

async function main(mode) {
  const measured = await measurePoses();
  const text = `${JSON.stringify(measured, null, 2)}\n`;
  if (mode === "--write") {
    writeFileSync(`${ROOT}${DATA_FILE}`, text);
    console.log(`Wrote ${DATA_FILE}`);
    return;
  }
  if (mode === "--check") {
    const recorded = JSON.parse(readFileSync(`${ROOT}${DATA_FILE}`, "utf8"));
    if (JSON.stringify(recorded) !== JSON.stringify(measured)) {
      throw new Error(`${DATA_FILE} is stale. Run: node scripts/measure-zarvis-poses.mjs --write`);
    }
    console.log(`${DATA_FILE} matches the sprite sheets`);
    return;
  }
  console.table(Object.fromEntries(Object.entries(measured.poses).map(([name, pose]) => [name, {
    bbox: pose.bbox.join(" "), feetX: pose.feetX, dx: pose.dx, dy: pose.dy,
  }])));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
