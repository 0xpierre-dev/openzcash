import { test } from "node:test";
import assert from "node:assert/strict";
import { FORUM_TOPIC, daysBetween, describeUrl, extractUrls, parseStamp, releaseDrift, stampFreshness } from "./crosslink-sources.mjs";

test("parseStamp accepts only real dates in the guide's exact format", () => {
  const date = parseStamp("2 Nov 2026");
  assert.equal(date?.toISOString(), "2026-11-02T00:00:00.000Z");
  assert.equal(parseStamp("17 Oct 2026")?.getUTCDate(), 17);
  // Malformed or absent stamps must fail, never be guessed into validity.
  assert.equal(parseStamp("Nov 2 2026"), null);
  assert.equal(parseStamp("2 November 2026"), null);
  assert.equal(parseStamp("31 Feb 2026"), null); // rejected by the day round-trip
  assert.equal(parseStamp(""), null);
  assert.equal(parseStamp(undefined), null);
});

test("stampFreshness flags stale and future stamps", () => {
  const now = new Date("2026-11-02T12:00:00.000Z");
  assert.equal(stampFreshness("2 Nov 2026", now).ok, true);
  assert.equal(stampFreshness("28 Oct 2026", now).ok, true); // exactly the 14-day limit
  assert.equal(stampFreshness("18 Oct 2026", now).ok, false); // one day past the limit
  assert.match(stampFreshness("18 Oct 2026", now).reason, /re-verify/);
  assert.equal(stampFreshness("3 Nov 2026", now).ok, false); // future stamp
  assert.equal(stampFreshness("not a stamp", now).ok, false);
  assert.equal(daysBetween(new Date("2026-10-19T00:00:00Z"), new Date("2026-11-02T00:00:00Z")), 14);
});

test("releaseDrift compares the pinned tag against upstream's latest", () => {
  assert.equal(releaseDrift("v16", "v16").ok, true);
  const drift = releaseDrift("v15", "v16");
  assert.equal(drift.ok, false);
  assert.match(drift.reason, /update releaseTag/);
  // Malformed inputs are failures, not matches.
  assert.equal(releaseDrift("", "v16").ok, false);
  assert.equal(releaseDrift("v16", null).ok, false);
  assert.equal(releaseDrift("w16", "v16").ok, false);
});

test("extractUrls resolves forum template literals and reports file:line provenance", () => {
  const sources = [
    {
      file: "crosslink-history.ts",
      text: 'const forum = "https://forum.zcashcommunity.com/t/crosslink-incentivized-feature-net/55210";\nexport const history = [{ source: `${forum}/49` }, { source: "https://github.com/ShieldedLabs/crosslink_monolith/releases/tag/v16" }];',
    },
    {
      file: "community-tools.ts",
      text: 'export const tools = [{ href: "https://ctaz.cash/", source: `${forum}/117` }];',
    },
  ];
  const urls = extractUrls(sources);
  const byUrl = new Map(urls.map((item) => [item.url, item.references]));
  assert.deepEqual([...byUrl.keys()].sort(), [
    "https://ctaz.cash/",
    FORUM_TOPIC,
    `${FORUM_TOPIC}/117`,
    `${FORUM_TOPIC}/49`,
    "https://github.com/ShieldedLabs/crosslink_monolith/releases/tag/v16",
  ]);
  assert.ok(byUrl.get(`${FORUM_TOPIC}/49`).some((ref) => ref.startsWith("crosslink-history.ts:line")));
  // The same URL in two files keeps both provenance references.
  assert.equal(byUrl.get(`${FORUM_TOPIC}/117`).length, 1);
});

test("extractUrls deduplicates repeats within one file and strips trailing punctuation", () => {
  const urls = extractUrls([{ file: "guide.tsx", text: 'const a = "https://example.com/a", b = "https://example.com/a.";' }]);
  assert.deepEqual(urls.map((item) => item.url), ["https://example.com/a"]);
  assert.deepEqual(extractUrls([{ file: "empty.ts", text: "no links here" }]), []);
});

test("describeUrl names the host and forum post number", () => {
  assert.equal(describeUrl(FORUM_TOPIC), "forum.zcashcommunity.com · topic root");
  assert.equal(describeUrl(`${FORUM_TOPIC}/117`), "forum.zcashcommunity.com · post 117");
  assert.equal(describeUrl("https://ctaz.cash/"), "ctaz.cash");
});
