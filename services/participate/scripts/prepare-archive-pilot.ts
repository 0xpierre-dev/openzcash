import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ZCG_PROPOSAL_EXAMPLES, ZCG_EXAMPLE_MEMBERS } from "../lib/data/zcg-proposal-examples";
import { ARCHIVE_SCHEMA, canonicalJson, sha256, utf8, verifyArchivePackage, type ArchiveManifest } from "../lib/archive/format";

async function main() {
  const directory = resolve(process.argv[2] ?? "data/archive-pilot");
  await mkdir(directory, { recursive: true });
  const capturedAt = new Date().toISOString();
  const catalog: { id: string; title: string; revision: number; manifestHash: string }[] = [];
  for (const proposal of ZCG_PROPOSAL_EXAMPLES) {
    const record = { ...proposal, requestedUsdCents: String(proposal.requestedUsd * 100), feedbackType: "editorial_summary", sourceCheckedOn: "2026-10-09", members: ZCG_EXAMPLE_MEMBERS };
    const markdown = `# ${proposal.title}\n\nHistorical ZCG record · Summary snapshot\n\nOriginal decision: ${proposal.decisionDate} · ${proposal.outcome}\n\nRequested: $${proposal.requestedUsd.toLocaleString("en-US")} USD. This is a request, not a payment.\n\n## Published committee positions\n\n${proposal.votes.map(vote => `- **${ZCG_EXAMPLE_MEMBERS[vote.memberId].name} — ${vote.vote}:** ${vote.summary}`).join("\n")}\n\nFeedback is an editorial summary of the published minutes, not a quotation or a signature. These are historical positions, not ballots cast in Z Voice.\n\n## Sources\n\n- [Original proposal](${proposal.proposalUrl})\n- [Meeting minutes](${proposal.minutesUrl})\n\nThe full original proposal and attachments are linked, not reproduced in this snapshot. Capture and chain timestamps do not replace the original decision date. New Z Voice discussion is separate from the ZCG record.\n`;
    const inputs = [{ path: "proposal.md", mediaType: "text/markdown" as const, text: markdown }, { path: "record.json", mediaType: "application/json" as const, text: canonicalJson(record) }];
    const files = await Promise.all(inputs.map(async file => ({ path: file.path, bytes: utf8(file.text).length, mediaType: file.mediaType, sha256: await sha256(utf8(file.text)) })));
    const manifest: ArchiveManifest = { schema: ARCHIVE_SCHEMA, recordId: proposal.id, revision: 1, previousManifestHash: null, kind: "HISTORICAL_SUMMARY", title: proposal.title, originalDecisionDate: proposal.decisionDate, capturedAt, sources: [proposal.proposalUrl, proposal.minutesUrl], scope: "Editorial summary with published committee positions; original proposal and attachments are linked, not reproduced.", files };
    const bundle = { schema: ARCHIVE_SCHEMA, manifest: canonicalJson(manifest), files: inputs.map(file => ({ path: file.path, encoding: "base64" as const, data: Buffer.from(file.text).toString("base64") })) };
    const manifestHash = await sha256(utf8(bundle.manifest));
    await verifyArchivePackage(bundle, manifestHash);
    await writeFile(resolve(directory, `${proposal.id}-r1.json`), canonicalJson(bundle), { flag: "wx" });
    catalog.push({ id: proposal.id, title: proposal.title, revision: 1, manifestHash });
  }
  await writeFile(resolve(directory, "catalog.json"), canonicalJson(catalog), { flag: "wx" });
  console.log(`Prepared ${catalog.length} immutable summary packages in ${directory}. No transactions sent.`);
}
main().catch(() => { console.error("Preparation stopped. Existing files are never overwritten; use a new directory for a new capture."); process.exitCode = 1; });
