import { parseArgs } from "node:util";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { buildSourceProposal, verifySourceProposal } from "../lib/archive/source-proposals";
import { MAX_PACKAGE_BYTES, canonicalJson, digestSchema, decodeFile } from "../lib/archive/format";
import { importSourceProposal } from "../lib/services/source-intake";
import { db } from "../lib/db";

/** Capture → review the exact files → import. Never signs, sends ZEC or marks an anchor confirmed. */
async function main() {
  const { values } = parseArgs({ options: { issue: { type: "string" }, out: { type: "string" }, package: { type: "string" }, "expect-hash": { type: "string" }, revision: { type: "string" }, "previous-hash": { type: "string" }, apply: { type: "boolean", default: false } }, strict: true });
  if (values.issue) {
    if (!/^\d{1,8}$/.test(values.issue) || Number(values.issue) < 1 || !values.out || values.package || values.apply || values["expect-hash"]) throw new Error("Capture requires --issue NUMBER --out NEW_DIRECTORY; import is a separate step");
    const revision = values.revision ? Number(values.revision) : 1;
    if (!Number.isInteger(revision) || revision < 1 || revision > 10000 || (revision > 1) !== Boolean(values["previous-hash"])) throw new Error("A later revision requires its previous manifest hash");
    const previousHash = values["previous-hash"] ? digestSchema.parse(values["previous-hash"]) : null;
    const response = await fetch(`https://api.github.com/repos/ZcashCommunityGrants/zcashcommunitygrants/issues/${values.issue}`, { redirect: "error", signal: AbortSignal.timeout(20000), headers: { Accept: "application/vnd.github+json", "User-Agent": "OpenZcash-Participate-source-intake" } });
    if (!response.ok) throw new Error(`Official source returned HTTP ${response.status}`);
    // Bound the stream rather than trusting the upstream Content-Length header.
    const reader = response.body?.getReader(); if (!reader) throw new Error("Source body unavailable");
    let bytes = 0; const chunks: Uint8Array[] = [];
    try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 2 * 1024 * 1024) throw new Error("Source body exceeds capture limit"); chunks.push(chunk.value); } }
    finally { await reader.cancel(); }
    const checked = await buildSourceProposal(JSON.parse(Buffer.concat(chunks).toString("utf8")), Number(values.issue), new Date().toISOString(), revision, previousHash);
    const directory = resolve(values.out);
    await mkdir(directory, { recursive: false }); // A capture never overwrites a previous package.
    const filename = `${checked.manifest.recordId}-r${revision}.zvoice.json`;
    await writeFile(join(directory, filename), canonicalJson(checked.bundle), { flag: "wx" });
    for (const file of checked.bundle.files) await writeFile(join(directory, file.path), decodeFile(file), { flag: "wx" });
    await writeFile(join(directory, "intake.json"), canonicalJson({ filename, manifestHash: checked.manifestHash, source: checked.capture.source.url, capturedAt: checked.manifest.capturedAt, state: "CAPTURED_NOT_IMPORTED" }), { flag: "wx" });
    console.log(JSON.stringify({ recordId: checked.manifest.recordId, filename, manifestHash: checked.manifestHash, state: "CAPTURED_NOT_IMPORTED", scope: checked.manifest.scope }));
    return;
  }
  if (!values.package || !values["expect-hash"] || values.out || values.revision || values["previous-hash"]) throw new Error("Import: --package FILE --expect-hash SHA256 [--apply]");
  const hash = digestSchema.parse(values["expect-hash"]), path = resolve(values.package);
  if ((await stat(path)).size > MAX_PACKAGE_BYTES) throw new Error("Package too large");
  const checked = await verifySourceProposal(JSON.parse(await readFile(path, "utf8")), hash);
  if (!values.apply) { console.log(JSON.stringify({ recordId: checked.manifest.recordId, revision: checked.manifest.revision, manifestHash: hash, state: "VALIDATED_NOT_IMPORTED" })); return; }
  const row = await importSourceProposal(checked.bundle, hash);
  console.log(JSON.stringify({ recordId: checked.manifest.recordId, revisionId: row.id, manifestHash: hash, state: "IMPORTED_ANCHOR_PENDING" }));
}
main().catch(error => { console.error(error instanceof Error && error.name !== "ZodError" ? error.message : "Source capture rejected. Check identity, review labels and package fields."); process.exitCode = 1; }).finally(() => db.$disconnect());
