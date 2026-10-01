import { describe, expect, it } from "vitest";
import { wrapFocus } from "./focus-wrap";

describe("wrapFocus", () => {
  it("wraps forward from the last element to the first", () => {
    expect(wrapFocus(4, 3, false)).toBe(0);
  });

  it("wraps backward from the first element to the last", () => {
    expect(wrapFocus(4, 0, true)).toBe(3);
  });

  it("leaves the browser alone in the middle of the group", () => {
    expect(wrapFocus(4, 1, false)).toBeNull();
    expect(wrapFocus(4, 2, true)).toBeNull();
    expect(wrapFocus(4, 0, false)).toBeNull();
    expect(wrapFocus(4, 3, true)).toBeNull();
  });

  it("pulls focus back in when it sits outside the group", () => {
    expect(wrapFocus(4, -1, false)).toBe(0);
    expect(wrapFocus(4, -1, true)).toBe(3);
  });

  it("keeps a lone element focused in both directions", () => {
    expect(wrapFocus(1, 0, false)).toBe(0);
    expect(wrapFocus(1, 0, true)).toBe(0);
  });

  it("has nowhere to send focus in an empty group", () => {
    expect(wrapFocus(0, -1, false)).toBeNull();
    expect(wrapFocus(0, -1, true)).toBeNull();
  });
});
