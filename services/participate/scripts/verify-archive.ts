import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { MAX_PACKAGE_BYTES, verifyArchivePackage } from "../lib/archive/format";
import { archiveCommitmentMemo, verifyArchiveMerkleProof } from "../lib/archive/merkle";
import { recoverArchiveFiles } from "../lib/archive/recover";
import { createArchiveObserver, readArchiveChainConfig, ArchiveChainError } from "../lib/archive/chain";

/** Bundled as public/verify/archive-verify.mjs; needs Node 22+, no app or database. */
async function main() {
  const { values, positionals } = parseArgs({ options: { hash: { type: "string" }, txid: { type: "string" }, receipt: { type: "string" }, extract: { type: "string" } }, allowPositionals: true });
  const expectedHash = values.hash;
  if (positionals.length !== 1 || !expectedHash || !/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error("Invalid arguments");
  const bytes = await readFile(positionals[0]);
  if (bytes.length > MAX_PACKAGE_BYTES) throw new Error("Package too large");
  const checked = await verifyArchivePackage(JSON.parse(bytes.toString("utf8")), expectedHash);
  let chain = null, merkleProof, receipt;
  if (values.receipt) {
    const data = await readFile(values.receipt);
    if (data.length > 32000) throw new Error("Receipt too large");
    receipt = JSON.parse(data.toString("utf8"));
    if (receipt.schema !== "ZVOICE_ARCHIVE_RECEIPT_V1" || receipt.manifestHash !== expectedHash || receipt.recordId !== checked.manifest.recordId || receipt.revision !== checked.manifest.revision) throw new Error("Receipt mismatch");
    if (receipt.merkleProof) merkleProof = verifyArchiveMerkleProof(expectedHash, receipt.merkleProof);
  }
  if (values.txid) {
    const config = readArchiveChainConfig();
    const memo = archiveCommitmentMemo(checked.manifest, expectedHash, config.network, merkleProof);
    if (receipt && (receipt.evidence.txid !== values.txid || receipt.evidence.memo !== memo || receipt.evidence.network !== config.network || receipt.evidence.pool !== (config.pool ?? "sapling") || receipt.evidence.receiver !== config.receiver || receipt.evidence.publicViewingKey !== config.publicViewingKey)) throw new Error("Receipt and reader mismatch");
    chain = await createArchiveObserver()(config, values.txid, memo);
  }
  const recovered = values.extract ? await recoverArchiveFiles(checked.bundle, expectedHash, values.extract) : null;
  console.log(JSON.stringify({ verifier: "ZVOICE_ARCHIVE_VERIFIER_V1", recordId: checked.manifest.recordId, revision: checked.manifest.revision, manifestHash: expectedHash,
    fileStatus: "MATCHED", batchStatus: merkleProof ? "INCLUSION_PATH_MATCHED" : "NOT_CHECKED", recovered,
    chainStatus: !chain ? "NOT_CHECKED" : chain.confirmations >= chain.requiredConfirmations ? "VERIFIED" : "CONFIRMING", evidence: chain }, null, 2));
}
main().catch(error => { console.error(error instanceof ArchiveChainError ? error.code : "Verification failed: invalid input, altered package, mismatched receipt or existing recovery directory. Use PACKAGE --hash SHA256 [--receipt FILE] [--txid TXID] [--extract NEW_DIRECTORY]."); process.exitCode = 1; });
