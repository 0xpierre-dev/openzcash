import { describe, expect, it } from "vitest";
import { CITATION_DOMAINS, SEARCH_DOMAINS, safeSourceUrl } from "./sources";
import { HARDWARE, SOFTWARE } from "@/app/wallets/catalog-data";
import { COMMUNITIES } from "@/lib/communities/data";
import { COINHOLDER_ROUND, ROUND_PROPOSALS } from "@/lib/zcg/coinholder-round";
import record from "@/data/governance/record.json";

const urls = (value: unknown): string[] => typeof value === "string" ? (/^https:\/\//.test(value) ? [value] : []) : Array.isArray(value) ? value.flatMap(urls) : value && typeof value === "object" ? Object.values(value).flatMap(urls) : [];
describe("Citation allowlist follows the site's own sources", () => {
  it.each([
    "https://github.com/ZcashCommunityGrants/arboretum-notes/blob/main/AllArboristCallNotes/Arborist%20Call%20131.md",
    "https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/340",
    "https://github.com/Financial-Privacy-Foundation/ZcashCoinholderGrantsProgram/issues/9",
    "https://github.com/Electric-Coin-Company/zashi-android", "https://github.com/zcash/zips/blob/main/zips/zip-0317.rst",
    "https://www.youtube.com/watch?v=abc123def", "https://youtu.be/abc123def", "https://www.youtube.com/@zcashfoundation/videos",
    "https://forum.zcashcommunity.com/t/arborist-call/1", "https://zechub.wiki/", "https://z.cash/learn/", "https://zcashinfo.com/pools/", "https://zecstats.com/chart/hashrate",
    "https://api.shieldedscan.xyz/v1/supply", "https://api.shieldedscan.xyz/v1/analytics/monthly?from=1788220800&to=1790812799", "https://api.zecblock.com/v1/network/blockchain-info",
    "https://zcashcommunitygrants.org/", "https://cipherscan.app/block/2726400", "https://vote.heliosvoting.org/helios/elections/x/view", "https://siv.org/election/1",
  ])("keeps a previously de-linked legitimate source: %s", (url) => expect(safeSourceUrl(url)).toBe(new URL(url).href));
  it("keeps every wallet site, source repository and audit report in the catalog", () => {
    for (const w of [...SOFTWARE, ...HARDWARE]) for (const link of [w.url, w.source, w.audit]) if (link) expect(safeSourceUrl(link), link).toBe(new URL(link).href);
  });
  it("keeps every community site, substack and forum topic, while social profiles stay page links", () => {
    for (const c of COMMUNITIES) {
      for (const link of [c.links.site, c.links.substack]) if (link && !/linktr\.ee/.test(link)) expect(safeSourceUrl(link), link).toBe(new URL(link).href);
      for (const topic of c.forumTopics) expect(safeSourceUrl(`https://forum.zcashcommunity.com/t/${topic.id}`)).toBeTruthy();
    }
    for (const url of ["https://x.com/zcashbrazil", "https://t.me/brzcash", "https://www.instagram.com/zcashbrazil/", "https://discord.gg/zcash"]) expect(safeSourceUrl(url)).toBeNull();
  });
  it("keeps the coinholder round's application links and the governance record's tallies", () => {
    for (const url of urls([COINHOLDER_ROUND, ROUND_PROPOSALS]).filter((u) => !u.startsWith("https://docs.google.com/"))) expect(safeSourceUrl(url), url).toBe(new URL(url).href);
    for (const url of urls(record).filter((u) => !u.startsWith("https://docs.google.com/"))) expect(safeSourceUrl(url), url).toBe(new URL(url).href);
  });
  it.each([
    "https://api.shieldedscan.xyz.evil.org/v1/supply", "https://api.zecblock.com@evil.org/", "http://api.shieldedscan.xyz/v1/supply",
    "javascript:alert(1)", "http://zodl.com/", "https://zodl.com.evil.org/", "https://evil.org/zodl.com", "https://user@zodl.com/", "https://zodl.com:8443/",
    "https://github.com/attacker/fake", "https://github.com/zcashcommunitygrants-fake/x", "https://github.com/", "https://docs.google.com/spreadsheets/d/anything",
    "https://x.com/anyone/status/1", "https://medium.com/@anyone", "https://example.com/zcash", "https://youtube.com.evil.org/watch", "https://substack.com/@anyone", "https://anyone.substack.com/",
  ])("still drops junk, lookalikes and open platforms: %s", (url) => expect(safeSourceUrl(url)).toBeNull());
  it("keeps the hosted-search domains inside the citation domains", () => {
    for (const domain of SEARCH_DOMAINS) expect(CITATION_DOMAINS).toContain(domain);
  });
});
