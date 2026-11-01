// @vitest-environment node
import { createHash } from "node:crypto";
import { archiveBatchMemo, buildArchiveMerkleTree, verifyArchiveMerkleProof } from "@/lib/archive/merkle";

const digest = (n: number) => createHash("sha256").update(String(n)).digest("hex");
it.each([1, 2, 3, 5, 25, 32, 63, 10000])("verifies every inclusion in a %i-record tree, including promoted odd nodes", size => {
  const hashes = Array.from({ length: size }, (_, i) => digest(i));
  const tree = buildArchiveMerkleTree(hashes);
  for (const value of hashes) expect(verifyArchiveMerkleProof(value, tree.proofs[value]).root).toBe(tree.root);
  expect(buildArchiveMerkleTree([...hashes].reverse()).root).toBe(tree.root);
});
it("uses domain-separated bytes with a reproducible independent reference", () => {
  const values = [digest(1), digest(2)].sort();
  const h = (bytes: Buffer) => createHash("sha256").update(bytes).digest();
  const root = h(Buffer.concat([Buffer.from([1]), ...values.map(v => h(Buffer.concat([Buffer.from([0]), Buffer.from(v, "hex")])))]));
  expect(buildArchiveMerkleTree(values).root).toBe(root.toString("hex"));
});
it("rejects changed files, reordered siblings, truncated and extended proofs", () => {
  const values = Array.from({ length: 25 }, (_, i) => digest(i));
  const tree = buildArchiveMerkleTree(values), proof = tree.proofs[values[0]];
  for (const broken of [{ ...proof, root: digest(99) }, { ...proof, leafIndex: 25 }, { ...proof, siblings: [...proof.siblings].reverse() }, { ...proof, siblings: proof.siblings.slice(1) }, { ...proof, siblings: [...proof.siblings, digest(90)] }]) {
    expect(() => verifyArchiveMerkleProof(values[0], broken)).toThrow();
  }
  expect(() => verifyArchiveMerkleProof(digest(999), proof)).toThrow();
  expect(() => buildArchiveMerkleTree([digest(0), digest(0)])).toThrow();
  expect(archiveBatchMemo(tree.root, 25, "mainnet")).toBe(`PARTICIPATE|ARCHIVE|v1|mainnet|count:25|sha256:${tree.root}`);
});
