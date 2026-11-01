import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { db } from "../lib/db";
import { readPilotPackages } from "../lib/archive/catalog";
import { readArchiveChainConfig, ArchiveChainError } from "../lib/archive/chain";
import { publishArchiveRevision } from "../lib/services/proposal-archives";
import { prepareArchiveAnchor, submitArchiveAnchor, refreshArchiveOperation, checkArchiveAnchor } from "../lib/services/archive-anchors";

async function main() {
  const [command, target, hash] = process.argv.slice(2);
  if (command === "import" && target) {
    for (const item of await readPilotPackages()) {
      const row = await publishArchiveRevision(target, item.bundle, item.manifestHash, hash);
      console.log(JSON.stringify({ revisionId: row.id, recordId: item.manifest.recordId, manifestHash: row.manifestHash, state: "FILES_PUBLISHED" }));
    }
    return;
  }
  if (command === "export" && target) {
    await mkdir(resolve(target), { recursive: true });
    for (const item of await readPilotPackages()) await writeFile(resolve(target, `${item.manifest.recordId}-r${item.manifest.revision}.zvoice.json`), JSON.stringify(item.bundle) + "\n", { flag: "wx" });
    console.log("Exported five summary packages; no transactions sent."); return;
  }
  if (!["prepare", "submit", "refresh", "check"].includes(command) || !target) throw new Error("USAGE");
  const config = readArchiveChainConfig();
  const row = command === "prepare" ? await prepareArchiveAnchor(target, config) : command === "submit" ? await submitArchiveAnchor(target, hash, config)
    : command === "refresh" ? await refreshArchiveOperation(target, config) : await checkArchiveAnchor(target, config);
  console.log(JSON.stringify(row, null, 2));
}
main().catch(error => { console.error(error instanceof ArchiveChainError ? error.code : "Archive command failed. Check configuration, revision identity and database migrations. Commands: import COMMUNITY_ID [COMMITTEE_ID]; export DIRECTORY; prepare REVISION_ID; submit ANCHOR_ID EXPECTED_HASH; refresh ANCHOR_ID; check ANCHOR_ID."); process.exitCode = 1; }).finally(() => db.$disconnect());
