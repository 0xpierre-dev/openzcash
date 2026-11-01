// @vitest-environment node
import { ARCHIVE_CHECK_MAX_AGE_MS, archiveChainEvidenceSchema, archiveVerificationInstructions, buildArchiveProof } from "@/lib/archive/proof";
import { archiveProofFixture } from "@/tests/helpers/archive-proof";
import { archiveBatchMemo, buildArchiveMerkleTree } from "@/lib/archive/merkle";

describe("public archive proof and downloadable receipts", () => {
  it("binds a batch receipt to this exact manifest and rejects an altered inclusion path", () => {
    const f = archiveProofFixture();
    const tree = buildArchiveMerkleTree([f.revision.manifestHash, "f".repeat(64), "e".repeat(64)]);
    f.anchor.commitment = tree.proofs[f.revision.manifestHash];
    f.anchor.memo = f.evidence.memo = archiveBatchMemo(tree.root, tree.leafCount, "mainnet");
    expect(buildArchiveProof(f.revision, f.anchor, f.now).receipt?.merkleProof).toEqual(f.anchor.commitment);
    expect(archiveVerificationInstructions(f.revision, f.anchor)).toContain("--receipt zcg-example-r1-verification.json");
    f.anchor.commitment = { ...tree.proofs[f.revision.manifestHash], root: "0".repeat(64) };
    expect(buildArchiveProof(f.revision, f.anchor, f.now).receipt).toBeNull();
  });
  it("keeps preserved files separate from unsent and unbroadcast transactions", () => {
    const { revision, anchor, now } = archiveProofFixture();
    expect(buildArchiveProof(revision, undefined, now)).toMatchObject({ label: "Not anchored", verified: false, receipt: null });
    anchor.checks = [];
    for (const state of ["PREPARED", "SUBMITTING", "SUBMITTED", "UNKNOWN", "FAILED", "UNBROADCAST", "BROADCAST"]) {
      expect(buildArchiveProof(revision, { ...anchor, state }, now)).toMatchObject({ verified: false, evidence: null, receipt: null });
    }
    expect(buildArchiveProof(revision, { ...anchor, state: "UNKNOWN" }, now).label).toBe("Submission needs review");
  });
  it("exports a bound historical observation without RPC settings or private fields", () => {
    const { revision, anchor, evidence, now } = archiveProofFixture();
    anchor.checks[0].evidence = { ...evidence, rpcPassword: "must-not-leak", reader: { url: "http://private.invalid" } };
    const proof = buildArchiveProof(revision, anchor, now);
    expect(proof).toMatchObject({ verified: true, label: "Verified at last check", receipt: { status: "VERIFIED_AT_CHECK", manifestHash: revision.manifestHash } });
    expect(JSON.stringify(proof.receipt)).not.toContain("must-not-leak");
    expect(JSON.stringify(proof.receipt)).not.toContain("private.invalid");
  });
  it("expires the current badge but retains the dated receipt for independent checking", () => {
    const { revision, anchor, now } = archiveProofFixture();
    const proof = buildArchiveProof(revision, anchor, now + ARCHIVE_CHECK_MAX_AGE_MS);
    expect(proof).toMatchObject({ label: "Check required", verified: false, receipt: { status: "VERIFIED_AT_CHECK" } });
  });
  it("never revives an older green check after the latest observation failed", () => {
    const { revision, anchor, now } = archiveProofFixture();
    anchor.checks.unshift({ status: "UNVERIFIED", evidence: { reason: "ORPHANED" }, createdAt: new Date(now) });
    expect(buildArchiveProof(revision, anchor, now)).toMatchObject({ verified: false, evidence: null, receipt: null });
  });
  it.each(["wrong-revision", "wrong-network", "wrong-recipient", "wrong-txid", "too-few-confirmations", "weak-policy", "wrong-height", "future-check", "future-receipt", "wrong-memo", "unsafe-key"])("refuses %s evidence", mode => {
    const { revision, anchor, evidence, now } = archiveProofFixture();
    if (mode === "wrong-revision") revision.manifest.revision = 2;
    if (mode === "wrong-network") evidence.network = "testnet";
    if (mode === "wrong-recipient") evidence.receiver = "zs1" + "p".repeat(70);
    if (mode === "wrong-txid") anchor.txids = ["f".repeat(64)];
    if (mode === "too-few-confirmations") { evidence.confirmations = 2; evidence.tipHeight = 101; }
    if (mode === "weak-policy") evidence.requiredConfirmations = 1;
    if (mode === "wrong-height") evidence.blockHeight++;
    if (mode === "future-check") evidence.checkedAt = new Date(now + 1000).toISOString();
    if (mode === "future-receipt") anchor.checks[0].createdAt = new Date(now + 1000);
    if (mode === "wrong-memo") anchor.memo = "another-publication";
    if (mode === "unsafe-key") evidence.publicViewingKey += "'; unwanted-command";
    expect(buildArchiveProof(revision, anchor, now)).toMatchObject({ verified: false, receipt: null });
  });
  it("labels an incomplete confirmation policy without upgrading it to verified", () => {
    const { revision, anchor, evidence, now } = archiveProofFixture();
    evidence.confirmations = 2; evidence.tipHeight = 101; anchor.checks[0].status = "CONFIRMING";
    expect(buildArchiveProof(revision, anchor, now)).toMatchObject({ label: "Confirming", verified: false, receipt: { status: "CONFIRMING_AT_CHECK" } });
  });
  it("provides runnable file-only instructions before a transaction exists", () => {
    const { revision } = archiveProofFixture();
    const instructions = archiveVerificationInstructions(revision);
    expect(instructions).toContain(`node archive-verify.mjs zcg-example-r1.zvoice.json --hash ${revision.manifestHash}`);
    expect(instructions).toContain("No validated chain receipt");
    expect(instructions).not.toContain("--txid");
  });
  it("preserves an Ironwood action receipt and explains the pre-imported UFVK prerequisite", () => {
    const f = archiveProofFixture();
    const evidence = { ...f.evidence, pool: "ironwood", outputIndex: 4, receiver: "u1" + "q".repeat(100), publicViewingKey: "uview1" + "q".repeat(150), receiverIndex: 0 };
    f.anchor.receiver = evidence.receiver;
    f.anchor.checks[0].evidence = { ...evidence, rpcPassword: "must-not-leak" };
    const result = buildArchiveProof(f.revision, f.anchor, f.now);
    expect(result).toMatchObject({ verified: true, receipt: { evidence: { pool: "ironwood", outputIndex: 4, receiverIndex: 0 } } });
    expect(JSON.stringify(result.receipt)).not.toContain("must-not-leak");
    const instructions = archiveVerificationInstructions(f.revision, f.anchor);
    expect(instructions).toContain("export ARCHIVE_POOL='ironwood'");
    expect(instructions).toContain("cannot import a UFVK through z_importviewingkey");
    expect(instructions).toContain("Never import a seed or spending key");
    expect(instructions).toContain("outputIndex is the Ironwood action index");
  });
  it.each(["sapling-address", "sapling-key", "wrong-network-key", "missing-index", "unsafe-key", "unknown-pool"])("rejects Ironwood %s in downloadable evidence", mode => {
    const f = archiveProofFixture();
    const evidence = { ...f.evidence, pool: "ironwood", receiver: "u1" + "q".repeat(100), publicViewingKey: "uview1" + "q".repeat(150), receiverIndex: 0 as number | undefined };
    if (mode === "sapling-address") evidence.receiver = f.evidence.receiver;
    if (mode === "sapling-key") evidence.publicViewingKey = f.evidence.publicViewingKey;
    if (mode === "wrong-network-key") evidence.publicViewingKey = "uviewtest1" + "q".repeat(150);
    if (mode === "missing-index") evidence.receiverIndex = undefined;
    if (mode === "unsafe-key") evidence.publicViewingKey += "'; unsafe-command";
    if (mode === "unknown-pool") evidence.pool = "orchard";
    expect(archiveChainEvidenceSchema.safeParse(evidence).success).toBe(false);
    f.anchor.receiver = evidence.receiver;
    f.anchor.checks[0].evidence = evidence;
    expect(buildArchiveProof(f.revision, f.anchor, f.now)).toMatchObject({ verified: false, receipt: null });
  });
});
