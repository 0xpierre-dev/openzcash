import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const woff = () =>
  new Response(new Uint8Array([0x77, 0x4f, 0x46, 0x46]), { status: 200 });

async function freshLoader() {
  vi.resetModules();
  return import("./card-assets");
}

describe("loadCardAssets", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads the Geist wordmark, Inter text weights and the brand mark", async () => {
    fetchMock.mockImplementation(async () => woff());
    const { loadCardAssets, CARD_FONTS } = await freshLoader();
    const assets = await loadCardAssets(0);
    expect(assets.complete).toBe(true);
    expect(assets.fonts?.map((f) => [f.name, f.weight])).toEqual([
      [CARD_FONTS.wordmark, 500],
      [CARD_FONTS.text, 400],
      [CARD_FONTS.text, 500],
    ]);
    expect(
      fetchMock.mock.calls.every(([url]) =>
        String(url).startsWith("https://cdn.jsdelivr.net/npm/@fontsource/"),
      ),
    ).toBe(true);
    expect(assets.mark?.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("fetches once per process", async () => {
    fetchMock.mockImplementation(async () => woff());
    const { loadCardAssets } = await freshLoader();
    await loadCardAssets(0);
    await loadCardAssets(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("falls back to next/og's font when the CDN fails, and retries later", async () => {
    fetchMock.mockImplementation(async () => new Response("", { status: 503 }));
    const { loadCardAssets } = await freshLoader();
    const first = await loadCardAssets(0);
    expect(first.fonts).toBeUndefined();
    expect(first.complete).toBe(false);

    fetchMock.mockClear();
    await loadCardAssets(60_000);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockImplementation(async () => woff());
    const later = await loadCardAssets(11 * 60_000);
    expect(later.complete).toBe(true);
  });
});
