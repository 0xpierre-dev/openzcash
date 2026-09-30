import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardAssets } from "@/lib/seo/card-assets";

// Offline stand-ins for the CDN fonts: next/og's own Geist Regular under both
// family names, and the real brand mark from public/.
const GEIST = readFileSync(
  join(
    process.cwd(),
    "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf",
  ),
);
const MARK = `data:image/png;base64,${readFileSync(
  join(process.cwd(), "public/logos/marks/openzcash.png"),
).toString("base64")}`;
const font = (name: string, weight: 400 | 500) => ({
  name,
  data: GEIST.buffer.slice(
    GEIST.byteOffset,
    GEIST.byteOffset + GEIST.byteLength,
  ) as ArrayBuffer,
  weight,
  style: "normal" as const,
});
const COMPLETE: CardAssets = {
  fonts: [font("Geist", 500), font("Inter", 400), font("Inter", 500)],
  mark: MARK,
  complete: true,
};
const FALLBACK: CardAssets = { fonts: undefined, mark: null, complete: false };

const assets = vi.hoisted(() => ({ current: null as CardAssets | null }));
vi.mock("@/lib/seo/card-assets", () => ({
  CARD_FONTS: { wordmark: "Geist", text: "Inter" },
  loadCardAssets: async () => assets.current,
}));

import { GET } from "./route";

function pngSize(bytes: ArrayBuffer) {
  const view = new DataView(bytes);
  return {
    isPng: view.getUint32(0) === 0x89504e47,
    width: view.getUint32(16),
    height: view.getUint32(20),
  };
}

const get = (query: string) =>
  GET(new Request(`https://openzcash.org/og${query}`));

describe("GET /og", () => {
  beforeEach(() => {
    assets.current = COMPLETE;
  });

  it("draws a 1200×630 PNG page card, cached for a day", async () => {
    const res = await get(
      "?t=Results&s=Coinholder%20Grants&n=Q3%202026&k=Every%20round&v=2",
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("max-age=86400");
    const png = await res.arrayBuffer();
    expect(pngSize(png)).toEqual({ isPng: true, width: 1200, height: 630 });
    expect(res.headers.get("content-length")).toBe(String(png.byteLength));
  });

  it("draws the site card when no title is given", async () => {
    const res = await get("?v=2");
    expect(res.status).toBe(200);
    expect(pngSize(await res.arrayBuffer()).isPng).toBe(true);
  });

  it("caps oversized parameters instead of failing", async () => {
    const long = encodeURIComponent("word ".repeat(2_000));
    const res = await get(`?t=${long}&k=${long}&s=${long}&n=${long}`);
    expect(res.status).toBe(200);
    expect(pngSize(await res.arrayBuffer()).isPng).toBe(true);
  });

  describe("text the card fonts cannot draw", () => {
    const fetchSpy = vi.fn(async () => new Response("", { status: 503 }));

    beforeEach(() => {
      fetchSpy.mockClear();
      vi.stubGlobal("fetch", fetchSpy);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    // Satori would fetch a font or an emoji image for each new title while
    // serving the request, and keep it in a cache that never evicts.
    it.each([
      ["CJK", "中文标题测试一二三四"],
      ["Arabic", "Zcash مرحبا"],
      ["emoji", "Grants 🦓✨"],
      ["symbols", "Checked ✓ → next"],
      ["bidi override", "Grant\u202egnp.exe"],
    ])("renders %s input without any network fetch", async (_, title) => {
      const res = await get(
        `?t=${encodeURIComponent(title)}&k=${encodeURIComponent(title)}&v=2`,
      );
      expect(res.status).toBe(200);
      expect(pngSize(await res.arrayBuffer()).isPng).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("draws its own typographic punctuation without a fetch", async () => {
      const res = await get(
        `?t=${encodeURIComponent(`Founders' Reward - the "Dev Fund" · Zcash's 12% €`)}&v=2`,
      );
      expect(res.status).toBe(200);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  it("still renders on fallbacks, cached briefly so the next fetch retries", async () => {
    assets.current = FALLBACK;
    const res = await get("?t=News&v=2");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=300, s-maxage=300",
    );
    expect(pngSize(await res.arrayBuffer()).isPng).toBe(true);
  });
});
