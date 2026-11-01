import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { decodeFile, verifyArchivePackage } from "./format";

/** Validate everything before creating a NEW directory; never overwrites an existing path. */
export async function recoverArchiveFiles(input: unknown, expectedHash: string, directory: string) {
  const checked = await verifyArchivePackage(input, expectedHash);
  const root = resolve(directory);
  const files = checked.bundle.files.map(file => {
    const path = resolve(root, "files", file.path);
    if (!path.startsWith(root + sep + "files" + sep)) throw new Error("Invalid recovery path");
    return { path, bytes: decodeFile(file) };
  });
  await mkdir(root); // Fails for any pre-existing directory, file or symlink.
  await writeFile(resolve(root, "manifest.json"), checked.bundle.manifest, { flag: "wx" });
  for (const file of files) {
    await mkdir(dirname(file.path), { recursive: true });
    await writeFile(file.path, file.bytes, { flag: "wx" });
  }
  return { directory: root, files: files.length };
}
