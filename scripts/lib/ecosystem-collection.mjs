// Pure collection boundaries shared by the collector and offline regression tests.
export async function collectPublicPages(fetchPage, pageSize = 100) {
  const items = [];
  let pages = 0;
  for (let page = 1; ; page++) {
    const rows = await fetchPage(page);
    if (!Array.isArray(rows)) throw new Error("Invalid owner listing");
    pages++;
    items.push(...rows.filter(row => row.private === false));
    if (rows.length < pageSize) return { items, pages };
  }
}

export async function collectReleasePages(first, fetchAfter) {
  const items = [];
  const cursors = new Set();
  let connection = first;
  for (;;) {
    if (!Array.isArray(connection?.nodes) || !connection.pageInfo)
      throw new Error("Incomplete release listing");
    items.push(...connection.nodes.filter(release => release?.publishedAt));
    if (!connection.pageInfo.hasNextPage) return items;
    const cursor = connection.pageInfo.endCursor;
    if (!cursor || cursors.has(cursor)) throw new Error("Release pagination did not advance");
    cursors.add(cursor);
    connection = await fetchAfter(cursor);
  }
}

export function canPublishSnapshot(snapshot) {
  return snapshot.repositories.length > 0 && snapshot.owners.every(owner => owner.complete);
}
