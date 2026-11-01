import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { archiveMemo, digestSchema, verifyArchivePackage } from "@/lib/archive/format";
import { ArchiveChainError, createArchiveObserver, createArchiveRpc, validateArchiveConfig, type ArchiveChainConfig } from "@/lib/archive/chain";
import { archiveCommitmentMemo, buildArchiveMerkleTree } from "@/lib/archive/merkle";

export async function prepareArchiveAnchor(revisionId: string, config: ArchiveChainConfig) {
  validateArchiveConfig(config);
  const revision = await db.archiveRevision.findUniqueOrThrow({ where: { id: revisionId } });
  const { manifest } = await verifyArchivePackage(JSON.parse(revision.packageJson), revision.manifestHash);
  const memo = archiveMemo(manifest, revision.manifestHash, config.network);
  const anchor = await db.archiveAnchor.upsert({ where: { revisionId_network: { revisionId, network: config.network } },
    create: { revisionId, network: config.network, memo, receiver: config.receiver }, update: {} });
  if (anchor.memo !== memo || anchor.receiver !== config.receiver) throw new ArchiveChainError("ANCHOR_CONFIGURATION_CHANGED");
  return anchor;
}

/** Application signing stays testnet-only; mainnet uses the separately reviewed operator process. */
export async function submitArchiveAnchor(id: string, expectedHash: string, config: ArchiveChainConfig, fetcher: typeof fetch = fetch) {
  validateArchiveConfig(config);
  if (config.network !== "testnet" || !config.writer || process.env.ARCHIVE_TESTNET_SIGNING_ENABLED !== "true") throw new ArchiveChainError("SIGNING_DISABLED");
  const anchor = await db.archiveAnchor.findUniqueOrThrow({ where: { id }, include: { revision: true } });
  if (anchor.revision.manifestHash !== digestSchema.parse(expectedHash) || anchor.network !== config.network || anchor.receiver !== config.receiver) throw new ArchiveChainError("ANCHOR_CONFIGURATION_CHANGED");
  const { manifest } = await verifyArchivePackage(JSON.parse(anchor.revision.packageJson), expectedHash);
  if (archiveMemo(manifest, expectedHash, config.network) !== anchor.memo) throw new ArchiveChainError("MEMO_MISMATCH");
  const rpc = createArchiveRpc(fetcher);
  const info = z.object({ chain: z.literal("test") }).safeParse(await rpc(config.writer, "getblockchaininfo", []));
  if (!info.success || await rpc(config.writer, "z_exportviewingkey", [config.receiver]) !== config.publicViewingKey) throw new ArchiveChainError("WRITER_ACCOUNT_MISMATCH");
  const discovery = z.object({ info: z.object({ title: z.literal("Zallet"), version: z.string() }) }).parse(await rpc(config.writer, "rpc.discover", []));
  if (discovery.info.version !== config.walletVersion) throw new ArchiveChainError("WRITER_VERSION_UNSUPPORTED");
  // Crash after this point always leaves a non-retryable intent, even if no opid was received.
  const claimed = await db.archiveAnchor.updateMany({ where: { id, state: "PREPARED", operationId: null, txids: { isEmpty: true } }, data: { state: "SUBMITTING" } });
  if (claimed.count !== 1) throw new ArchiveChainError("ALREADY_DISPATCHED");
  try {
    const opid = z.string().min(1).max(200).parse(await rpc(config.writer, "z_sendmany", [config.receiver, [{ address: config.receiver, amount: 0.00000001, memo: Buffer.from(anchor.memo).toString("hex") }], 3, null, "FullPrivacy"]));
    return await db.archiveAnchor.update({ where: { id }, data: { operationId: opid, state: "SUBMITTED" } });
  } catch {
    await db.archiveAnchor.updateMany({ where: { id, state: "SUBMITTING" }, data: { state: "UNKNOWN" } });
    throw new ArchiveChainError("SUBMISSION_OUTCOME_UNKNOWN");
  }
}

