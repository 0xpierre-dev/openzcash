import { z } from "zod/v3";
import { archiveNetworkSchema, digestSchema, type ArchiveManifest } from "@/lib/participate/workspace/archive/format";
import { archiveCommitmentMemo, verifyArchiveMerkleProof, type ArchiveMerkleProof } from "@/lib/participate/workspace/archive/merkle";

const height = z.number().int().min(0).max(2_147_483_646);
// Explicit public fields only. RPC configuration and operator credentials never
// belong in a downloadable receipt, even if extra fields reach the database.
export const archiveChainEvidenceSchema = z.object({
  version: z.literal("ZVOICE_CHAIN_CHECK_V1"), network: archiveNetworkSchema,
  txid: digestSchema, pool: z.literal("sapling"), outputIndex: height,
  receiver: z.string().min(40).max(256).regex(/^(?:zs1|ztestsapling1)[a-z0-9]+$/), memo: z.string().max(512),
  blockHash: digestSchema, blockHeight: height, blockTime: z.string().datetime(),
  confirmations: z.number().int().positive(), requiredConfirmations: z.number().int().min(1).max(1000),
  tipHash: digestSchema, tipHeight: height, checkedAt: z.string().datetime(),
  readerVersion: z.string().max(100).regex(/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)*$/),
  publicViewingKey: z.string().min(40).max(512).regex(/^zxview[a-z0-9]+$/), birthdayHeight: height,
  receiverIndex: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional()
});

export type ArchiveProofAnchor = {
  network: "mainnet" | "testnet" | "regtest"; memo: string; receiver: string; state: string; txids: string[];
  commitment?: unknown;
  checks: { status: string; evidence: unknown; createdAt: Date }[];
};
type RevisionIdentity = { manifest: Pick<ArchiveManifest, "recordId" | "revision">; manifestHash: string };
export const ARCHIVE_CHECK_MAX_AGE_MS = 15 * 60_000;

export function selectArchiveAnchor(anchors: ArchiveProofAnchor[]) {
  return anchors.find(anchor => anchor.network === "mainnet") ?? anchors[0];
}

export function buildArchiveProof(revision: RevisionIdentity, anchor?: ArchiveProofAnchor, now = Date.now()) {
  const empty = (label: string, detail: string) => ({ label, detail, verified: false, evidence: null, receipt: null });
  if (!anchor) return empty("Not anchored", "Files are ready. No transaction has been submitted.");
  if (anchor.network === "regtest") return empty("Unsupported network", "Local regression transactions are not public chain evidence.");
  const check = anchor.checks[0];
  if (!check) {
    const labels: Record<string, [string, string]> = {
      PREPARED: ["Ready to anchor", "The publication is prepared. No transaction has been sent."],
      SUBMITTING: ["Submission in progress", "The wallet outcome still needs confirmation."],
      SUBMITTED: ["Submitted to wallet", "Waiting for a transaction and its chain check."],
      UNKNOWN: ["Submission needs review", "The wallet outcome is unknown. An operator must reconcile it."],
      FAILED: ["Submission failed", "No chain inclusion has been verified."],
      UNBROADCAST: ["Not broadcast", "The wallet created a transaction without broadcasting it."],
      BROADCAST: ["Awaiting verification", "A transaction is available. Its memo and inclusion still need checking."]
    };
    const [label, detail] = labels[anchor.state] ?? ["Check required", "No chain inclusion has been verified."];
    return empty(label, detail);
  }
  if (!["VERIFIED", "CONFIRMING"].includes(check.status)) {
    return empty("Check required", "The latest check could not verify this publication.");
  }
  const parsed = archiveChainEvidenceSchema.safeParse(check.evidence);
  if (!parsed.success) return empty("Check required", "The stored evidence could not be validated.");
  const evidence = parsed.data;
  let expectedMemo: string, merkleProof: ArchiveMerkleProof | undefined;
  try {
    expectedMemo = archiveCommitmentMemo(revision.manifest, revision.manifestHash, anchor.network, anchor.commitment);
    if (anchor.commitment != null) merkleProof = verifyArchiveMerkleProof(revision.manifestHash, anchor.commitment);
  } catch { return empty("Check required", "The batch inclusion proof does not match this revision."); }
  const checkedAt = Date.parse(evidence.checkedAt);
  const meetsPolicy = evidence.confirmations >= evidence.requiredConfirmations;
  if (evidence.network !== anchor.network || evidence.receiver !== anchor.receiver || evidence.memo !== expectedMemo || anchor.memo !== expectedMemo
    || !anchor.txids.includes(evidence.txid) || evidence.blockHeight < evidence.birthdayHeight
    || evidence.confirmations !== evidence.tipHeight - evidence.blockHeight + 1
    || evidence.network === "mainnet" && evidence.requiredConfirmations < 10
    || (check.status === "VERIFIED") !== meetsPolicy || checkedAt > now || check.createdAt.getTime() > now
    || checkedAt > check.createdAt.getTime() || Date.parse(evidence.blockTime) > checkedAt + 120_000
    || !evidence.receiver.startsWith(evidence.network === "mainnet" ? "zs1" : "ztestsapling1") || !evidence.publicViewingKey.startsWith("zxview")) {
    return empty("Check required", "The stored evidence does not match this revision and its confirmation policy.");
  }
  const fresh = now - checkedAt < ARCHIVE_CHECK_MAX_AGE_MS;
  const receipt = {
    schema: "ZVOICE_ARCHIVE_RECEIPT_V1" as const,
    recordId: revision.manifest.recordId, revision: revision.manifest.revision, manifestHash: revision.manifestHash,
    status: meetsPolicy ? "VERIFIED_AT_CHECK" as const : "CONFIRMING_AT_CHECK" as const,
    evidence, ...(merkleProof ? { merkleProof } : {})
  };
  return {
    label: !fresh ? "Check required" : meetsPolicy ? "Verified at last check" : "Confirming",
    detail: !fresh ? "The saved check is over 15 minutes old. Verify again for the current chain state."
      : `${evidence.confirmations} / ${evidence.requiredConfirmations} confirmations · ${evidence.network === "mainnet" ? "Mainnet" : "Testnet"}`,
    verified: fresh && meetsPolicy, evidence, receipt
  };
}

