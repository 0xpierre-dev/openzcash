import { describe, expect, it } from "vitest";
import { answerClipboard, questionLink, sharedQuestion, withoutSharedQuestion } from "./share";
describe("Zarvis share helpers", () => {
  it("builds a question link only for a real, bounded question", () => {
    expect(questionLink("When is the next halving?")).toBe("https://openzcash.org/zarvis?q=When+is+the+next+halving%3F");
    expect(questionLink("   ")).toBeNull(); expect(questionLink("x".repeat(2_001))).toBeNull();
    expect(questionLink("Qual é o preço?", "http://127.0.0.1:3100/zarvis")).toBe("http://127.0.0.1:3100/zarvis?q=Qual+%C3%A9+o+pre%C3%A7o%3F");
  });
  it("reads a shared question once and strips it from the address", () => {
    expect(sharedQuestion("?q=When+is+the+next+halving%3F&utm=1")).toBe("When is the next halving?");
    expect(sharedQuestion("?q=  spaced   out ")).toBe("spaced out");
    expect(sharedQuestion("?q=")).toBeNull(); expect(sharedQuestion("")).toBeNull(); expect(sharedQuestion(`?q=${"x".repeat(2_001)}`)).toBeNull();
    expect(withoutSharedQuestion("https://openzcash.org/zarvis?q=hello&depth=deep#top")).toBe("/zarvis?depth=deep#top");
    expect(withoutSharedQuestion("https://openzcash.org/zarvis?q=hello")).toBe("/zarvis");
  });
  it("copies the answer with numbered sources, retrieval times and attribution by route", () => {
    const text = answerClipboard({
      question: "When is the next halving?", content: "The next halving is at block **4,406,400**.",
      sources: [{ title: "OpenZcash · chain", url: "https://openzcash.org/zec-observatory", retrievedAt: "2026-09-28T21:14:56.177Z" }, { title: "ZIP 234", url: "https://zips.z.cash/zip-0234" }],
      provenance: { route: "model", model: "grok-4.7", webSearch: false, groundingFallback: false, withheldFigures: 0, language: "en" }, provider: "xAI (Grok)", askedAt: "2026-09-28T21:15:00.000Z",
    });
    expect(text).toBe([
      "Q: When is the next halving?", "", "The next halving is at block **4,406,400**.", "", "Sources:",
      "1. OpenZcash · chain — https://openzcash.org/zec-observatory (retrieved Sep 28, 2026, 9:14 PM UTC)", "2. ZIP 234 — https://zips.z.cash/zip-0234", "",
      "— Zarvis (OpenZcash) with Grok 4.7; check the sources · https://openzcash.org/zarvis · 2026-09-28",
    ].join("\n"));
    expect(answerClipboard({ content: "Direct.", provenance: { route: "local", model: null, webSearch: false, groundingFallback: false, withheldFigures: 0, language: "pt" } })).toBe("Direct.\n\n— Zarvis (OpenZcash), direct from OpenZcash data, no AI model · https://openzcash.org/zarvis");
    expect(answerClipboard({ content: "Plain.", sources: [{ title: "One", url: "https://z.cash/" }] })).toContain("Source:\n1. One — https://z.cash/");
  });
});