/** Polls one persisted operation. It never sends or automatically retries a payment. */
export async function refreshArchiveOperation(id: string, config: ArchiveChainConfig, fetcher: typeof fetch = fetch) {
  const anchor = await db.archiveAnchor.findUniqueOrThrow({ where: { id } });
  if (!config.writer || !anchor.operationId || anchor.network !== config.network || anchor.receiver !== config.receiver) throw new ArchiveChainError("OPERATION_UNAVAILABLE");
  if (anchor.state !== "SUBMITTED") return anchor;
  const rows = z.array(z.object({ id: z.string(), status: z.string(), result: z.object({ txid: digestSchema.optional(), txids: z.array(digestSchema).min(1).max(8).optional(), broadcast: z.boolean() }).optional() })).parse(await createArchiveRpc(fetcher)(config.writer, "z_getoperationstatus", [[anchor.operationId]]));
  const operation = rows.find(row => row.id === anchor.operationId);
  if (!operation) throw new ArchiveChainError("OPERATION_OUTCOME_UNKNOWN");
  if (operation.status === "queued" || operation.status === "executing") return anchor;
  if (operation.status !== "success" || !operation.result) {
    return db.archiveAnchor.update({ where: { id }, data: { state: operation.status === "failed" ? "FAILED" : "UNKNOWN" } });
  }
  const txids = operation.result.txids ?? (operation.result.txid ? [operation.result.txid] : []);
  if (!txids.length || new Set(txids).size !== txids.length || operation.result.txid && !txids.includes(operation.result.txid)) throw new ArchiveChainError("OPERATION_OUTCOME_UNKNOWN");
  await db.archiveAnchor.updateMany({ where: { id, state: "SUBMITTED", operationId: anchor.operationId }, data: { txids, state: operation.result.broadcast ? "BROADCAST" : "UNBROADCAST" } });
  return db.archiveAnchor.findUniqueOrThrow({ where: { id } });
}

export async function checkArchiveAnchor(id: string, config: ArchiveChainConfig, fetcher: typeof fetch = fetch) {
  const anchor = await db.archiveAnchor.findUniqueOrThrow({ where: { id }, include: { revision: true } });
  if (anchor.network !== config.network || anchor.receiver !== config.receiver) throw new ArchiveChainError("ANCHOR_CONFIGURATION_CHANGED");
  const { manifest } = await verifyArchivePackage(JSON.parse(anchor.revision.packageJson), anchor.revision.manifestHash);
  if (archiveCommitmentMemo(manifest, anchor.revision.manifestHash, config.network, anchor.commitment) !== anchor.memo) throw new ArchiveChainError("MEMO_MISMATCH");
  if (!anchor.txids.length) throw new ArchiveChainError("TRANSACTION_UNAVAILABLE");
  const observe = createArchiveObserver(fetcher);
  const matches = [];
  let lastCode = "MEMO_MISMATCH";
  let unresolved = false;
  for (const txid of anchor.txids) {
    try { matches.push(await observe(config, txid, anchor.memo)); }
    catch (error) {
      lastCode = error instanceof ArchiveChainError ? error.code : "INVALID_EVIDENCE";
      if (lastCode !== "MEMO_MISMATCH") unresolved = true;
    }
  }
  if (matches.length !== 1 || unresolved) return db.archiveAnchorCheck.create({ data: { anchorId: id, status: "UNVERIFIED", evidence: { reason: matches.length > 1 ? "AMBIGUOUS_ANCHOR" : lastCode } } });
  const evidence = matches[0];
  return db.archiveAnchorCheck.create({ data: { anchorId: id, status: evidence.confirmations >= evidence.requiredConfirmations ? "VERIFIED" : "CONFIRMING", evidence } });
}

/** Prepare a frozen batch. This public-data operation never contacts a writer. */
export async function prepareArchiveBatch(revisionIds: string[], config: ArchiveChainConfig) {
  return db.$transaction(tx => prepareArchiveBatchInTransaction(revisionIds, config, tx), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 });
}

