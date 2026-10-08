import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("./zarvis-figure", () => ({ ZarvisFigure: () => null }));
import { AnswerMarkdown } from "./zarvis-chat";

const render = (text: string) => renderToStaticMarkup(createElement(AnswerMarkdown, null, text));

describe("Answer Markdown", () => {
  it("renders a GFM comparison table with a header row", () => {
    const html = render("| Year | Paid USD |\n|---|---|\n| 2024 | $3,396,155 |\n| 2025 | $3,858,126 |");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Year</th>");
    expect(html).toContain("<td>$3,858,126</td>");
  });
  it("keeps raw HTML and unlisted sources out of the answer", () => {
    const html = render("Hello <script>alert(1)</script> [evil](https://evil.example/x) [zip](https://zips.z.cash/zip-0310)");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("evil.example");
    expect(html).toContain('href="https://zips.z.cash/zip-0310"');
  });
});
