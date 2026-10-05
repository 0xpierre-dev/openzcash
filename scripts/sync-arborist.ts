/** Public source snapshot. Run with node --import tsx scripts/sync-arborist.ts.
 * --github-cli uses the existing gh login without extracting/printing its token. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, rename } from "node:fs/promises";
import { createArboristLoader, type ArboristSnapshot } from "../src/lib/arborist/collector";
const execute = promisify(execFile);
const target = new URL("../src/data/arborist/snapshot.json", import.meta.url);
async function main() {
  let previous: ArboristSnapshot | undefined;
  try { previous = JSON.parse(await readFile(target, "utf8")); } catch { /* First verified snapshot. */ }
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (process.argv.includes("--github-cli") && url.origin === "https://api.github.com" && url.pathname.startsWith("/repos/ZcashCommunityGrants/arboretum-notes/contents")) {
      const { stdout } = await execute("gh", ["api", url.pathname.slice(1)], { maxBuffer: 512 * 1024, timeout: 10_000 });
      return new Response(stdout, { headers: { "content-type": "application/json" } });
    }
    return fetch(input, init);
  };
  const loader = createArboristLoader({ fetcher, token: () => process.env.GITHUB_TOKEN, snapshot: previous });
  const calls = await loader.refresh(), status = loader.getStatus(), snapshot = loader.getSnapshot();
  if (status.notes.status !== "live" || status.recordings.status !== "live" || !snapshot.collectedAt ||
      snapshot.notes.length < (previous?.notes.length ?? 1)) throw new Error("Incomplete source refresh; previous snapshot preserved");
  const temporary = new URL(`${target.href}.tmp`);
  await writeFile(temporary, JSON.stringify(snapshot, null, 2) + "\n");
  await rename(temporary, target);
  console.log(JSON.stringify({ calls: calls.length, latest: calls[0]?.date, verifiedAt: snapshot.collectedAt, notes: status.notes.transport, recordings: status.recordings.transport }));
}
main().catch(error => { console.error(error instanceof Error && error.message.startsWith("Incomplete") ? error.message : "Arborist collection failed; previous snapshot preserved"); process.exitCode = 1; });
