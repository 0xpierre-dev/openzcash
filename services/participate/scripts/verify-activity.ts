import { verifyDecisionReceipt } from "../lib/decisions/verify";
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { verifyActivityBundle } from "../lib/archive/activity";
import { validateActivityChainReceipt } from "../lib/archive/activity-proof";
import { ArchiveChainError, createArchiveObserver, type ArchiveChainConfig } from "../lib/archive/chain";

/** Bundled into a standalone download: no application, database or spending keys. */
async function main() {
  const { values, positionals } = parseArgs({ options: { hash: { type: "string" }, chain: { type: "boolean" }, "extract-comment": { type: "string" } }, allowPositionals: true });
  if (positionals.length !== 1 || !values.hash) throw new Error("Arguments");
  const bytes = await readFile(positionals[0]);
  if (bytes.length > 8_100_000) throw new Error("Receipt too large");
  const { event, bundle } = await verifyActivityBundle(JSON.parse(bytes.toString("utf8")), values.hash);
  const review = bundle.reviewReceipt ? await verifyDecisionReceipt(JSON.parse(bundle.reviewReceipt)) : null;
  const receipt = bundle.chain && bundle.inclusion ? validateActivityChainReceipt(bundle.chain, bundle.inclusion) : null;
  if (bundle.chain && !receipt) throw new Error("Chain receipt without inclusion");
  let observed = null;
  if (values.chain) {
    if (!receipt || !bundle.inclusion) throw new Error("No validated chain receipt yet");
    const e = receipt.evidence;
    const rpc = (prefix: string) => {
      const url = process.env[`${prefix}_RPC_URL`];
      if (!url) throw new Error("Set your own reader and node RPC endpoints");
      return { url, user: process.env[`${prefix}_RPC_USER`], password: process.env[`${prefix}_RPC_PASSWORD`] };
    };
    const config: ArchiveChainConfig = { network: e.network, pool: e.pool, receiver: e.receiver, receiverIndex: e.receiverIndex,
      publicViewingKey: e.publicViewingKey, birthdayHeight: e.birthdayHeight, walletVersion: e.readerVersion,
      requiredConfirmations: e.requiredConfirmations, reader: rpc("ARCHIVE_READER"), chain: rpc("ARCHIVE_CHAIN") };
    observed = await createArchiveObserver()(config, e.txid, bundle.inclusion.memo);
  }
  if (values["extract-comment"]) {
    if (bundle.body === null) throw new Error("Comment text is unavailable or this event is not a comment");
    await writeFile(values["extract-comment"], bundle.body, { flag: "wx", mode: 0o600 });
  }
  console.log(JSON.stringify({ verifier: "PARTICIPATE_ACTIVITY_VERIFIER_V1", eventId: event.id, eventHash: values.hash,
    eventStatus: "MATCHED", commentStatus: event.kind !== "COMMENT_POSTED" && event.kind !== "COMMENT_EDITED" ? "NOT_APPLICABLE" : bundle.body === null ? "WITHHELD_OR_UNAVAILABLE" : "MATCHED",
    reviewStatus: review ? "SIGNATURES_AND_TALLY_VERIFIED" : "NOT_APPLICABLE",
    closureStatus: event.kind === "DISCUSSION_CLOSED" ? bundle.closure ? "MATCHED" : "UNAVAILABLE" : "NOT_APPLICABLE",
    batchStatus: bundle.inclusion ? "INCLUSION_PATH_MATCHED" : "NOT_BATCHED",
    chainStatus: !observed ? "NOT_CHECKED" : observed.confirmations >= observed.requiredConfirmations ? "VERIFIED" : "CONFIRMING",
    evidence: observed }, null, 2));
}
main().catch(error => { console.error(error instanceof ArchiveChainError ? error.code : "Verification failed. Use RECEIPT.json --hash SHA256 [--chain] [--extract-comment NEW_FILE]. A chain check needs a bound receipt and your own ARCHIVE_READER_RPC_URL and ARCHIVE_CHAIN_RPC_URL."); process.exitCode = 1; });
