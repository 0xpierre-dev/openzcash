// @vitest-environment node
import { mkdtemp, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPilotPackages } from "@/lib/archive/catalog";
import { recoverArchiveFiles } from "@/lib/archive/recover";

it("recovers exact original bytes with no app or database and never replaces an existing copy", async () => {
  const folder = await mkdtemp(join(tmpdir(), "archive-recovery-test-"));
  try {
    const record = (await readPilotPackages())[0], target = join(folder, "restored");
    const result = await recoverArchiveFiles(record.bundle, record.manifestHash, target);
    expect(result.files).toBe(record.bundle.files.length);
    expect(await readFile(join(target, "manifest.json"), "utf8")).toBe(record.bundle.manifest);
    for (const file of record.bundle.files) expect(await readFile(join(target, "files", file.path))).toEqual(Buffer.from(file.data, "base64"));
    await expect(recoverArchiveFiles(record.bundle, record.manifestHash, target)).rejects.toThrow();
    const damaged = structuredClone(record.bundle); damaged.files[0].data = Buffer.from("altered").toString("base64");
    await expect(recoverArchiveFiles(damaged, record.manifestHash, join(folder, "damaged"))).rejects.toThrow();
    expect(await readdir(folder)).toEqual(["restored"]);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
