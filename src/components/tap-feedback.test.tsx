// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TapFeedback } from "./tap-feedback";

afterEach(() => { cleanup(); vi.restoreAllMocks(); Reflect.deleteProperty(navigator, "vibrate"); });

function tap(target: Element) {
  const event = new Event("pointerdown", { bubbles: true }) as Event & { pointerType: string; isPrimary: boolean };
  Object.assign(event, { pointerType: "touch", isPrimary: true });
  target.dispatchEvent(event);
}

it("vibrates on Android without touching the hidden switch, so the page never scrolls", () => {
  const vibrate = vi.fn(() => true);
  Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
  const { container } = render(<><TapFeedback /><button>Approve</button></>);
  const click = vi.spyOn(HTMLElement.prototype, "click");
  tap(container.querySelector("button")!);
  expect(vibrate).toHaveBeenCalledWith(10);
  expect(click).not.toHaveBeenCalled();
});

it("uses the iOS switch only where vibration is unavailable, from a fixed off-screen spot", () => {
  const { container } = render(<><TapFeedback /><button>Approve</button></>);
  const label = container.querySelector("label")!;
  const click = vi.spyOn(label, "click");
  tap(container.querySelector("button")!);
  expect(click).toHaveBeenCalledOnce();
  expect(label.style.position).toBe("fixed");
});
