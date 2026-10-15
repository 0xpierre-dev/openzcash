import { expect, it } from "vitest";
import { claimLegalArchive, completeLegalArchive, emptyLegalArchive } from "./archive";
import { parsePgpArchive } from "./pgp-parser";
import { pgpArchive } from "./public-fixtures";
it("reconciles legacy PGPZ URLs as revisions without duplicate entries or lost history", () => {
  const [item] = parsePgpArchive(pgpArchive(), "2026-10-15");
  let row = completeLegalArchive(claimLegalArchive(emptyLegalArchive("pgp"), "2026-10-14", "2026-10-14T12:00:00Z", "old").value, "old", "2026-10-14T12:00:01Z", [item]);
  row.entries[0].item.url = item.url.replace("pgpz.org", "community.pgpz.org");
  row = completeLegalArchive(claimLegalArchive(row, "2026-10-15", "2026-10-15T12:00:00Z", "new").value, "new", "2026-10-15T12:00:01Z", [{ ...item, title: "Updated public title" }]);
  expect(row.entries).toHaveLength(1);
  expect(row.entries[0].item.url).toBe(item.url);
  expect(row.entries[0].revisions).toHaveLength(1);
  expect(row.entries[0].revisions[0].item.url).toContain("community.pgpz.org");
  expect(row.entries[0].firstSeenAt).toBe("2026-10-14T12:00:01Z");
});
