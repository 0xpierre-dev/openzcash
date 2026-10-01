import type { ZarvisExpression } from "@/lib/zarvis/types";
import metrics from "./zarvis-pose-metrics.json";

/**
 * The eight poses are drawn at different places inside their sprite cells (the wave stands
 * about 67 px left of the resting pose, the shield 23 px higher). `offset` moves each pose so
 * its feet land on the same spot; the numbers are measured from the artwork by
 * scripts/measure-zarvis-poses.mjs and recorded in zarvis-pose-metrics.json. All other
 * coordinates here (eyes, masks, pivots) stay in the pose's own cell space.
 */
type Eye = [number, number, number, number];
type PoseArt = {
  eyes: [Eye, Eye];
  head: string;
  /** A held object in front of the head: drawn with the body so the head can move behind it. */
  foreground?: string;
  arm?: string;
  pivot?: string;
  /** A tight outline of the held object, redrawn as a top layer when it needs one emphasis. */
  emblem?: string;
  emblemPivot?: string;
};
export type PoseName = keyof typeof metrics.poses;
export type Pose = PoseArt & {
  sheet: string;
  x: number;
  y: number;
  offset: { dx: number; dy: number };
  /** First and last row of the character in its cell. Only these are drawn, so pixels a neighbour bleeds into the cell never show. */
  rows: { top: number; bottom: number };
};

const head = "M80 0H580V292Q570 375 486 397Q325 410 194 356L91 298Z";
const wave =
  "M91 294C84 285 73 285 66 299L50 304C36 313 43 337 56 350L67 360L70 381C86 421 111 444 137 439L161 431C173 422 183 410 190 399L163 365L148 366L150 344C161 319 149 310 143 315L133 299C123 291 115 303 113 306L111 294C105 279 93 283 91 294Z";
const art: Record<PoseName, PoseArt> = {
  resting: {
    eyes: [
      [282, 282, 48, 34],
      [400, 313, 44, 34],
    ],
    head,
  },
  greeting: {
    eyes: [
      [228, 274, 48, 34],
      [345, 309, 44, 34],
    ],
    head: "M20 0H555V285Q550 369 472 400Q312 416 154 352L69 292Z",
    arm: wave,
    pivot: "175px 404px",
  },
  thinking: {
    eyes: [
      [275, 252, 36, 40],
      [383, 296, 34, 40],
    ],
    head: "M80 0H580V300Q558 365 480 379Q343 390 208 334L91 288Z",
    foreground: "M225 352Q269 312 325 336L370 420L290 466L206 401Z",
  },
  explaining: {
    eyes: [
      [209, 276, 44, 33],
      [324, 300, 44, 33],
    ],
    head: "M25 0H545V274Q520 361 460 378Q280 390 115 329L59 278Z",
    arm: "M377 416Q408 433 436 409L465 402Q497 393 508 376L493 365L483 366L487 355L477 345L466 351L465 335Q452 324 445 339L432 355L411 365L391 370Z",
    pivot: "390px 417px",
  },
  reading: {
    eyes: [
      [285, 291, 39, 40],
      [404, 315, 34, 37],
    ],
    head,
    foreground: "M251 363L372 389L472 361L498 490L365 524L243 484Z",
  },
  exploring: {
    eyes: [
      [237, 286, 38, 40],
      [352, 313, 35, 39],
    ],
    head: "M20 0H560V289Q533 370 468 392Q294 405 137 339L58 279Z",
    foreground:
      "M451 279Q522 270 529 332L492 444L438 471L402 414L436 373Q394 326 451 279Z",
  },
  protecting: {
    eyes: [
      [294, 261, 47, 34],
      [411, 284, 45, 34],
    ],
    head: "M80 0H580V292Q550 365 489 383Q330 392 204 338L90 286Z",
    foreground: "M340 338L434 309L506 352L488 447L433 518L359 453Z",
    emblem:
      "M346 343Q392 336 431 313Q463 341 502 352Q500 420 471 470Q452 494 423 507Q389 492 370 461Q348 420 346 343Z",
    emblemPivot: "424px 412px",
  },
  celebrating: {
    eyes: [
      [237, 260, 49, 34],
      [354, 296, 47, 33],
    ],
    head: "M20 0H568V286Q542 373 468 393Q296 405 139 344L61 286Z",
    arm: "M84 269Q128 257 139 296L152 315L187 355L166 395Q111 406 81 366L58 319Q59 283 84 269Z",
    pivot: "177px 380px",
  },
};

export const POSE_CELL = metrics.cell;
/** Where every pose's feet stand: the centre of the cell, on one baseline. */
export const POSE_ANCHOR = {
  x: metrics.anchor.x,
  baseline: metrics.anchor.baseline,
} as const;
/** The cell plus room for gestures, centred on the feet. */
export const FIGURE_VIEW_BOX = {
  x: -60,
  y: -36,
  width: 747,
  height: 710,
} as const;
/** A soft contact shadow: the feet stand on its upper edge, for every pose. */
export const GROUND = {
  cx: POSE_ANCHOR.x,
  cy: POSE_ANCHOR.baseline + 9,
  rx: 132,
  ry: 12,
} as const;

export const poses = Object.fromEntries(
  (Object.keys(art) as PoseName[]).map((name) => {
    const measured = metrics.poses[name];
    return [
      name,
      {
        ...art[name],
        sheet: measured.sheet,
        x: measured.cell[0],
        y: measured.cell[1],
        offset: { dx: measured.dx, dy: measured.dy },
        rows: { top: measured.bbox[1], bottom: measured.bbox[3] },
      },
    ];
  }),
) as Record<PoseName, Pose>;

export const selectedPose: Record<ZarvisExpression, PoseName> = {
  idle: "resting",
  listening: "resting",
  greeting: "greeting",
  thinking: "thinking",
  explaining: "explaining",
  reading: "reading",
  exploring: "exploring",
  protecting: "protecting",
  pleased: "celebrating",
  error: "thinking",
  comparing: "explaining",
  uncertain: "thinking",
  clarifying: "exploring",
};
