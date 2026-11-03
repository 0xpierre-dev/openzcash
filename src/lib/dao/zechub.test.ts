import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const fetchMock = vi.fn<typeof fetch>();
const at = "2026-11-02T21:00:00.000Z";
const item = (id = 189, createdAt?: string) => ({
  id, ...(createdAt ? { createdAt } : {}),
  proposal: {
    title: `Proposal ${id}`, status: "executed", proposer: "juno1proposer",
    description: "A public proposal", votes: { yes: "14", no: "0", abstain: "0" },
  },
});
const json = (body: unknown) => Response.json(body);
const outage = () => new Response("error code: 1016", { status: 530 });
const load = () => import("./zechub");

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(at);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("ZecHub governance availability", () => {
  it("restores proposals and canonical links from Juno when the indexer returns 530", async () => {
    fetchMock.mockResolvedValueOnce(outage()).mockResolvedValueOnce(json({ data: { proposals: [item()] } }));
    const { getZechubGovernance, ZECHUB_DAO_URL } = await load();
    const feed = await getZechubGovernance();
    expect(feed).toMatchObject({ status: "live", source: "chain", fetchedAt: at });
    expect(feed.proposals[0]).toMatchObject({
      id: 189, ref: "A189", title: "Proposal 189", status: "executed", yes: 14,
      createdAt: "", url: `${ZECHUB_DAO_URL}/proposals/A189`,
    });
    const url = new URL(String(fetchMock.mock.calls[1][0]));
    expect(url.origin).toBe("https://rest.cosmos.directory");
    expect(JSON.parse(Buffer.from(decodeURIComponent(url.pathname.split("/").at(-1)!), "base64").toString())).toEqual({ reverse_proposals: { limit: 50 } });
  });

  it("shares a full cache across consumers requesting different limits", async () => {
    fetchMock.mockResolvedValueOnce(json(Array.from({ length: 50 }, (_, i) => item(i + 140, at))));
    const { getZechubProposals, getZechubGovernance } = await load();
    expect(await getZechubProposals(12)).toHaveLength(12);
    const feed = await getZechubGovernance(40);
    expect(feed.proposals).toHaveLength(40);
    expect(feed.proposals[0].id).toBe(189);
    expect((await getZechubGovernance(500)).proposals).toHaveLength(50);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("limit=50");
  });

  it.each([
    { name: "empty result", body: [] },
    { name: "invalid votes", body: [{ ...item(), proposal: { ...item().proposal, votes: { yes: "bad", no: "0", abstain: "0" } } }] },
    { name: "duplicate IDs", body: [item(), item()] },
  ])(
    "checks the contract when the indexer returns $name", async ({ body }) => {
      fetchMock.mockResolvedValueOnce(json(body)).mockResolvedValueOnce(json({ data: { proposals: [item()] } }));
      expect(await (await load()).getZechubGovernance()).toMatchObject({ source: "chain", status: "live" });
    },
  );

  it("keeps cold failures unavailable across retries, without creating a zero snapshot", async () => {
    fetchMock.mockImplementation(async () => outage());
    const { getZechubGovernance } = await load();
    const expected = { proposals: [], status: "unavailable", source: null, fetchedAt: null };
    expect(await getZechubGovernance()).toEqual(expected);
    expect(await getZechubGovernance()).toEqual(expected);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.parse(at) + 60_001);
    expect(await getZechubGovernance()).toEqual(expected);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("retains known records with the original reading date during outages and recovers", async () => {
    fetchMock.mockResolvedValueOnce(json([item(189, at)]));
    const { getZechubGovernance } = await load();
    const first = await getZechubGovernance();
    vi.setSystemTime(Date.parse(at) + 600_001);
    fetchMock.mockResolvedValueOnce(outage()).mockRejectedValueOnce(new Error("Juno offline"));
    expect(await getZechubGovernance()).toEqual({ ...first, status: "stale" });
    expect(await getZechubGovernance()).toEqual({ ...first, status: "stale" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.setSystemTime(Date.parse(at) + 660_002);
    fetchMock.mockResolvedValueOnce(outage()).mockResolvedValueOnce(json({ data: { proposals: [item(190), item(189)] } }));
    const recovered = await getZechubGovernance();
    expect(recovered).toMatchObject({ status: "live", source: "chain", fetchedAt: new Date().toISOString() });
    expect(recovered.proposals.map((p) => p.createdAt)).toEqual(["", at]);
  });

  it("coalesces simultaneous refreshes instead of presenting expired data as live", async () => {
    fetchMock.mockResolvedValueOnce(json([item()]));
    const { getZechubGovernance } = await load();
    await getZechubGovernance();
    vi.setSystemTime(Date.parse(at) + 600_001);
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; }));
    const one = getZechubGovernance(12);
    const two = getZechubGovernance(40);
    resolve(json([item(190)]));
    expect((await one).proposals[0].id).toBe(190);
    expect((await two).proposals[0].id).toBe(190);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
