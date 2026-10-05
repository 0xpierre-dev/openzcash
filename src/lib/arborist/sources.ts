import { ARBORIST_CHANNEL_ID } from "./feed";
export const ARBORIST_REPO_URL = "https://github.com/ZcashCommunityGrants/arboretum-notes";
export const ARBORIST_RAW_BASE = "https://raw.githubusercontent.com/ZcashCommunityGrants/arboretum-notes/main/";
export const ARBORIST_README_URL = `${ARBORIST_RAW_BASE}README.md`;
export const ARBORIST_YOUTUBE_URL = "https://www.youtube.com/@zcashfoundation/videos";
export const ARBORIST_YOUTUBE_PAGE = `${ARBORIST_YOUTUBE_URL}?hl=en&gl=US`;
export const ARBORIST_YOUTUBE_FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${ARBORIST_CHANNEL_ID}`;
export const ARBORIST_FORUM_URL = "https://forum.zcashcommunity.com/c/ecosystem-updates/foundation/21";
export const encodeArboristPath = (path: string) => path.split("/").map(encodeURIComponent).join("/");
export const arboristBlobUrl = (path: string) => `${ARBORIST_REPO_URL}/blob/main/${encodeArboristPath(path)}`;
export const arboristRawUrl = (path: string) => `${ARBORIST_RAW_BASE}${encodeArboristPath(path)}`;

export async function arboristResponseText(response: Response, maxBytes: number, media: RegExp): Promise<string> {
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > maxBytes ||
      !media.test(response.headers.get("content-type") ?? "")) {
    await response.body?.cancel().catch(() => {}); throw new Error("ARBORIST_SOURCE_UNAVAILABLE");
  }
  const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "", bytes = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes) throw new Error("ARBORIST_RESPONSE_TOO_LARGE");
      text += decoder.decode(part.value, { stream: true });
    }
    return text + decoder.decode();
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
