// @vitest-environment node
import { randomUUID } from "node:crypto";
import { activityBatchMemo, verifyActivityBundle, verifyActivityEvent, type ActivityBundle } from "@/lib/archive/activity";
import { canonicalJson, sha256, utf8 } from "@/lib/archive/format";
import { buildArchiveMerkleTree } from "@/lib/archive/merkle";
import { activityProof, validateActivityChainReceipt } from "@/lib/archive/activity-proof";
import { archiveProofFixture } from "@/tests/helpers/archive-proof";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

async function fixture() {
  const body = "A public perspective.\nKeep these exact bytes.";
  const event = { schema: "PARTICIPATE_EVENT_V1", id: randomUUID(), communityId: "public-committee", recordId: "proposal-one", proposalManifestHash: "a".repeat(64),
    sequence: 1, previousEventHash: null, actor: randomUUID(), occurredAt: "2026-10-10T00:00:00.000Z", recordedAt: "2026-10-10T00:00:00.000Z", origin: "LIVE",
    kind: "COMMENT_POSTED", commentId: "comment-one", parentId: null, bodyHash: await sha256(utf8(body)) };
  const eventJson = canonicalJson(event), eventHash = await sha256(utf8(eventJson));
  const tree = buildArchiveMerkleTree([eventHash, "f".repeat(64), "e".repeat(64)]);
  const f = archiveProofFixture();
  const inclusion = { network: "mainnet" as const, receiver: f.evidence.receiver, memo: activityBatchMemo(tree.root, tree.leafCount, "mainnet"), proof: tree.proofs[eventHash] };
  const chain = { status: "VERIFIED" as const, observedAt: new Date(f.now - 1000).toISOString(), evidence: { ...f.evidence, memo: inclusion.memo } };
  const bundle: ActivityBundle = { schema: "PARTICIPATE_EVENT_RECEIPT_V1", event: eventJson, eventHash, body, inclusion, chain };
  return { ...f, event, eventJson, eventHash, bundle, chain, inclusion };
}

