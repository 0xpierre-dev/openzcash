import { getLegalFeed } from "@/lib/legal/feed";

export const dynamic = "force-dynamic";

/** Read-only public-source health. No collected text, private data or credentials. */
export async function GET() {
  const feed = await getLegalFeed();
  return Response.json({
    archive: feed.archive ?? { status: "unavailable", lastCollectedAt: null },
    sources: feed.sourceHealth ?? [],
  }, { headers: { "Cache-Control": "no-store" } });
}
