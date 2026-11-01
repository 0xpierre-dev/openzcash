import { readArchiveSshConfig } from "./archive-ssh-config";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db } from "../lib/db";
import { verifyActivityBundle } from "../lib/archive/activity";
import { buildArchiveMerkleTree } from "../lib/archive/merkle";
import { ArchiveChainError, type ArchiveChainConfig } from "../lib/archive/chain";
import { checkActivityBatch } from "../lib/services/activity-anchors";

// Read-only wallet observer for this local pilot. No credentials leave the node.
async function main() {
  const [directory, txid, socket] = process.argv.slice(2);
  if (!directory || !txid) throw new Error("USAGE");
  const ssh = readArchiveSshConfig(process.env, socket);
  const path = resolve(directory);
  const batch = JSON.parse(await readFile(resolve(path, "batch.json"), "utf8"));
  const publicReader = JSON.parse(await readFile(resolve(path, "public-reader.json"), "utf8"));
  if (batch.schema !== "PARTICIPATE_ACTIVITY_BATCH_V1") throw new Error("INVALID_BATCH");
  for (const receipt of batch.events) await verifyActivityBundle(receipt, receipt.eventHash);
  const tree = buildArchiveMerkleTree(batch.events.map((receipt: { eventHash: string }) => receipt.eventHash));
  if (tree.root !== batch.root || tree.leafCount !== batch.leafCount) throw new Error("INVALID_INVENTORY");
  const current = await db.archiveActivityBatch.findUniqueOrThrow({ where: { id: batch.id } });
  if (current.root !== batch.root || current.memo !== batch.memo || current.receiver !== batch.receiver) throw new Error("BATCH_CHANGED");
  const config: ArchiveChainConfig = { ...publicReader, reader: { url: "http://127.0.0.1:28244" }, chain: { url: "http://127.0.0.1:8232" } };
  const bridge = await readFile(ssh.bridgePath, "utf8");
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  const fetcher: typeof fetch = async (input, init) => {
    const port = Number(new URL(String(input)).port);
    const body = JSON.parse(String(init?.body));
    const output = execFileSync("ssh", ["-S", ssh.socket, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", ssh.host, "python3 -c " + quote(bridge)],
      { input: JSON.stringify({ port, body }), encoding: "utf8", timeout: 20000, maxBuffer: 4 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
    return new Response(output);
  };
  const result = await checkActivityBatch(batch.id, txid, config, fetcher);
  await writeFile(resolve(path, "latest-chain-check.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ count: result.count, txid, blockHeight: result.evidence.blockHeight, blockTime: result.evidence.blockTime,
    confirmations: result.evidence.confirmations, requiredConfirmations: result.evidence.requiredConfirmations }));
}
main().catch(error => { console.error(error instanceof ArchiveChainError ? error.code : "Activity check failed. Check the frozen export, operator connection and public reader."); process.exitCode = 1; }).finally(() => db.$disconnect());