it("verifies exact event and comment bytes with a size-bound Merkle path", async () => {
  const f = await fixture();
  expect((await verifyActivityBundle(f.bundle, f.eventHash)).event.id).toBe(f.event.id);
  await expect(verifyActivityBundle({ ...f.bundle, body: null }, f.eventHash)).resolves.toBeDefined();
});
it.each(["body", "event", "hash", "path", "size", "network", "namespace"])("rejects an altered %s", async target => {
  const f = await fixture(), bundle = structuredClone(f.bundle);
  if (target === "body") bundle.body += " altered";
  if (target === "event") bundle.event = canonicalJson({ ...f.event, commentId: "another-comment" });
  if (target === "hash") bundle.eventHash = "f".repeat(64);
  if (target === "path") bundle.inclusion!.proof.siblings[0] = "0".repeat(64);
  if (target === "size") bundle.inclusion!.proof.leafCount++;
  if (target === "network") bundle.inclusion!.network = "testnet";
  if (target === "namespace") bundle.inclusion!.memo = bundle.inclusion!.memo.replace("|ACTIVITY|", "|ARCHIVE|");
  await expect(verifyActivityBundle(bundle, f.eventHash)).rejects.toThrow();
});
it.each(["email", "userId", "balance", "requestKey"])("refuses private %s fields even when rehashed", async key => {
  const f = await fixture(), json = canonicalJson({ ...f.event, [key]: "private" });
  await expect(verifyActivityEvent(json, await sha256(utf8(json)))).rejects.toThrow();
});
it("rejects missing history links, impossible times and noncanonical bytes", async () => {
  const f = await fixture();
  for (const event of [{ ...f.event, sequence: 2 }, { ...f.event, recordedAt: "2026-10-09T00:00:00.000Z" }]) {
    const json = canonicalJson(event); await expect(verifyActivityEvent(json, await sha256(utf8(json)))).rejects.toThrow();
  }
  await expect(verifyActivityEvent(JSON.stringify(f.event), await sha256(utf8(JSON.stringify(f.event))))).rejects.toThrow();
});
it("separates queued, prepared, confirmed, stale and failed states, stripping private evidence", async () => {
  const f = await fixture();
  const batch = { txid: f.evidence.txid, checks: [{ status: "VERIFIED", evidence: { ...f.chain.evidence, rpcPassword: "secret" }, createdAt: new Date(f.chain.observedAt) }] };
  expect(activityProof(null).state).toBe("RECORDED");
  expect(activityProof(f.inclusion, { txid: null, checks: [] }).state).toBe("PREPARED");
  expect(activityProof(f.inclusion, batch, f.now).state).toBe("VERIFIED");
  expect(JSON.stringify(activityProof(f.inclusion, batch, f.now))).not.toContain("secret");
  expect(activityProof(f.inclusion, batch, f.now + 900000)).toMatchObject({ state: "CHECK_REQUIRED", chain: { status: "VERIFIED" } });
  batch.checks.unshift({ status: "UNVERIFIED", evidence: { ...f.chain.evidence, rpcPassword: "secret" }, createdAt: new Date(f.now) });
  expect(activityProof(f.inclusion, batch, f.now)).toMatchObject({ state: "CHECK_REQUIRED", chain: null });
});
it.each(["txid", "memo", "confirmations", "policy", "future", "receiver", "network"])("rejects invalid %s chain evidence", async field => {
  const f = await fixture(), chain = structuredClone(f.chain);
  if (field === "txid") chain.evidence.txid = "f".repeat(64);
  if (field === "memo") chain.evidence.memo += "x";
  if (field === "confirmations") chain.evidence.confirmations = 10;
  if (field === "policy") chain.evidence.requiredConfirmations = 1;
  if (field === "future") chain.observedAt = new Date(f.now + 1000).toISOString();
  if (field === "receiver") chain.evidence.receiver = "zs1" + "p".repeat(70);
  if (field === "network") chain.evidence.network = "testnet";
  expect(() => validateActivityChainReceipt(chain, f.inclusion, f.evidence.txid, f.now)).toThrow();
});
it("runs the downloaded verifier without the app, recovers text, and refuses tampering or overwrite", async () => {
  const f = await fixture(), directory = await mkdtemp(join(tmpdir(), "participate-activity-test-"));
  const receipt = join(directory, "receipt.json"), recovered = join(directory, "comment.txt");
  await writeFile(receipt, canonicalJson(f.bundle));
  const args = ["public/verify/activity-verify.mjs", receipt, "--hash", f.eventHash, "--extract-comment", recovered];
  const output = JSON.parse(execFileSync(process.execPath, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  expect(output).toMatchObject({ eventStatus: "MATCHED", commentStatus: "MATCHED", batchStatus: "INCLUSION_PATH_MATCHED", chainStatus: "NOT_CHECKED" });
  expect(await readFile(recovered, "utf8")).toBe(f.bundle.body);
  expect(() => execFileSync(process.execPath, args, { stdio: "pipe" })).toThrow();
  await writeFile(receipt, canonicalJson({ ...f.bundle, body: "tampered" }));
  expect(() => execFileSync(process.execPath, args.slice(0, -2), { stdio: "pipe" })).toThrow();
});


it("verifies an abandonment and rejects a changed reason with the standalone verifier", async () => {
  const f = await fixture();
  const base = { ...f.event } as Record<string, unknown>;
  delete base.commentId; delete base.parentId; delete base.bodyHash;
  const event = { ...base, kind: "PROPOSAL_ABANDONED", authority: "AUTHOR_ACCOUNT", reason: "The team cannot deliver the proposed milestones." };
  const eventJson = canonicalJson(event), eventHash = await sha256(utf8(eventJson));
  const tree = buildArchiveMerkleTree([eventHash]);
  const bundle: ActivityBundle = { schema: "PARTICIPATE_EVENT_RECEIPT_V1", event: eventJson, eventHash, body: null,
    inclusion: { ...f.inclusion, memo: activityBatchMemo(tree.root, 1, "mainnet"), proof: tree.proofs[eventHash] }, chain: null };
  expect((await verifyActivityBundle(bundle, eventHash)).event).toMatchObject(event);
  const directory = await mkdtemp(join(tmpdir(), "participate-abandonment-test-")), receipt = join(directory, "receipt.json");
  await writeFile(receipt, canonicalJson(bundle));
  const args = ["public/verify/activity-verify.mjs", receipt, "--hash", eventHash];
  expect(JSON.parse(execFileSync(process.execPath, args, { encoding: "utf8", stdio: "pipe" }))).toMatchObject({ eventStatus: "MATCHED", batchStatus: "INCLUSION_PATH_MATCHED", chainStatus: "NOT_CHECKED" });
  await writeFile(receipt, canonicalJson({ ...bundle, event: canonicalJson({ ...event, reason: "Another reason." }) }));
  expect(() => execFileSync(process.execPath, args, { stdio: "pipe" })).toThrow();
});

it("verifies Ironwood inclusions and rejects receipts relabeled as Sapling", async () => {
  const f = await fixture();
  const inclusion = { ...f.inclusion, pool: "ironwood" as const, receiver: "u1" + "q".repeat(100) };
  const chain = { ...f.chain, evidence: { ...f.chain.evidence, pool: "ironwood", receiver: inclusion.receiver, publicViewingKey: "uview1" + "q".repeat(150), receiverIndex: 0 } };
  expect((await verifyActivityBundle({ ...f.bundle, inclusion, chain }, f.eventHash)).event.id).toBe(f.event.id);
  expect(validateActivityChainReceipt(chain, inclusion, undefined, f.now).evidence.pool).toBe("ironwood");
  await expect(verifyActivityBundle({ ...f.bundle, inclusion: { ...inclusion, pool: "sapling" } }, f.eventHash)).rejects.toThrow();
  expect(() => validateActivityChainReceipt(f.chain, inclusion, undefined, f.now)).toThrow();
});

it("verifies edited text with the standalone verifier and binds its previous version fingerprint", async () => {
  const f = await fixture(), { parentId: _, ...base } = f.event;
  const event = { ...base, kind: "COMMENT_EDITED", version: 2, sequence: 2, previousEventHash: f.eventHash, previousBodyHash: f.event.bodyHash };
  const eventJson = canonicalJson(event), eventHash = await sha256(utf8(eventJson));
  const bundle = { ...f.bundle, event: eventJson, eventHash, inclusion: null, chain: null };
  expect((await verifyActivityBundle(bundle, eventHash)).event.kind).toBe("COMMENT_EDITED");
  const directory = await mkdtemp(join(tmpdir(), "participate-edit-proof-")), receipt = join(directory, "receipt.json");
  await writeFile(receipt, canonicalJson(bundle));
  const result = JSON.parse(execFileSync(process.execPath, ["public/verify/activity-verify.mjs", receipt, "--hash", eventHash], { encoding: "utf8", stdio: "pipe" }));
  expect(result).toMatchObject({ eventStatus: "MATCHED", commentStatus: "MATCHED" });
  await expect(verifyActivityBundle({ ...bundle, body: "Changed after anchoring" }, eventHash)).rejects.toThrow();
});
