// @vitest-environment node
import { readPilotPackages } from "@/lib/archive/catalog";
import { archiveMemo, canonicalJson, sha256, utf8, verifyArchivePackage } from "@/lib/archive/format";

describe("published archive packages", () => {
  it("verifies all five independently pinned packages and distinguishes historical dates", async () => {
    const packages = await readPilotPackages();
    expect(packages).toHaveLength(5);
    expect(new Set(packages.map(item => item.manifestHash)).size).toBe(5);
    for (const item of packages) {
      expect(item.manifest.kind).toBe("HISTORICAL_SUMMARY");
      if (item.manifest.kind !== "HISTORICAL_SUMMARY") throw new Error("Historical fixture expected");
      expect(item.manifest.sources).toHaveLength(2);
      expect(new Date(item.manifest.capturedAt).getTime()).toBeGreaterThan(new Date(item.manifest.originalDecisionDate).getTime());
      expect(item.manifest.files.map(file => file.path)).toEqual(["proposal.md", "record.json"]);
    }
  });
  it.each(["body", "missing", "extra", "duplicate", "manifest", "noncanonical", "traversal"])("rejects %s tampering", async variant => {
    const item = (await readPilotPackages())[0];
    const bundle = structuredClone(item.bundle);
    if (variant === "body") bundle.files[0].data = Buffer.from("Changed proposal").toString("base64");
    if (variant === "missing") bundle.files.pop();
    if (variant === "extra") bundle.files.push({ ...bundle.files[0], path: "extra.md" });
    if (variant === "duplicate") bundle.files[1] = bundle.files[0];
    if (variant === "manifest") bundle.manifest = canonicalJson({ ...item.manifest, title: "Changed title" });
    if (variant === "noncanonical") bundle.manifest = JSON.stringify(item.manifest);
    if (variant === "traversal") bundle.files[0].path = "../proposal.md";
    await expect(verifyArchivePackage(bundle, item.manifestHash)).rejects.toThrow();
  });
  it("requires a pinned digest rather than trusting a rewritten self-consistent package", async () => {
    const item = (await readPilotPackages())[0];
    const changed = structuredClone(item.bundle);
    const body = utf8("A different file");
    changed.files[0].data = Buffer.from(body).toString("base64");
    const manifest = structuredClone(item.manifest); manifest.files[0].sha256 = await sha256(body); manifest.files[0].bytes = body.length;
    changed.manifest = canonicalJson(manifest);
    await expect(verifyArchivePackage(changed, item.manifestHash)).rejects.toThrow("Manifest does not match");
  });
  it("domain-separates network, revision and record within the memo limit", async () => {
    const item = (await readPilotPackages())[0];
    const testnet = archiveMemo(item.manifest, item.manifestHash, "testnet");
    expect(testnet).not.toBe(archiveMemo(item.manifest, item.manifestHash, "mainnet"));
    expect(testnet).not.toBe(archiveMemo({ ...item.manifest, revision: 2 }, item.manifestHash, "testnet"));
    expect(Buffer.byteLength(testnet)).toBeLessThan(513);
    expect(() => archiveMemo({ ...item.manifest, recordId: "../x" }, item.manifestHash, "testnet")).toThrow();
  });
});
