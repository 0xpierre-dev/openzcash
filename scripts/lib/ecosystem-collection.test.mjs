import { test } from "node:test";
import assert from "node:assert/strict";
import { collectPublicPages, collectReleasePages, canPublishSnapshot } from "./ecosystem-collection.mjs";

test("enumerates beyond the first owner page and verifies the trailing page", async () => {
  const calls = [];
  const result = await collectPublicPages(async page => {
    calls.push(page);
    return page <= 2 ? Array.from({ length: 100 }, (_, index) => ({ private: false, id: page * 100 + index })) : [];
  });
  assert.equal(result.items.length, 200);
  assert.equal(result.pages, 3);
  assert.deepEqual(calls, [1, 2, 3]);
});
test("retains only explicitly public results but paginates by raw response size", async () => {
  const result = await collectPublicPages(async page => page === 1
    ? [{ private: true }, { private: false }] : page === 2 ? [{ private: false }, { id: "unknown visibility" }] : [], 2);
  assert.equal(result.items.length, 2);
  assert.equal(result.pages, 3);
});
test("a failed page cannot be mistaken for an empty complete inventory", async () => {
  await assert.rejects(collectPublicPages(async page => {
    if (page === 2) throw new Error("unavailable");
    return [{ private: false }];
  }, 1), /unavailable/);
  await assert.rejects(collectPublicPages(async () => ({ message: "rate limited" })), /Invalid owner/);
});
test("release collection follows all creation-ordered pages even after old publications", async () => {
  const old = { publishedAt: "2020-01-01" };
  const recent = { publishedAt: "2026-09-08" };
  const releases = await collectReleasePages({ nodes: [old], pageInfo: { hasNextPage: true, endCursor: "a" } },
    async cursor => {
      assert.equal(cursor, "a");
      return { nodes: [recent, { publishedAt: null }], pageInfo: { hasNextPage: false } };
    });
  assert.deepEqual(releases, [old, recent]);
});
test("missing or repeated release cursors fail closed", async () => {
  const connection = { nodes: [], pageInfo: { hasNextPage: true, endCursor: "a" } };
  await assert.rejects(collectReleasePages(connection, async () => connection), /did not advance/);
  await assert.rejects(collectReleasePages(connection, async () => null), /Incomplete release/);
});
test("failed owner scans and empty snapshots preserve the previous artifact", () => {
  assert.equal(canPublishSnapshot({ repositories: [], owners: [] }), false);
  assert.equal(canPublishSnapshot({ repositories: [1], owners: [{ complete: false }] }), false);
  assert.equal(canPublishSnapshot({ repositories: [1], owners: [{ complete: true }] }), true);
});
