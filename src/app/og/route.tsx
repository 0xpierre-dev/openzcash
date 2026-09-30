import { ImageResponse } from "next/og";
import { loadCardAssets } from "@/lib/seo/card-assets";
import { CARD_SIZE, readCardParams } from "@/lib/seo/card-params";
import { ShareCard } from "./share-card";

/**
 * GET /og: the 1200×630 PNG a page names as og:image and twitter:image.
 * Query: t (title), k (kicker), n (stat), s (section), v (design version).
 * Without t it draws the site card. Text is cleaned and capped in
 * readCardParams, so the renderer never sees more than a page could send.
 */

export const runtime = "nodejs";

// Same text, same card: chat apps and any CDN may keep it for a week.
const CACHE_LONG =
  "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400";
// A fallback font or a missing mark stood in: let the next fetch retry soon.
const CACHE_SHORT = "public, max-age=300, s-maxage=300";

export async function GET(request: Request): Promise<Response> {
  const card = readCardParams(new URL(request.url).searchParams);
  const assets = await loadCardAssets();
  try {
    const image = new ImageResponse(
      <ShareCard card={card} mark={assets.mark} />,
      {
        ...CARD_SIZE,
        fonts: assets.fonts,
      },
    );
    // Render now, so a Satori failure becomes a clean 500 instead of a broken stream.
    const png = await image.arrayBuffer();
    return new Response(png, {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(png.byteLength),
        "Cache-Control": assets.complete ? CACHE_LONG : CACHE_SHORT,
      },
    });
  } catch (error) {
    console.error("[og] card render failed", error);
    return new Response("Card unavailable", {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
