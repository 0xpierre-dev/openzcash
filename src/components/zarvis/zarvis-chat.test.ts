import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
// The rigged SVG mascot is irrelevant to layout order and pulls next/image into a node test.
vi.mock("./zarvis-figure", () => ({ ZarvisFigure: () => null }));
import { ZarvisProvider } from "./zarvis-provider";
import { ZarvisChat, ZarvisPage } from "./zarvis-chat";
import { STARTERS } from "@/lib/zarvis/sources";

const render = (compact: boolean) =>
  renderToStaticMarkup(
    createElement(
      ZarvisProvider,
      null,
      compact
        ? createElement(ZarvisChat, { compact: true })
        : createElement(ZarvisPage),
    ),
  );
function positions(html: string, needles: string[]) {
  return needles.map((needle) => {
    const index = html.indexOf(needle);
    expect(index, needle).toBeGreaterThanOrEqual(0);
    return index;
  });
}

describe("Zarvis empty state", () => {
  it.each([
    ["page", false, 'id="zarvis-question"'],
    ["dock", true, 'id="zarvis-dock-question"'],
  ] as const)(
    "keeps the %s as one centred group: pause in the toolbar, then mascot and title, composer, starters, note, and privacy last",
    (_label, compact, composer) => {
      const html = render(compact);
      expect(html).toContain('data-empty="true"');
      // The pause control sits between the toolbar's start and the history region, i.e. inside the toolbar, and the mascot precedes the title.
      const order = positions(html, [
        'class="zarvis-chat-toolbar"',
        'aria-label="Pause mascot animation"',
        'class="zarvis-messages"',
        'aria-label="Say hello to Zarvis"',
        "What would you like to know about Zcash?",
        composer,
        'class="zarvis-starters"',
        "How Zarvis works",
        "Zarvis can make mistakes.",
      ]);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      // One pause control, in the toolbar; the mascot no longer carries a floating one.
      expect(html.split('aria-label="Pause mascot animation"')).toHaveLength(2);
      expect(html).not.toMatch(/What would you like to know<br\/?>/);
      // The empty history is not a tab stop; it becomes one, labelled, once there is a conversation.
      expect(html).not.toContain('aria-label="Conversation history"');
    },
  );
  it("labels each starter chip with its full question", () => {
    const html = render(false);
    for (const starter of STARTERS) {
      expect(html).toContain(`title="${starter.question}"`);
      expect(html).toContain(`>${starter.label}</button>`);
    }
    expect(html).toContain(
      "Answers in Portuguese, Spanish, English and more, with sources.",
    );
    expect(html).toContain('href="/zarvis/about"');
  });
});
