import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const RAW = readFileSync(
  join(process.cwd(), "src/lib/coinholder/fixtures/q3-2026-vote-summary.json"),
);
const Q3 = "2cba66eb16c7581a1692cb0b033785da0131059f645a0d2fb4dc2a5131505e01";
const HASH = "9b858326b8149de92ea6788314a714b521fb2f57215e3742ec9b35b67c6639b5";
const VALAR = `https://prod.vote-chain-primary.valargroup.org/shielded-vote/v1/vote-summary/${Q3}`;
const ZF = `https://zvote.zfnd.org/shielded-vote/v1/vote-summary/${Q3}`;
const start = new Date("2026-09-30T22:36:19Z");

const fetchMock = vi.fn();
const ok = (body: string = RAW.toString("utf8")) =>
  new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(start);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchVoteSummary", () => {
  it("reads the finalized summary from Valar first, with the SHA-256 of the raw body and the host that answered", async () => {
    fetchMock.mockResolvedValue(ok());
    const { fetchVoteSummary } = await import("./vote-chain");
    const r = await fetchVoteSummary(Q3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r).toMatchObject({
      sha256: HASH,
      url: VALAR,
      bytes: RAW.byteLength,
      fetchedAt: start.toISOString(),
    });
    expect(r.host.id).toBe("valar");
    expect(r.summary.proposals).toHaveLength(37);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(VALAR);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("falls back to the Zcash Foundation mirror when Valar errors, times out or answers something else", async () => {
    const other = JSON.parse(RAW.toString("utf8"));
    other.vote_round_id = Buffer.alloc(32, 7).toString("base64");
    for (const failure of [
      () => Promise.resolve(new Response("down", { status: 503 })),
      () =>
        Promise.reject(
          new DOMException(
            "The operation was aborted due to timeout",
            "TimeoutError",
          ),
        ),
      () => Promise.resolve(ok("{not json")),
      () => Promise.resolve(ok(JSON.stringify({ proposals: [] }))),
      () => Promise.resolve(ok(JSON.stringify(other))),
    ]) {
      vi.resetModules();
      fetchMock.mockReset();
      fetchMock.mockImplementationOnce(failure).mockResolvedValueOnce(ok());
      const { fetchVoteSummary } = await import("./vote-chain");
      const r = await fetchVoteSummary(Q3);
      expect(r.ok).toBe(true);
      if (r.ok) expect([r.host.id, r.url]).toEqual(["zf", ZF]);
    }
  });

  it("never throws: when both servers fail it says which it tried", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const { fetchVoteSummary } = await import("./vote-chain");
    const r = await fetchVoteSummary(Q3);
    expect(r).toMatchObject({
      ok: false,
      tried: [VALAR, ZF],
      checkedAt: start.toISOString(),
    });
    if (!r.ok)
      expect(r.error).toMatch(
        /Valar Group: offline; Zcash Foundation mirror: offline/,
      );
  });

  it("asks the mirror too when Valar has not answered within 1.5 seconds, and takes the first good answer", async () => {
    let valarSignal: AbortSignal | undefined;
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (url === ZF) return Promise.resolve(ok());
      valarSignal = init.signal ?? undefined;
      return new Promise<Response>(() => {});
    });
    const { fetchVoteSummary } = await import("./vote-chain");
    const result = fetchVoteSummary(Q3);
    await vi.advanceTimersByTimeAsync(1_499);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const r = await result;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.ok && r.host.id).toBe("zf");
    // The request left hanging is cancelled.
    expect(valarSignal?.aborted).toBe(true);
  });

  it("gives up on both servers after five seconds in all, not five seconds each", async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          ),
        ),
    );
    const { fetchVoteSummary } = await import("./vote-chain");
    let settled = false;
    const result = fetchVoteSummary(Q3).then((r) => {
      settled = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const r = await result;
    expect(r.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    if (!r.ok) expect(r.error).toMatch(/Valar Group: .*Zcash Foundation mirror: /);
  });

  it("refuses a round id that is not 32 bytes of hex without asking anyone", async () => {
    const { fetchVoteSummary } = await import("./vote-chain");
    expect(await fetchVoteSummary("../../etc")).toMatchObject({
      ok: false,
      tried: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps a good copy for an hour, shares one request between callers, and retries a failure after five minutes", async () => {
    let release: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((resolve) => (release = resolve)),
    );
    const { fetchVoteSummary } = await import("./vote-chain");
    const both = Promise.all([fetchVoteSummary(Q3), fetchVoteSummary(Q3)]);
    release(ok());
    const [a, b] = await both;
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(start.getTime() + 59 * 60_000));
    await fetchVoteSummary(Q3);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // After an hour it asks again; a failed refresh keeps serving the last good copy, dated when it was fetched.
    vi.setSystemTime(new Date(start.getTime() + 61 * 60_000));
    fetchMock.mockRejectedValue(new Error("offline"));
    const stale = await fetchVoteSummary(Q3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(stale).toMatchObject({ ok: true, fetchedAt: start.toISOString() });
  });

  it("does not ask again for five minutes after both servers failed", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const { fetchVoteSummary } = await import("./vote-chain");
    await fetchVoteSummary(Q3);
    vi.setSystemTime(new Date(start.getTime() + 4 * 60_000));
    expect((await fetchVoteSummary(Q3)).ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.setSystemTime(new Date(start.getTime() + 6 * 60_000));
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(ok());
    expect((await fetchVoteSummary(Q3)).ok).toBe(true);
  });
});
