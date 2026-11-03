import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ZecUsdQuote } from "@/lib/pricing/live-price";
import type { ZechubGovernance } from "@/lib/dao/zechub";

const state = vi.hoisted(() => ({ quote: null as ZecUsdQuote | null, governance: { proposals: [], status: "unavailable", fetchedAt: null, source: null } as ZechubGovernance }));
vi.mock("@/lib/dao/zechub", () => ({ getZechubGovernance: async () => state.governance, ZECHUB_DAO_URL: "https://daodao.zone/dao/zechub" }));
vi.mock("@/lib/zcg/changelog", () => ({ listChangelog: async () => [] }));
vi.mock("@/lib/pricing/live-price", () => ({ currentZecUsdQuote: async () => state.quote }));
vi.mock("@/lib/zechub/treasury-repo", () => ({
  treasuryAllocations: async () => [], treasuryPayouts: async () => [], treasurySeries: async () => [],
  latestTreasurySnapshot: async () => ({
    id: "snapshot", capturedOn: "2026-08-05", zecPriceCents: 52100n,
    donationsZat: 41478000000n, donationsUsdCents: 21610038n,
    fpfZat: 4500000000n, fpfUsdCents: 2344500n,
    incZat: 5435400000n, incUsdCents: 2831843n,
    fpfUnreservedZat: 2874000000n, fpfReservedUsdCents: 847000n,
  }),
}));
import Page from "./page";

beforeEach(() => {
  state.governance = { proposals: [], status: "unavailable", fetchedAt: null, source: null };
  state.quote = {
    cents: 113274, source: "CoinGecko", sourceUrl: "https://api.coingecko.com/",
    quotedAt: "2026-09-10T21:21:30Z", fetchedAt: "2026-09-10T21:23:08Z", stale: false,
  };
});

describe("ZecHub treasury page", () => {
  it("does not render unavailable governance totals as zero", async () => {
    const html = renderToStaticMarkup(await Page()).split('id="governance"')[1];
    expect(html).toContain("Proposal data is temporarily unavailable");
    expect(html).toContain("—");
    expect(html).not.toMatch(/>0<\/span>/);
  });
  it("renders contract proposals with their direct links and no invented creation date", async () => {
    state.governance = {
      source: "chain", status: "live", fetchedAt: "2026-11-02T21:00:00.000Z",
      proposals: [{ id: 189, ref: "A189", title: "Public proposal", createdAt: "", status: "executed", yes: 14, no: 0, abstain: 0, proposer: "juno1proposer", description: "", url: "https://daodao.zone/dao/zechub/proposals/A189" }],
    };
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain('href="https://daodao.zone/dao/zechub/proposals/A189"');
    expect(html).toContain("Juno · direct contract data");
    expect(html).toContain("2026-11-02 21:00");
    expect(html).not.toContain("Invalid Date");
    state.governance.status = "stale";
    const stale = renderToStaticMarkup(await Page());
    expect(stale).toContain("Open at last check");
    expect(stale).toContain("Delayed · last available reading");
  });
  it("renders the indicative value with both dates and keeps availability at the source price", async () => {
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("$582,380.15");
    expect(html).toContain("$1,132.74");
    expect(html).toContain("Indicative USD value of recorded ZEC");
    expect(html).toContain("2026-08-05");
    expect(html).toContain("2026-09-10 21:21 UTC");
    expect(html).toContain("Available in source snapshot");
    expect(html).toContain("$15K");
    expect(html).toContain("at source price");
    expect(html).toContain("do not establish");
  });
  it("visibly identifies a stale quote", async () => {
    state.quote!.stale = true;
    expect(renderToStaticMarkup(await Page())).toContain("CoinGecko · stale quote · 2026-09-10 21:21 UTC");
  });
  it("visibly identifies sheet pricing when no market quote exists", async () => {
    state.quote = null;
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("$267,863.81");
    expect(html).toContain("spreadsheet price · Aug 5, 2026");
    expect(html).not.toContain("Indicative USD value of recorded ZEC");
  });
});
