import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Fonts and the brand mark for the share cards, loaded once per process.
 *
 * next/font serves woff2, which Satori cannot read, so the card fetches woff
 * files of the site's own families from pinned Fontsource releases: Geist for
 * the wordmark, as in the sidebar banner, and Inter for the text, because
 * Satori spaces Geist's words unevenly at text sizes. If the CDN is
 * unreachable the card still renders in the Geist Regular bundled with
 * next/og, and the loader tries the CDN again after a while.
 */

export type CardFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 500;
  style: "normal";
};

export type CardAssets = {
  /** Undefined: let next/og use its bundled Geist Regular. */
  fonts: CardFont[] | undefined;
  /** The gold Zcash mark of the sidebar banner, as a data URL. */
  mark: string | null;
  /** False when a fallback stood in, so the response is cached briefly. */
  complete: boolean;
};

export const CARD_FONTS = { wordmark: "Geist", text: "Inter" } as const;

const FONTSOURCE = "https://cdn.jsdelivr.net/npm/@fontsource";
const FONT_FILES: { name: string; weight: 400 | 500; url: string }[] = [
  {
    name: CARD_FONTS.wordmark,
    weight: 500,
    url: `${FONTSOURCE}/geist-sans@5.3.0/files/geist-sans-latin-500-normal.woff`,
  },
  {
    name: CARD_FONTS.text,
    weight: 400,
    url: `${FONTSOURCE}/inter@5.3.0/files/inter-latin-400-normal.woff`,
  },
  {
    name: CARD_FONTS.text,
    weight: 500,
    url: `${FONTSOURCE}/inter@5.3.0/files/inter-latin-500-normal.woff`,
  },
];
const FETCH_TIMEOUT_MS = 4_000;
const RETRY_AFTER_MS = 10 * 60_000;
const MARK_PATH = join(
  process.cwd(),
  "public",
  "logos",
  "marks",
  "openzcash.png",
);

async function fetchFont(file: (typeof FONT_FILES)[number]): Promise<CardFont> {
  const res = await fetch(file.url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${file.url}: HTTP ${res.status}`);
  return {
    name: file.name,
    data: await res.arrayBuffer(),
    weight: file.weight,
    style: "normal",
  };
}

async function loadFonts(): Promise<CardFont[] | undefined> {
  try {
    return await Promise.all(FONT_FILES.map(fetchFont));
  } catch (error) {
    console.error(
      "[og] card fonts unavailable, using the bundled Geist Regular",
      error,
    );
    return undefined;
  }
}

async function loadMark(): Promise<string | null> {
  try {
    const png = await readFile(MARK_PATH);
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch (error) {
    console.error(
      "[og] brand mark unreadable, rendering the wordmark alone",
      error,
    );
    return null;
  }
}

async function load(): Promise<CardAssets> {
  const [fonts, mark] = await Promise.all([loadFonts(), loadMark()]);
  return { fonts, mark, complete: Boolean(fonts && mark) };
}

let cache: { assets: Promise<CardAssets>; at: number } | null = null;

export async function loadCardAssets(now = Date.now()): Promise<CardAssets> {
  if (cache) {
    const assets = await cache.assets;
    if (assets.complete || now - cache.at < RETRY_AFTER_MS) return assets;
  }
  cache = { assets: load(), at: now };
  return cache.assets;
}
