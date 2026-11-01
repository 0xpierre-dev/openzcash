import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db } from "../lib/db";
import { canonicalJson } from "../lib/archive/format";
import { ArchiveChainError, readArchiveChainConfig } from "../lib/archive/chain";
import { backfillArchiveActivity } from "../lib/services/archive-activity";
import { checkActivityBatch, exportActivityBatch, prepareActivityBatch } from "../lib/services/activity-anchors";

// Operator-only. No public mutation endpoint and no signing capability.
async function main() {
  const [command, target, value] = process.argv.slice(2);
  if (!target) throw new Error("Missing target");
  if (command === "backfill") { console.log(JSON.stringify({ events: await backfillArchiveActivity(target) })); return; }
  if (command === "prepare") {
    const batch = await prepareActivityBatch(target, readArchiveChainConfig());
    console.log(JSON.stringify(batch ? { id: batch.id, count: batch.leafCount, memo: batch.memo, state: "PREPARED" } : { state: "EMPTY" })); return;
  }
  if (command === "check" && value) {
    const result = await checkActivityBatch(target, value, readArchiveChainConfig());
    console.log(JSON.stringify(result)); return;
  }
  if (command === "export" && value) {
    const batch = await exportActivityBatch(target);
    const directory = resolve(value);
    await mkdir(directory, { recursive: false, mode: 0o700 });
    await writeFile(resolve(directory, "batch.json"), canonicalJson(batch), { flag: "wx" });
    for (const receipt of batch.events) await writeFile(resolve(directory, `activity-${JSON.parse(receipt.event).id}.json`), canonicalJson(receipt), { flag: "wx" });
    console.log(JSON.stringify({ count: batch.leafCount, root: batch.root, directory })); return;
  }
  throw new Error("Usage");
}
main().catch(error => { console.error(error instanceof ArchiveChainError ? error.code : "Activity operation failed. Use backfill COMMUNITY, prepare COMMUNITY, export BATCH NEW_DIRECTORY, or check BATCH TXID. Preparation never sends funds."); process.exitCode = 1; }).finally(() => db.$disconnect());
