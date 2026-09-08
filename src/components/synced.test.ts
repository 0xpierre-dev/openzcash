import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ at: null as Date | null }));
vi.mock("@/lib/zcg/freshness", () => ({ latestImportAt: async () => state.at }));
vi.mock("@/lib/cache/memo", () => ({
  cached: async (_key: string, _ttl: number, loader: () => Promise<unknown>) => loader(),
}));
import { Synced } from "./synced";

afterEach(() => vi.useRealTimers());

describe("spreadsheet collection status", () => {
  it("distinguishes retrieval from source publication and exposes an absolute time", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-09-08T12:00:00Z"));
    state.at = new Date("2026-09-08T11:00:00Z");
    const html = renderToStaticMarkup(await Synced({}));
    expect(html).toContain("Last spreadsheet collection");
    expect(html).toContain('dateTime="2026-09-08T11:00:00.000Z"');
    expect(html).toContain("not the source publication date");
    expect(html).not.toContain("Collection overdue");
  });

  it("shows an overdue collection without claiming the source itself is outdated", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-09-08T12:00:00Z"));
    state.at = new Date("2026-09-07T12:00:00Z");
    expect(renderToStaticMarkup(await Synced({}))).toContain("Collection overdue");
  });

  it("does not fabricate a time when the collection is unknown", async () => {
    state.at = null;
    const html = renderToStaticMarkup(await Synced({}));
    expect(html).toContain("not recorded yet");
    expect(html).not.toContain("<time");
  });
});
