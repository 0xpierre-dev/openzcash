import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { communitiesContext, walletsContext } from "./directory";
import { compactData } from "./data";
import { safeSourceUrl } from "./sources";
import { HARDWARE, SOFTWARE } from "@/app/wallets/catalog-data";
import { COMMUNITIES } from "@/lib/communities/data";

describe("Wallet catalog lookup", () => {
  it("filters by shielded level and platform while keeping the whole inventory listed", () => {
    const ios = walletsContext("Which wallets support shielded ZEC on iOS?");
    expect(ios.filter).toMatchObject({
      platform: "iOS",
      shielded: "full",
      kind: null,
    });
    expect(
      ios.wallets.every(
        (w) => w.platforms.includes("iOS") && w.shielded === "full",
      ),
    ).toBe(true);
    expect(ios.wallets.map((w) => w.name)).toEqual(
      expect.arrayContaining(["Zodl", "Zingo!"]),
    );
    expect(ios.allWallets.split(", ")).toHaveLength(SOFTWARE.length + HARDWARE.length);
    expect(ios).toMatchObject({
      catalogRevisedOn: "2026-09-17",
      totalWallets: 18,
      hardwareWallets: 3,
    });
    const transparent = walletsContext("quais carteiras são só transparentes?");
    expect(transparent.wallets.map((w) => w.name).sort()).toEqual([
      "Gem Wallet",
      "Trezor",
    ]);
    expect(
      walletsContext("hardware wallets").wallets.map((w) => w.name),
    ).toEqual(["Keystone", "Ledger", "Trezor"]);
  });
  it("finds a wallet by name and reports an absent one as not catalogued rather than inventing it", () => {
    const zingo = walletsContext("Does Zingo have a desktop version?");
    expect(zingo.filter.names).toEqual(["Zingo!"]);
    expect(zingo.wallets).toHaveLength(1);
    expect(zingo.wallets[0]).toMatchObject({
      maker: "Zingo Labs",
      platforms: expect.stringContaining("Desktop"),
      site: "https://zingolabs.org/zingo/",
      sourceCode: "https://github.com/zingolabs",
    });
    const unknown = walletsContext("Is FooCoin Wallet safe?");
    expect(unknown.filter.names).toEqual([]);
    expect(unknown.matched).toBe(18);
    expect(unknown.note).toContain("not nonexistent");
  });
  it("cites only links the allowlist renders, and fits the default serialized budget with a filter", () => {
    for (const w of [...SOFTWARE, ...HARDWARE])
      for (const link of [w.url, w.source, w.audit])
        if (link) expect(safeSourceUrl(link), link).toBe(new URL(link).href);
    const shown = compactData(
      walletsContext("android shielded"),
      "android shielded",
      5000,
      24,
    );
    expect(
      (shown.data as { wallets: { shown: unknown[] } }).wallets.shown.length,
    ).toBeGreaterThanOrEqual(6);
  });
});

describe("Community directory lookup", () => {
  it("routes country, region and Portuguese names to the right groups", () => {
    expect(communitiesContext("Zcash Brasil").communities[0]).toMatchObject({
      name: "Zcash Brazil",
      country: "Brazil",
      language: "Portuguese",
      zcgFunded: true,
      zcgLedgerRecipient: "Zcash Brazil",
      lastPaidDate: "2026-08-03",
      site: "https://zcashbrasil.com.br",
    });
    expect(
      communitiesContext(
        "Is there a Zcash community in Nigeria?",
      ).communities.map((c) => c.name),
    ).toEqual(["Zcash Nigeria"]);
    expect(
      communitiesContext("comunidades na África").communities.map(
        (c) => c.region,
      ),
    ).toEqual(expect.arrayContaining(["Africa"]));
    expect(
      communitiesContext("comunidades na África").communities.every(
        (c) => c.region === "Africa" || /africa/i.test(c.country),
      ),
    ).toBe(true);
    expect(
      communitiesContext("Spanish-speaking communities").communities.every(
        (c) => /Spanish/.test(c.language),
      ),
    ).toBe(true);
  });
  it("lists every community by region even when filtered, with the verification date and funding semantics", () => {
    const all = communitiesContext("");
    expect(all).toMatchObject({
      verifiedOn: "2026-09-20",
      totalCommunities: COMMUNITIES.length,
      matched: COMMUNITIES.length,
    });
    expect(Object.values(all.allCommunitiesByRegion).flatMap((s) => s.split(", "))).toHaveLength(COMMUNITIES.length);
    const funded = communitiesContext("which communities are funded by ZCG?");
    expect(funded.filter.fundedOnly).toBe(true);
    expect(funded.communities.every((c) => c.zcgFunded)).toBe(true);
    expect(all.note).toContain("budgeted USD");
    expect(all.communities[0].forumTopics[0].url).toMatch(
      /^https:\/\/forum\.zcashcommunity\.com\/t\/\d+$/,
    );
    expect(communitiesContext("Zcash Atlantis").matched).toBe(0);
  });
  it("keeps the region inventory and the matched row within the serialized budget", () => {
    const shown = compactData(
      communitiesContext("Zcash Brasil"),
      "zcash brasil",
      5000,
      10,
    ).data as {
      allCommunitiesByRegion: Record<string, string>;
      communities: { shown: { name: string }[] };
    };
    expect(shown.communities.shown[0].name).toBe("Zcash Brazil");
    expect(shown.allCommunitiesByRegion["Latin America"]).toContain(
      "Zcash Brazil",
    );
  });
});