/** Lets a private worker freeze the inventory and its job links in one commit. */
export async function prepareArchiveBatchInTransaction(revisionIds: string[], config: ArchiveChainConfig, tx: Prisma.TransactionClient) {
  validateArchiveConfig(config);
  if (!revisionIds.length || new Set(revisionIds).size !== revisionIds.length) throw new ArchiveChainError("INVALID_BATCH");
  const revisions = await tx.archiveRevision.findMany({ where: { id: { in: revisionIds } } });
  if (revisions.length !== revisionIds.length) throw new ArchiveChainError("MISSING_REVISION");
  const checked = await Promise.all(revisions.map(async row => ({ row, ...await verifyArchivePackage(JSON.parse(row.packageJson), row.manifestHash) })));
  const tree = buildArchiveMerkleTree(checked.map(item => item.manifestHash));
  const anchors = [];
  for (const item of checked) {
    const commitment = tree.proofs[item.manifestHash];
    const memo = archiveCommitmentMemo(item.manifest, item.manifestHash, config.network, commitment);
    const anchor = await tx.archiveAnchor.upsert({ where: { revisionId_network: { revisionId: item.row.id, network: config.network } },
      create: { revisionId: item.row.id, network: config.network, memo, receiver: config.receiver, commitment }, update: {} });
    if (anchor.memo !== memo || anchor.receiver !== config.receiver || archiveCommitmentMemo(item.manifest, item.manifestHash, config.network, anchor.commitment) !== memo) throw new ArchiveChainError("ANCHOR_CONFIGURATION_CHANGED");
    anchors.push(anchor);
  }
  return { ...tree, anchors };
}

/** Import a separately prepared operator transaction only after real memo/inclusion checks.
 * The application never signs or broadcasts mainnet transactions. Replay only adds a dated
 * check to the same transaction; it cannot replace an existing publication or submit again.
 */
export async function checkExternalArchiveBatch(ids: string[], txid: string, config: ArchiveChainConfig, fetcher: typeof fetch = fetch) {
  validateArchiveConfig(config); digestSchema.parse(txid);
  if (!ids.length || new Set(ids).size !== ids.length) throw new ArchiveChainError("INVALID_BATCH");
  const anchors = await db.archiveAnchor.findMany({ where: { id: { in: ids } }, include: { revision: true } });
  if (anchors.length !== ids.length) throw new ArchiveChainError("MISSING_ANCHOR");
  const memo = anchors[0].memo;
  for (const anchor of anchors) {
    const revision = await verifyArchivePackage(JSON.parse(anchor.revision.packageJson), anchor.revision.manifestHash);
    if (!anchor.commitment || anchor.network !== config.network || anchor.receiver !== config.receiver || anchor.memo !== memo || archiveCommitmentMemo(revision.manifest, revision.manifestHash, config.network, anchor.commitment) !== memo) throw new ArchiveChainError("ANCHOR_CONFIGURATION_CHANGED");
    if (anchor.state !== "PREPARED" && !(anchor.state === "BROADCAST" && anchor.txids.length === 1 && anchor.txids[0] === txid)) throw new ArchiveChainError("ALREADY_DISPATCHED");
  }
  // Failures leave prepared intents untouched and never fabricate a positive check.
  let evidence;
  try { evidence = await createArchiveObserver(fetcher)(config, txid, memo); }
  catch (error) {
    const reason = error instanceof ArchiveChainError ? error.code : "INVALID_EVIDENCE";
    // A new failed check supersedes earlier successful observations of a mined batch.
    const existing = anchors.filter(anchor => anchor.state === "BROADCAST");
    if (existing.length) await db.archiveAnchorCheck.createMany({ data: existing.map(anchor => ({ anchorId: anchor.id, status: "UNVERIFIED", evidence: { reason } })) });
    throw error;
  }
  return db.$transaction(async tx => {
    for (const anchor of anchors) {
      if (anchor.state === "PREPARED") {
        const claimed = await tx.archiveAnchor.updateMany({ where: { id: anchor.id, state: "PREPARED", operationId: null, txids: { isEmpty: true } }, data: { state: "SUBMITTING" } });
        if (claimed.count !== 1) throw new ArchiveChainError("ALREADY_DISPATCHED");
        await tx.archiveAnchor.update({ where: { id: anchor.id }, data: { state: "SUBMITTED", operationId: `external-pczt:${txid}` } });
        await tx.archiveAnchor.update({ where: { id: anchor.id }, data: { state: "BROADCAST", txids: [txid] } });
      }
      await tx.archiveAnchorCheck.create({ data: { anchorId: anchor.id, status: evidence.confirmations >= evidence.requiredConfirmations ? "VERIFIED" : "CONFIRMING", evidence } });
    }
    return { count: anchors.length, evidence };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 });
}
