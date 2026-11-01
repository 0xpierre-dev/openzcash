import { createHash } from "node:crypto";
import { z } from "zod";
import { archiveMemo, archiveNetworkSchema, digestSchema, type ArchiveManifest, type ArchiveNetwork } from "./format";

// Domain-separated SHA-256 leaves and branches. Odd nodes are promoted unchanged.
// Sort unique manifest digests lexicographically; the memo commits to tree size.
export const merkleProofSchema = z.object({
  schema: z.literal("PARTICIPATE_MERKLE_V1"), root: digestSchema,
  leafIndex: z.number().int().min(0).max(9999), leafCount: z.number().int().min(1).max(10000),
  siblings: z.array(digestSchema).max(14)
}).strict();
export type ArchiveMerkleProof = z.infer<typeof merkleProofSchema>;
const hash = (prefix: number, ...digests: string[]) => createHash("sha256").update(Buffer.concat([Buffer.from([prefix]), ...digests.map(value => Buffer.from(value, "hex"))])).digest("hex");

export function buildArchiveMerkleTree(manifestHashes: string[]) {
  if (!manifestHashes.length || manifestHashes.length > 10000 || new Set(manifestHashes).size !== manifestHashes.length) throw new Error("Invalid tree inventory");
  const leaves = manifestHashes.map(value => digestSchema.parse(value)).sort();
  const levels = [leaves.map(value => hash(0, value))];
  while (levels.at(-1)!.length > 1) {
    const row = levels.at(-1)!;
    const next: string[] = [];
    for (let i = 0; i < row.length; i += 2) next.push(i + 1 < row.length ? hash(1, row[i], row[i + 1]) : row[i]);
    levels.push(next);
  }
  const root = levels.at(-1)![0];
  const proofs = Object.fromEntries(leaves.map((digest, leafIndex) => {
    let index = leafIndex;
    const siblings: string[] = [];
    for (const row of levels.slice(0, -1)) {
      const sibling = index % 2 ? index - 1 : index + 1;
      if (sibling < row.length) siblings.push(row[sibling]);
      index = Math.floor(index / 2);
    }
    return [digest, { schema: "PARTICIPATE_MERKLE_V1" as const, root, leafIndex, leafCount: leaves.length, siblings }];
  }));
  return { root, leafCount: leaves.length, proofs };
}

export function verifyArchiveMerkleProof(manifestHash: string, input: unknown): ArchiveMerkleProof {
  const proof = merkleProofSchema.parse(input);
  let index = proof.leafIndex, width = proof.leafCount, cursor = 0;
  if (index >= width) throw new Error("Invalid leaf index");
  let digest = hash(0, digestSchema.parse(manifestHash));
  while (width > 1) {
    if (index % 2 || index + 1 < width) {
      const sibling = proof.siblings[cursor++];
      if (!sibling) throw new Error("Missing Merkle sibling");
      digest = index % 2 ? hash(1, sibling, digest) : hash(1, digest, sibling);
    }
    index = Math.floor(index / 2); width = Math.ceil(width / 2);
  }
  if (cursor !== proof.siblings.length || digest !== proof.root) throw new Error("Merkle proof does not match this revision");
  return proof;
}

export function archiveBatchMemo(root: string, leafCount: number, network: ArchiveNetwork) {
  digestSchema.parse(root); archiveNetworkSchema.parse(network);
  if (!Number.isInteger(leafCount) || leafCount < 1 || leafCount > 10000) throw new Error("Invalid tree size");
  return `PARTICIPATE|ARCHIVE|v1|${network}|count:${leafCount}|sha256:${root}`;
}

export function archiveCommitmentMemo(manifest: Pick<ArchiveManifest, "recordId" | "revision">, manifestHash: string, network: ArchiveNetwork, commitment?: unknown) {
  if (commitment == null) return archiveMemo(manifest, manifestHash, network);
  const proof = verifyArchiveMerkleProof(manifestHash, commitment);
  return archiveBatchMemo(proof.root, proof.leafCount, network);
}
