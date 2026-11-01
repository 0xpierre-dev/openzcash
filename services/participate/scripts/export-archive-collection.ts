import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db } from "../lib/db";
import { archiveMemo, canonicalJson, verifyArchivePackage, sha256, utf8 } from "../lib/archive/format";

/** A frozen, recoverable operator export. Never signs or contacts a wallet. */
async function main() {
  const [communityId, directory, recordId, extra] = process.argv.slice(2);
  if (!communityId || !directory) throw new Error("USAGE");
  if (extra || recordId && !/^[a-z0-9][a-z0-9-]{0,95}$/.test(recordId)) throw new Error("INVALID_RECORD");
  const archives = await db.proposalArchive.findMany({ where: { communityId, ...(recordId ? { recordId } : {}) }, orderBy: { recordId: "asc" },
    include: { revisions: { orderBy: { revision: "desc" }, take: 1 } } });
  if (!archives.length) throw new Error("NO_RECORDS");
  const records = await Promise.all(archives.map(async archive => {
    const row = archive.revisions[0];
    if (!row) throw new Error("MISSING_REVISION");
    const checked = await verifyArchivePackage(JSON.parse(row.packageJson), row.manifestHash);
    return { revisionId: row.id, recordId: checked.manifest.recordId, revision: row.revision, manifestHash: row.manifestHash,
      filename: `${checked.manifest.recordId}-r${row.revision}.zvoice.json`,
      memo: archiveMemo(checked.manifest, row.manifestHash, "mainnet"), packageJson: row.packageJson };
  }));
  const collection = { schema: "PARTICIPATE_ARCHIVE_COLLECTION_V1", communityId, network: "mainnet", records: records.map(({ packageJson: _, ...record }) => record) };
  const bytes = canonicalJson(collection);
  const target = resolve(directory);
  await mkdir(target); // An existing directory must never be overwritten.
  for (const record of records) await writeFile(resolve(target, record.filename), record.packageJson, { flag: "wx" });
  await writeFile(resolve(target, "collection.json"), bytes, { flag: "wx" });
  await copyFile(resolve("public/verify/archive-verify.mjs"), resolve(target, "archive-verify.mjs"));
  await copyFile(resolve("public/verify/ZOD-LICENSE.txt"), resolve(target, "ZOD-LICENSE.txt"));
  console.log(JSON.stringify({ directory: target, count: records.length, collectionHash: await sha256(utf8(bytes)), state: "FILES_EXPORTED" }));
}
main().catch(() => { console.error("Export failed. Use COMMUNITY_ID NEW_DIRECTORY [RECORD_ID]; the destination must not exist."); process.exitCode = 1; }).finally(() => db.$disconnect());
