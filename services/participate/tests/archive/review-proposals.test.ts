// @vitest-environment node
import { readReviewPackages } from "@/lib/archive/review-proposals";
import { archiveManifestSchema, canonicalJson, decodeFile, sha256, utf8, verifyArchivePackage } from "@/lib/archive/format";
import { isZcgUnderReview, zcgReviewSnapshotSchema } from "@/lib/domain/zcg-review";
import snapshot from "@/data/zcg-review-queue.json";

describe("ZCG review snapshots", () => {
  it("excludes stale ready labels after approval, funding, rejection or closure", () => {
    const labels = ["📋 Grant Application", "👀 Ready For ZCG Review"];
    expect(isZcgUnderReview({ state: "open", labels })).toBe(true);
    for (const label of ["✅ Grant Approved", "Grant Rejected", "❌ Grant Declined", "⛔ Does Not Meet Criteria", "Closed - Did Not Follow Process", "Filtered", "Withdrawn", "Cancelled", "Vetoed", "✅ Startup Payment Completed", "🎯 Milestone 1 Complete"])
      expect(isZcgUnderReview({ state: "open", labels: [...labels, label] })).toBe(false);
    expect(isZcgUnderReview({ state: "closed", labels })).toBe(false);
    expect(isZcgUnderReview({ state: "open", labels: [] })).toBe(false);
    expect(isZcgUnderReview({ state: "open", labels: ["🛡️ V12 Credits Application"] })).toBe(false);
  });
  it("validates source identities and does not duplicate historical or decided grants", () => {
    const parsed = zcgReviewSnapshotSchema.parse(snapshot);
    expect(parsed.proposals).toHaveLength(20);
    expect(parsed.proposals.find(p => p.issueNumber === 477)?.requestedUsd).toBe(48000);
    expect(parsed.proposals.find(p => p.issueNumber === 386)?.requestedUsd).toBe(8120);
    expect(parsed.proposals.some(p => [424, 438, 449, 375, 479, 480].includes(p.issueNumber))).toBe(false);
    const wrong = structuredClone(snapshot); wrong.proposals[0].proposalUrl = "https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/999";
    expect(() => zcgReviewSnapshotSchema.parse(wrong)).toThrow();
  });
  it("preserves pending metadata without creating a decision date or committee positions", async () => {
    const packages = await readReviewPackages();
    expect(packages).toHaveLength(snapshot.proposals.length);
    for (const item of packages) {
      expect(item.manifest.kind).toBe("REVIEW_SNAPSHOT");
      expect(item.manifest.originalDecisionDate).toBeNull();
      const record = JSON.parse(new TextDecoder().decode(decodeFile(item.bundle.files.find(file => file.path === "record.json")!)));
      expect(record.outcome).toBe("under_review");
      expect(record.votes).toBeUndefined();
      expect(record.decisionDate).toBeUndefined();
      expect(archiveManifestSchema.safeParse({ ...item.manifest, originalDecisionDate: "2026-10-10" }).success).toBe(false);
      expect((await verifyArchivePackage(item.bundle, item.manifestHash)).manifestHash).toBe(item.manifestHash);
    }
  });
  it("rejects changing the status or budget in a preserved review package", async () => {
    const item = (await readReviewPackages())[0];
    const changed = structuredClone(item.bundle);
    const file = changed.files.find(file => file.path === "record.json")!;
    const record = JSON.parse(new TextDecoder().decode(decodeFile(file)));
    const contents = utf8(canonicalJson({ ...record, requestedUsd: 1, outcome: "approved" }));
    file.data = Buffer.from(contents).toString("base64");
    await expect(verifyArchivePackage(changed, item.manifestHash)).rejects.toThrow("File does not match");
    const manifest = structuredClone(item.manifest);
    const entry = manifest.files.find(file => file.path === "record.json")!;
    entry.sha256 = await sha256(contents); entry.bytes = contents.length;
    changed.manifest = canonicalJson(manifest);
    await expect(verifyArchivePackage(changed, item.manifestHash)).rejects.toThrow("Manifest does not match");
  });
});
