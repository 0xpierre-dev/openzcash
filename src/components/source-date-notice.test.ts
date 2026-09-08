import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SourceDateNotice } from "./source-date-notice";

const now = Date.parse("2026-09-08T04:00:00Z");
const render = (date: string | null) => renderToStaticMarkup(createElement(SourceDateNotice, { date, now }));

describe("source reference dates", () => {
  it("keeps an old source date visible even when checked today", () => {
    const html = render("2026-08-05");
    expect(html).toContain("34 days ago");
    expect(html).toContain("not live balances");
    expect(html).toContain("Automatic checks do not change the source reference date");
  });
  it.each([null, "invalid", "2026-02-30"])("does not invent a date for %s", (date) => {
    expect(render(date)).toContain("not provided");
  });
  it("flags future source dates rather than showing a negative age", () => {
    expect(render("2026-09-09")).toContain("future date reported by source");
  });
});
