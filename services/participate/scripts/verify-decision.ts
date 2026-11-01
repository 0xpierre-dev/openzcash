import { readFile, stat } from "node:fs/promises";
import { parseArgs } from "node:util";
import { digestSchema } from "../lib/archive/format";
import { decisionReceiptSchema, verifyDecisionReceipt } from "../lib/decisions/verify";

async function main() {
  const { values, positionals } = parseArgs({ options: { hash: { type: "string" }, "round-hash": { type: "string" } }, allowPositionals: true });
  if (positionals.length !== 1 || !values["round-hash"]) throw new Error("Usage: node decision-verify.mjs receipt.json --round-hash EXPECTED_ROUND_HASH [--hash EXPECTED_RECEIPT_HASH]");
  const expectedRoundHash = digestSchema.parse(values["round-hash"]);
  if ((await stat(positionals[0])).size > 20 * 1024 * 1024) throw new Error("Receipt too large");
  const receipt = decisionReceiptSchema.parse(JSON.parse(await readFile(positionals[0], "utf8")));
  if (receipt.roundHash !== expectedRoundHash) throw new Error("Round does not match the independently saved fingerprint");
  const result = await verifyDecisionReceipt(receipt, values.hash);
  process.stdout.write(JSON.stringify({ ...result, expectedReceiptChecked: Boolean(values.hash),
    limitations: "Checks included signatures against the declared roster. Does not establish official membership, complete ballot inventory, trusted time or a Zcash anchor." }, null, 2) + "\n");
}
main().catch(error => { process.stderr.write(`Verification failed: ${error instanceof Error ? error.message : "Invalid receipt"}\n`); process.exitCode = 1; });
