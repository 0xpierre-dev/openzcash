import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { readZcgSourceCategory, zcgSourceMetadataSchema } from "../lib/domain/zcg-source-metadata";

const issueSchema = z.object({
  number: z.number().int().positive(), html_url: z.string().url(), title: z.string(),
  state: z.enum(["open", "closed"]), updated_at: z.string().datetime(), body: z.string().nullable(),
  labels: z.array(z.object({ name: z.string(), color: z.string(), description: z.string().nullable() })),
  pull_request: z.never().optional()
});

// Refresh only the explicitly mapped GitHub issues. Preserved revision packages are never rewritten.
async function main() {
  const path = resolve("data/zcg-source-metadata.json");
  const current = zcgSourceMetadataSchema.parse(JSON.parse(await readFile(path, "utf8")));
  const proposals: typeof current.proposals = [];
  for (let offset = 0; offset < current.proposals.length; offset += 5) {
    const batch = await Promise.all(current.proposals.slice(offset, offset + 5).map(async previous => {
      const response = await fetch(`https://api.github.com/repos/ZcashCommunityGrants/zcashcommunitygrants/issues/${previous.issueNumber}`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "OpenZcash-Participate" }, signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error(`GitHub issue ${previous.issueNumber}: HTTP ${response.status}. Snapshot unchanged.`);
      const issue = issueSchema.parse(await response.json());
      if (issue.number !== previous.issueNumber || issue.html_url !== previous.url) throw new Error("GitHub issue identity changed. Snapshot unchanged.");
      const category = readZcgSourceCategory(issue.body);
      return { recordId: previous.recordId, issueNumber: issue.number, url: issue.html_url, title: issue.title.trim(), state: issue.state,
        updatedAt: issue.updated_at, category,
        labels: issue.labels.map(label => ({ name: label.name, color: label.color.toLowerCase(), description: label.description ?? "" })) };
    }));
    proposals.push(...batch);
  }
  const next = zcgSourceMetadataSchema.parse({ ...current, checkedAt: new Date().toISOString(), proposals });
  await writeFile(`${path}.tmp`, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await rename(`${path}.tmp`, path);
  console.log(`Checked labels and categories for ${proposals.length} mapped GitHub issues. Archive packages unchanged.`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Source refresh failed"); process.exitCode = 1; });
