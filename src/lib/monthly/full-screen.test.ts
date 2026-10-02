import { describe, expect, it } from "vitest";
import { fitPage } from "./reader";
import {
  DOUBLE_TAP_MS,
  PHONE_QUERY,
  fullScreenLayout,
  fullScreenMessage,
  middleTap,
  movementWakes,
  pageClick,
  pageCounter,
  readingFraction,
  settling,
  swipeTurn,
  tabStop,
  tapZone,
  turnTip,
  turnedPage,
} from "./full-screen";

describe("monthly full screen reading", () => {
  it("names phones by a narrow or a short viewport", () => {
    expect(PHONE_QUERY).toBe("(max-width: 850px), (max-height: 480px)");
  });

  it.each([
    [375, 812],
    [390, 844],
    [320, 568],
    [800, 1000],
  ])(
    "turns the reading surface along the long side of a %i × %i portrait screen held in the hand",
    (width, height) => {
      const layout = fullScreenLayout(width, height, true);
      expect(layout).toEqual({ rotated: true, width: height, height: width });
      const page = fitPage(layout.width, layout.height);
      expect(page.width).toBeGreaterThan(fitPage(width, height).width);
      expect(page.height).toBeLessThanOrEqual(width);
    },
  );

  it.each([
    [800, 900],
    [800, 1000],
    [375, 812],
    [1080, 1920],
  ])(
    "keeps the page upright in a %i × %i portrait window on a monitor nobody can turn",
    (width, height) => {
      const layout = fullScreenLayout(width, height, false);
      expect(layout).toEqual({ rotated: false, width, height });
      expect(fitPage(layout.width, layout.height).width).toBe(width);
    },
  );

  it.each([
    [812, 375],
    [844, 390],
    [1280, 800],
    [500, 500],
  ])("keeps a %i × %i landscape screen upright", (width, height) => {
    const upright = { rotated: false, width, height };
    expect(fullScreenLayout(width, height, true)).toEqual(upright);
    expect(fullScreenLayout(width, height, false)).toEqual(upright);
  });

  it("gives a 375 × 812 phone a page of about 667 × 375", () => {
    const layout = fullScreenLayout(375, 812, true);
    expect(fitPage(layout.width, layout.height)).toEqual({
      width: 666,
      height: 375,
    });
    expect(fitPage(375, 812)).toEqual({ width: 375, height: 210 });
  });

  it("fits an 800 × 900 window with a mouse to an upright page of 800 × 450", () => {
    const layout = fullScreenLayout(800, 900, false);
    expect(fitPage(layout.width, layout.height)).toEqual({
      width: 800,
      height: 450,
    });
  });

  it("never returns a negative, fractional or unusable surface", () => {
    expect(fullScreenLayout(374.6, 811.4, true)).toEqual({
      rotated: true,
      width: 811,
      height: 374,
    });
    expect(fullScreenLayout(374.6, 811.4, false)).toEqual({
      rotated: false,
      width: 374,
      height: 811,
    });
    expect(fullScreenLayout(0, 0, true)).toEqual({
      rotated: false,
      width: 0,
      height: 0,
    });
    expect(fullScreenLayout(-20, Number.NaN, true)).toEqual({
      rotated: false,
      width: 0,
      height: 0,
    });
  });

  it("greets a hand with the swipe and a mouse with the arrow keys", () => {
    expect(turnTip(true)).toBe("Swipe to turn pages");
    expect(turnTip(false)).toBe("Use ← → to turn pages");
    expect(turnTip(false)).not.toMatch(/swipe/i);
  });

  it("turns pages on a horizontal swipe in an upright layout", () => {
    expect(swipeTurn(-80, 6, false)).toBe("next");
    expect(swipeTurn(80, -6, false)).toBe("previous");
    expect(swipeTurn(0, -120, false)).toBeNull();
    expect(swipeTurn(0, 120, false)).toBeNull();
  });

  it("reads a swipe along the long side of the screen when the page is rotated", () => {
    // Reading left is the top of the screen, so a finger moving up turns forward.
    expect(swipeTurn(6, -80, true)).toBe("next");
    expect(swipeTurn(-6, 80, true)).toBe("previous");
    expect(swipeTurn(-120, 0, true)).toBeNull();
    expect(swipeTurn(120, 0, true)).toBeNull();
  });

  it("ignores short and slanted swipes", () => {
    expect(swipeTurn(-47, 0, false)).toBeNull();
    expect(swipeTurn(-48, 0, false)).toBe("next");
    expect(swipeTurn(-100, 70, false)).toBeNull();
    expect(swipeTurn(-100, 50, false)).toBe("next");
    expect(swipeTurn(70, 100, true)).toBeNull();
    expect(swipeTurn(Number.NaN, 0, false)).toBeNull();
  });

  it("measures a tap along the reading direction of the page", () => {
    const upright = { left: 72, top: 0, width: 667, height: 375 };
    expect(readingFraction({ x: 72, y: 100 }, upright, false)).toBe(0);
    expect(readingFraction({ x: 405.5, y: 100 }, upright, false)).toBe(0.5);
    expect(readingFraction({ x: 739, y: 100 }, upright, false)).toBe(1);
    // A rotated page occupies a tall box on screen: its left edge is at the top.
    const turned = { left: 0, top: 72, width: 375, height: 667 };
    expect(readingFraction({ x: 300, y: 72 }, turned, true)).toBe(0);
    expect(readingFraction({ x: 20, y: 739 }, turned, true)).toBe(1);
    expect(readingFraction({ x: 20, y: 405.5 }, turned, true)).toBe(0.5);
  });

  it("keeps taps in the margins on the nearest side and survives an empty box", () => {
    const box = { left: 72, top: 0, width: 667, height: 375 };
    expect(readingFraction({ x: 10, y: 10 }, box, false)).toBe(0);
    expect(readingFraction({ x: 800, y: 10 }, box, false)).toBe(1);
    expect(
      readingFraction(
        { x: 10, y: 10 },
        { left: 0, top: 0, width: 0, height: 0 },
        false,
      ),
    ).toBe(0.5);
  });

  it("splits the page into previous, controls and next thirds", () => {
    expect(tapZone(0)).toBe("previous");
    expect(tapZone(0.33)).toBe("previous");
    expect(tapZone(0.34)).toBe("controls");
    expect(tapZone(0.5)).toBe("controls");
    expect(tapZone(0.66)).toBe("controls");
    expect(tapZone(0.67)).toBe("next");
    expect(tapZone(1)).toBe("next");
  });

  it("reads a click as a tap on the page only after a press of the pointer", () => {
    expect(pageClick(true, 0)).toBe("previous");
    expect(pageClick(true, 0.5)).toBe("controls");
    expect(pageClick(true, 1)).toBe("next");
  });

  it("only wakes the controls on a click that followed no press, wherever it claims to be", () => {
    // Assistive technology clicks the page image at 0, 0: the previous third.
    expect(pageClick(false, 0)).toBe("wake");
    expect(pageClick(false, 0.5)).toBe("wake");
    expect(pageClick(false, 1)).toBe("wake");
  });

  it("turns no page on a tap while the page is pinched in", () => {
    // Zoomed in, the reader cannot see which third is under the finger.
    expect(pageClick(true, 0, true)).toBe("controls");
    expect(pageClick(true, 0.5, true)).toBe("controls");
    expect(pageClick(true, 1, true)).toBe("controls");
    expect(pageClick(false, 1, true)).toBe("wake");
    expect(pageClick(true, 1, false)).toBe("next");
  });

  it("takes no taps while the page that just opened settles", () => {
    // The double click of a mouse can take half a second.
    expect(DOUBLE_TAP_MS).toBe(500);
    expect(settling(1000, 1000)).toBe(true);
    expect(settling(1100, 1000)).toBe(true);
    expect(settling(1499, 1000)).toBe(true);
    expect(settling(1500, 1000)).toBe(false);
    expect(settling(9000, 1000)).toBe(false);
  });

  it("still holds back a tap made before the page opened and delivered after", () => {
    expect(settling(940, 1000)).toBe(true);
  });

  it("holds back nothing on a page that never opened or at a time it cannot read", () => {
    expect(settling(100, Number.NEGATIVE_INFINITY)).toBe(false);
    expect(settling(Number.NaN, 1000)).toBe(false);
    expect(settling(1100, Number.NaN)).toBe(false);
  });

  it("brings resting controls back when a mouse moves, never for a finger", () => {
    expect(movementWakes("mouse", true)).toBe(true);
    expect(movementWakes("mouse", false)).toBe(false);
    expect(movementWakes("touch", true)).toBe(false);
    expect(movementWakes("pen", true)).toBe(false);
    expect(movementWakes("", true)).toBe(false);
  });

  it("shows and hides the controls on a finger tap in the middle of the page", () => {
    expect(middleTap("touch", true)).toBe("wake");
    expect(middleTap("touch", false)).toBe("rest");
    expect(middleTap("pen", false)).toBe("rest");
  });

  it("never hides the controls on a mouse click, since the next movement would bring them back", () => {
    expect(middleTap("mouse", true)).toBe("wake");
    expect(middleTap("mouse", false)).toBe("wake");
  });

  it("turns one page at a time and stops at both covers", () => {
    expect(turnedPage(7, 27, "next")).toBe(8);
    expect(turnedPage(7, 27, "previous")).toBe(6);
    expect(turnedPage(1, 27, "previous")).toBeNull();
    expect(turnedPage(27, 27, "next")).toBeNull();
  });

  it("writes a quiet two digit page counter", () => {
    expect(pageCounter(7, 27)).toBe("07 / 27");
    expect(pageCounter(12, 104)).toBe("12 / 104");
  });

  it("says in words that the mode opened, with the page, and that it closed", () => {
    expect(fullScreenMessage(true, 7, 27)).toBe(
      "Full screen on. Page 7 of 27.",
    );
    expect(fullScreenMessage(false)).toBe("Full screen off.");
  });

  it("keeps Tab inside the open reading surface", () => {
    expect(tabStop(4, 3, false)).toBe(0);
    expect(tabStop(4, 0, true)).toBe(3);
    expect(tabStop(4, 1, false)).toBe(2);
    expect(tabStop(4, 2, true)).toBe(1);
    // Focus that starts outside enters at the nearest end.
    expect(tabStop(4, -1, false)).toBe(0);
    expect(tabStop(4, -1, true)).toBe(3);
    expect(tabStop(0, -1, false)).toBeNull();
  });
});
