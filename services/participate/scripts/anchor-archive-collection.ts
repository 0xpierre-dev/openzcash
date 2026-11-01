import { readArchiveSshConfig } from "./archive-ssh-config";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db } from "../lib/db";
import { canonicalJson, sha256, utf8, verifyArchivePackage } from "../lib/archive/format";
import { archiveBatchMemo } from "../lib/archive/merkle";
import { prepareArchiveBatch, checkExternalArchiveBatch } from "../lib/services/archive-anchors";
import { ArchiveChainError, type ArchiveChainConfig } from "../lib/archive/chain";

// Pilot operator tool; no signing capability. Secrets stay on the remote node.
async function main() {
  const [command, directory, txid] = process.argv.slice(2);
  if (!["prepare", "check"].includes(command) || !directory) throw new Error("USAGE");
  const ssh = command === "check" ? readArchiveSshConfig(process.env) : null;
  const path = resolve(directory);
  const collection = JSON.parse(await readFile(resolve(path, "collection.json"), "utf8"));
  const reader = JSON.parse(await readFile(resolve(path, "public-reader.json"), "utf8"));
  const config: ArchiveChainConfig = { ...reader, reader: { url: "http://127.0.0.1:28244" }, chain: { url: "http://127.0.0.1:8232" } };
  for (const record of collection.records) {
    if (!/^[a-z0-9-]+-r\d+\.zvoice\.json$/.test(record.filename)) throw new Error("INVALID_FILE");
    await verifyArchivePackage(JSON.parse(await readFile(resolve(path, record.filename), "utf8")), record.manifestHash);
    const row = await db.archiveRevision.findUniqueOrThrow({ where: { id: record.revisionId } });
    if (row.manifestHash !== record.manifestHash) throw new Error("REVISION_CHANGED");
  }
  const batch = await prepareArchiveBatch(collection.records.map((row: { revisionId: string }) => row.revisionId), config);
  if (command === "prepare") {
    const payload = { schema: "PARTICIPATE_ANCHOR_BATCH_V1", network: config.network, root: batch.root, leafCount: batch.leafCount,
      memo: archiveBatchMemo(batch.root, batch.leafCount, config.network), receiver: config.receiver,
      collectionHash: await sha256(utf8(canonicalJson(collection))), records: collection.records.map((row: { manifestHash: string }) => ({ ...row, merkleProof: batch.proofs[row.manifestHash] })) };
    await writeFile(resolve(path, "batch.json"), canonicalJson(payload), { flag: "wx" });
    console.log(JSON.stringify({ count: batch.leafCount, root: batch.root, memo: payload.memo, state: "PREPARED" })); return;
  }
  if (!ssh) throw new Error("ARCHIVE_SSH_NOT_CONFIGURED");
  const bridge = await readFile(ssh.bridgePath, "utf8");
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  const fetcher: typeof fetch = async (input, init) => {
    const port = Number(new URL(String(input)).port);
    const body = JSON.parse(String(init?.body));
    const output = execFileSync("ssh", ["-S", ssh.socket, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", ssh.host, "python3 -c " + quote(bridge)],
      { input: JSON.stringify({ port, body }), encoding: "utf8", timeout: 20000, maxBuffer: 4 * 1024 * 1024 });
    return new Response(output);
  };
  const result = await checkExternalArchiveBatch(batch.anchors.map(anchor => anchor.id), txid, config, fetcher);
  await writeFile(resolve(path, "latest-chain-check.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ count: result.count, txid, blockHeight: result.evidence.blockHeight, blockTime: result.evidence.blockTime,
    confirmations: result.evidence.confirmations, requiredConfirmations: result.evidence.requiredConfirmations }));
}
main().catch(error => { console.error(error instanceof ArchiveChainError ? error.code : "Archive collection operation failed. Check the frozen export, configuration and reader."); process.exitCode = 1; }).finally(() => db.$disconnect());
