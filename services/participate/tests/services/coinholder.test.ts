// @vitest-environment node
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createCoinholderReader } from "@/lib/services/coinholder";
import { COINHOLDER_SUMMARY_SHA256, COINHOLDER_SUMMARY_URLS } from "@/lib/domain/coinholder";
import { COINHOLDER_REVEALS_SHA256 } from "@/lib/domain/coinholder-reveals";
import provenance from "@/data/coinholder/q3-2026-provenance.json";

const body = readFileSync(new URL("../../data/coinholder/q3-2026-summary.json", import.meta.url));
const START = Date.parse("2026-10-09T04:00:00.000Z");

describe("read-only Coinholder source reader", () => {
  it("keeps bundled historical source bytes traceable to their recorded hashes", () => {
    const metadata = readFileSync(new URL("../../data/coinholder/q3-2026-metadata.json", import.meta.url));
    expect(createHash("sha256").update(body).digest("hex")).toBe(provenance.summarySha256);
    expect(provenance.summarySha256).toBe(COINHOLDER_SUMMARY_SHA256);
    expect(body.byteLength).toBe(provenance.summaryBytes);
    expect(createHash("sha256").update(metadata).digest("hex")).toBe(provenance.metadataSha256);
    expect(metadata.byteLength).toBe(provenance.metadataBytes);
  });

  it("matches exact historical source bytes, coalesces calls and refreshes after 60 seconds", async () => {
    let clock = START;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(body));
    const read = createCoinholderReader({ fetcher, now: () => clock });
    const [first, second] = await Promise.all([read(), read()]);
    expect(first).toBe(second);
    expect(first.source).toMatchObject({ state: "verified", sha256: COINHOLDER_SUMMARY_SHA256, checkedAt: new Date(START).toISOString() });
    expect(first.activity).toMatchObject({ complete: true, totals: { transactions: 3548, castMessages: 32598 } });
    expect(first.activity?.transactions).toHaveLength(3548);
    expect(first.activity?.recentTransactions).toHaveLength(50);
    expect(first.activity?.transactions?.some((record) => record.messages)).toBe(false);
    expect(first.revealHistory).toMatchObject({ unit: "revealed shares", complete: true, sha256: COINHOLDER_REVEALS_SHA256, fetchedAt: "2026-10-09T05:06:55Z" });
    expect(first.revealHistory?.days).toHaveLength(13);
    expect(first.revealHistory?.proposals).toHaveLength(37);
    expect(first.revealHistory?.days[12].cumulativeTotal).toBe(145620);
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetcher.mock.calls) {
      expect(COINHOLDER_SUMMARY_URLS).toContain(url);
      expect(init).toMatchObject({ redirect: "error", cache: "no-store" });
      expect(init?.method).toBeUndefined();
    }
    expect((await read()).revealHistory).toBe(first.revealHistory);
    expect(fetcher).toHaveBeenCalledTimes(2);
    clock += 60_001;
    const refreshed = await read();
    expect(refreshed.revealHistory).toBe(first.revealHistory);
    expect(refreshed.revealHistory?.fetchedAt).toBe("2026-10-09T05:06:55Z");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("uses a dated real snapshot on outage without marking it freshly matched", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("private provider detail"));
    const value = await createCoinholderReader({ fetcher, now: () => START })();
    expect(value.source).toMatchObject({ state: "snapshot", checkedAt: new Date(START).toISOString(), snapshotFetchedAt: "2026-10-09T03:57:32.369Z" });
    expect(value.summary.proposalCount).toBe(37);
    expect(value.revealHistory).toMatchObject({ sha256: COINHOLDER_REVEALS_SHA256, fetchedAt: "2026-10-09T05:06:55Z" });
    expect(value.revealHistory?.days[12].cumulativeTotal).toBe(145620);
    expect(JSON.stringify(value)).not.toContain("private provider detail");
  });

  it("keeps the previous source date after a failed later refresh", async () => {
    let clock = START;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(body));
    const read = createCoinholderReader({ fetcher, now: () => clock });
    const initial = await read();
    clock += 60_001;
    fetcher.mockRejectedValue(new Error("offline"));
    const stale = await read();
    expect(stale.source.state).toBe("snapshot");
    expect(stale.source.snapshotFetchedAt).toBe(initial.source.snapshotFetchedAt);
    expect(stale.source.checkedAt).not.toBe(initial.source.checkedAt);
    expect(stale.revealHistory).toBe(initial.revealHistory);
    expect(stale.revealHistory?.fetchedAt).toBe("2026-10-09T05:06:55Z");
  });

  it("rejects oversized or altered responses and never trusts returned JSON metadata", async () => {
    const huge = vi.fn<typeof fetch>().mockImplementation(async () => new Response("x".repeat(256_001)));
    expect((await createCoinholderReader({ fetcher: huge, now: () => START })()).source.state).toBe("snapshot");
    const changed = vi.fn<typeof fetch>().mockImplementation(async () => new Response('{"status":3}'));
    expect((await createCoinholderReader({ fetcher: changed, now: () => START })()).source.state).toBe("snapshot");
  });

  it("can match the other official mirror when one endpoint fails", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (url === COINHOLDER_SUMMARY_URLS[0]) throw new Error("offline");
      return new Response(body);
    });
    const value = await createCoinholderReader({ fetcher, now: () => START })();
    expect(value.source).toMatchObject({ state: "verified", url: COINHOLDER_SUMMARY_URLS[1] });
  });

  it("stops both hanging source requests at the shared six-second deadline", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }));
      const result = createCoinholderReader({ fetcher, now: () => START })();
      await vi.advanceTimersByTimeAsync(6_001);
      expect((await result).source.state).toBe("snapshot");
      expect(fetcher.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
