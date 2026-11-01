import { archiveMemo } from "@/lib/archive/format";
import type { ArchiveProofAnchor } from "@/lib/archive/proof";

export function archiveProofFixture() {
  const now = Date.parse("2026-10-10T03:00:00.000Z");
  const revision = { manifest: { recordId: "zcg-example", revision: 1 }, manifestHash: "a".repeat(64) };
  const memo = archiveMemo(revision.manifest, revision.manifestHash, "mainnet");
  const evidence = {
    version: "ZVOICE_CHAIN_CHECK_V1", network: "mainnet", txid: "b".repeat(64), pool: "sapling", outputIndex: 0,
    receiver: "zs1" + "q".repeat(70), memo, blockHash: "c".repeat(64), blockHeight: 100,
    blockTime: "2026-10-10T02:40:00.000Z", confirmations: 11, requiredConfirmations: 10,
    tipHash: "d".repeat(64), tipHeight: 110, checkedAt: "2026-10-10T02:59:58.000Z",
    readerVersion: "0.1.0-beta.3", publicViewingKey: "zxviews1" + "q".repeat(100), birthdayHeight: 90
  };
  const anchor: ArchiveProofAnchor = { network: "mainnet", memo, receiver: evidence.receiver, state: "BROADCAST", txids: [evidence.txid],
    checks: [{ status: "VERIFIED", evidence, createdAt: new Date(now - 1000) }] };
  return { now, revision, evidence, anchor };
}