export function archiveVerificationInstructions(revision: RevisionIdentity, anchor?: ArchiveProofAnchor) {
  const filename = `${revision.manifest.recordId}-r${revision.manifest.revision}.zvoice.json`;
  const proof = buildArchiveProof(revision, anchor);
  return `# Recover and verify this proposal record

Record: ${revision.manifest.recordId}
Revision: ${revision.manifest.revision}
Manifest SHA-256: ${revision.manifestHash}

## Check the files

Keep the complete .zvoice.json package and archive-verify.mjs together. With Node.js 22 or later:

\`\`\`sh
node archive-verify.mjs ${filename} --hash ${revision.manifestHash}
\`\`\`

FILE MATCHED checks exact manifest and file contents. It does not check the blockchain.
Compare this fingerprint with a separately trusted copy; a file and its own hash alone do not authenticate its publisher.

## Recover the files without this website

The package contains the preserved files, not just links. Extract a verified copy into a NEW directory:

\`\`\`sh
node archive-verify.mjs ${filename} --hash ${revision.manifestHash} --extract recovered-${revision.manifest.recordId}-r${revision.manifest.revision}
\`\`\`

Open files/proposal.md to read the preserved record. All included files and manifest.json are restored byte for byte. Existing directories are never overwritten. Keep a separate backup of the package, instructions, verifier, and chain receipt. The blockchain stores a commitment; it cannot recreate lost document bytes.

## Check the chain independently

${proof.evidence ? `The saved receipt is an application observation as of ${proof.evidence.checkedAt}, not a fresh independent proof. Use your own synchronized Zallet ${proof.evidence.readerVersion} view-only reader and validating node.

Public reader configuration:

\`\`\`sh
export ARCHIVE_NETWORK='${proof.evidence.network}'
export ARCHIVE_RECEIVER='${proof.evidence.receiver}'
${proof.evidence.receiverIndex !== undefined ? `export ARCHIVE_RECEIVER_INDEX='${proof.evidence.receiverIndex}'\n` : ""}\
export ARCHIVE_PUBLIC_VIEWING_KEY='${proof.evidence.publicViewingKey}'
export ARCHIVE_BIRTHDAY_HEIGHT='${proof.evidence.birthdayHeight}'
export ARCHIVE_ZALLET_VERSION='${proof.evidence.readerVersion}'
export ARCHIVE_CONFIRMATIONS='${proof.evidence.requiredConfirmations}'
\`\`\`

Set ARCHIVE_READER_RPC_URL and ARCHIVE_CHAIN_RPC_URL to your own endpoints. Set each endpoint's _RPC_USER and _RPC_PASSWORD privately if needed. Wallet HTTP must use loopback, such as an SSH tunnel. No RPC credentials are included here.

The verifier imports only the published viewing key with whenkeyisnew and checks the Sapling receiver, including its published derivation index when applicable. The reader must have decoded this transaction and scanned its block on the node's current canonical branch. Older balance-recovery work does not establish or invalidate a positive memo proof; no wallet balance is certified. A fresh reader may report READER_SYNCING until it can read the transaction. The verifier never signs or sends transactions.

\`\`\`sh
node archive-verify.mjs ${filename} --hash ${revision.manifestHash}${proof.receipt?.merkleProof ? ` --receipt ${revision.manifest.recordId}-r${revision.manifest.revision}-verification.json` : ""} --txid ${proof.evidence.txid}
\`\`\`

Chain status VERIFIED requires the exact memo, its receiving output, canonical block membership and the configured confirmation depth. CONFIRMING has not reached that depth. A failed check never establishes inclusion.` : "No validated chain receipt is available for this revision yet. The file check works now; chain verification requires a real transaction, the dedicated public viewing key and a synchronized reader."}

${proof.receipt?.merkleProof ? `This record is one of ${proof.receipt.merkleProof.leafCount} records committed by one Merkle root. The receipt carries the inclusion path. The verifier recomputes that path before checking the root in the exact Zcash memo.\n\n` : ""}The block timestamp is separate from an original decision or submission date. The manifest describes the preserved scope: a historical summary, a metadata snapshot, or a native author submission. External documents and attachments are included only when listed in its file inventory. An anchor does not prove an author's signature, committee endorsement or payment.
`;
}
