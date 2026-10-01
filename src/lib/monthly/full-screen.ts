// Full screen reading on phones. The decisions are pure so the reader only
// wires them to the page: no DOM is read or written here.

// Phones held upright are narrow; phones held sideways are short.
export const PHONE_QUERY = "(max-width: 850px), (max-height: 480px)";

const whole = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

// A portrait screen shows the landscape page along its long side: the surface
// takes the swapped dimensions and is turned a quarter clockwise in CSS, so
// the page is fitted and drawn for the turned box instead of being scaled.
export function fullScreenLayout(
  viewportWidth: number,
  viewportHeight: number,
) {
  const width = whole(viewportWidth);
  const height = whole(viewportHeight);
  const rotated = height > width;
  return rotated
    ? { rotated, width: height, height: width }
    : { rotated, width, height };
}

export type PageTurn = "previous" | "next";
const SWIPE_DISTANCE = 48;
// About 30 degrees either side of the reading direction.
const SWIPE_SLOPE = 0.6;

// Screen movement in, page turn out. On a rotated page the reading direction
// runs down the screen, so reading left is the top edge.
export function swipeTurn(
  dx: number,
  dy: number,
  rotated: boolean,
): PageTurn | null {
  const along = rotated ? dy : dx;
  const across = rotated ? dx : dy;
  if (!Number.isFinite(along) || !Number.isFinite(across)) return null;
  if (
    Math.abs(along) < SWIPE_DISTANCE ||
    Math.abs(across) > Math.abs(along) * SWIPE_SLOPE
  )
    return null;
  return along < 0 ? "next" : "previous";
}

type Point = { x: number; y: number };
type Box = { left: number; top: number; width: number; height: number };

// Where a screen point falls across the page, 0 at its reading left and 1 at
// its reading right. The box is the page as it sits on screen.
export function readingFraction(point: Point, box: Box, rotated: boolean) {
  const length = rotated ? box.height : box.width;
  if (!(length > 0)) return 0.5;
  const offset = rotated ? point.y - box.top : point.x - box.left;
  return Math.min(1, Math.max(0, offset / length));
}

export function tapZone(fraction: number): PageTurn | "controls" {
  if (fraction < 1 / 3) return "previous";
  if (fraction > 2 / 3) return "next";
  return "controls";
}

export function turnedPage(page: number, total: number, turn: PageTurn) {
  const next = page + (turn === "next" ? 1 : -1);
  return next >= 1 && next <= total ? next : null;
}

export function pageCounter(page: number, total: number) {
  return `${String(page).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
}

// What a screen reader hears when the mode opens and closes.
export function fullScreenMessage(on: boolean, page = 0, total = 0) {
  return on ? `Full screen on. Page ${page} of ${total}.` : "Full screen off.";
}

// The stop Tab moves to among `count` controls, wrapping at both ends. An
// index of -1 means focus is currently outside the surface.
export function tabStop(count: number, index: number, backwards: boolean) {
  if (count < 1) return null;
  if (index < 0) return backwards ? count - 1 : 0;
  return (index + (backwards ? -1 : 1) + count) % count;
}
