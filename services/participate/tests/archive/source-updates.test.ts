// @vitest-environment node
import { buildSourceProposal, buildSourceUpdate, verifySourceProposal } from "@/lib/archive/source-proposals";
import { fingerprintSourceObservation, parseZcgSourceEvidence, sourceObservationOutcome, type SourceEvidence } from "@/lib/archive/source-updates";
import { canonicalJson, decodeFile, sha256, utf8 } from "@/lib/archive/format";

const capturedAt = "2026-10-12T15:00:00.000Z";
const url = "https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/99901";
const api = "https://api.github.com/repos/ZcashCommunityGrants/zcashcommunitygrants/issues";
const ready = [{ name: "📋 Grant Application", color: "BFBF4D", description: null }, { name: "👀 Ready For ZCG Review", color: "105556", description: "Ready" }];
const approved = { name: "✅ Grant Approved", color: "034613", description: "Application accepted" };
const issue = { number: 99901, html_url: url, title: "Wallet education pilot", user: { login: "applicant" },
  body: "# Exact source\r\n\r\n### Proposal Category\r\n\r\nEducation\r\n\r\nBudget remains submitted prose.\r\n",
  state: "open", created_at: "2026-10-08T10:00:00.000Z", updated_at: "2026-10-12T12:00:00.000Z", labels: ready };
const empty: SourceEvidence = { events: [], comments: [] };
const rawEvent = { id: 201, event: "labeled", url: `${api}/events/201`, created_at: "2026-10-12T12:00:00.000Z", actor: { id: 12, login: "maintainer" }, label: approved };
const rawComment = { id: 301, html_url: `${url}#issuecomment-301`, url: `${api}/comments/301`, created_at: "2026-10-12T12:00:00.000Z",
  updated_at: "2026-10-12T12:30:00.000Z", user: { id: 12, login: "maintainer" }, author_association: "MEMBER", body: "The application was approved.\r\n\r\nSee the published minutes." };
const evidence = () => parseZcgSourceEvidence(issue.number, [rawEvent], [rawComment]);

describe("official source revisions", () => {
  it("keeps V1 readable and appends a V2 approval with exact Markdown and associated source comments", async () => {
    const first = await buildSourceProposal(issue, issue.number, capturedAt);
    const second = await buildSourceUpdate({ ...issue, state: "closed", state_reason: "completed", labels: [...ready, approved] }, issue.number, capturedAt,
      { recordId: first.manifest.recordId, revision: first.manifest.revision, manifestHash: first.manifestHash }, evidence());
    expect(first.capture.schema).toBe("PARTICIPATE_SOURCE_CAPTURE_V1");
    expect((await verifySourceProposal(first.bundle, first.manifestHash)).manifest.revision).toBe(1);
    expect(second.manifest).toMatchObject({ kind: "SOURCE_PROPOSAL", revision: 2, previousManifestHash: first.manifestHash });
    expect(second.capture).toMatchObject({ schema: "PARTICIPATE_SOURCE_CAPTURE_V2", proposal: { outcome: "approved", state: "closed", requestedUsd: null },
      evidence: { comments: [{ body: rawComment.body, association: "MEMBER", author: { id: 12, login: "maintainer" } }] } });
    expect(new TextDecoder().decode(decodeFile(second.bundle.files[0]))).toBe(issue.body);
    if (second.capture.schema !== "PARTICIPATE_SOURCE_CAPTURE_V2") throw new Error("Expected V2");
    expect(second.capture.evidenceScope).toContain("not a committee membership or cryptographic signature");
    expect(second.capture).not.toHaveProperty("votes");
    expect((await verifySourceProposal(second.bundle, second.manifestHash)).capture).toEqual(second.capture);
  });

  it("creates initial V2 captures and preserves a historical archive identity when appending", async () => {
    const first = await buildSourceUpdate(issue, issue.number, capturedAt, null, empty);
    expect(first.manifest).toMatchObject({ recordId: "zcg-github-99901", revision: 1, previousManifestHash: null });
    const next = await buildSourceUpdate(issue, issue.number, capturedAt, { recordId: "zcg-historical-2026-09-28", revision: 1, manifestHash: "a".repeat(64) }, empty);
    expect(next.manifest).toMatchObject({ recordId: "zcg-historical-2026-09-28", revision: 2, previousManifestHash: "a".repeat(64) });
    expect(next.capture.source.issueNumber).toBe(issue.number);
  });

  it.each([
    ["closed", [], "closed"], ["open", ["❌ Grant Declined"], "rejected"], ["closed", ["Grant Withdrawn by Submitter"], "abandoned"],
    ["open", ["✅ Grant Approved"], "approved"], ["closed", ["✔️ Grant Complete"], "approved"],
    ["open", ["✅ Grant Approved", "❌ Grant Declined"], "closed"], ["open", ["A commenter says approved"], "under_review"]
  ] as const)("derives conservative source status %s / %j", (state, labels, expected) => {
    expect(sourceObservationOutcome(state, labels)).toBe(expected);
  });

  it("ignores title/body/public replies/time-only noise but detects status, labels, events and associated comment edits", async () => {
    const before = await fingerprintSourceObservation(issue, evidence());
    const noisy = { ...issue, title: "Edited title", body: "Edited Markdown", updated_at: "2026-10-12T14:00:00.000Z", labels: [...ready].reverse() };
    const withPublicReply = parseZcgSourceEvidence(issue.number, [rawEvent, { id: 299, event: "mentioned" }],
      [rawComment, { id: 399, author_association: "NONE", body: "Approve me" }]);
    expect(await fingerprintSourceObservation(noisy, withPublicReply)).toBe(before);
    expect(await fingerprintSourceObservation({ ...issue, state: "closed" }, evidence())).not.toBe(before);
    expect(await fingerprintSourceObservation({ ...issue, labels: [...ready, approved] }, evidence())).not.toBe(before);
    expect(await fingerprintSourceObservation(issue, parseZcgSourceEvidence(issue.number, [{ ...rawEvent, id: 202, url: `${api}/events/202`, event: "unlabeled" }], [rawComment]))).not.toBe(before);
    expect(await fingerprintSourceObservation(issue, parseZcgSourceEvidence(issue.number, [rawEvent], [{ ...rawComment, body: "Corrected decision text" }]))).not.toBe(before);
  });

  it("keeps A-B-A reversions distinct through their event history and predecessor hashes", async () => {
    const first = await buildSourceUpdate(issue, issue.number, capturedAt, null, empty);
    const second = await buildSourceUpdate({ ...issue, labels: [...ready, approved] }, issue.number, capturedAt,
      { recordId: first.manifest.recordId, revision: 1, manifestHash: first.manifestHash }, evidence());
    const removal = { ...rawEvent, id: 202, event: "unlabeled", url: `${api}/events/202` };
    const third = await buildSourceUpdate(issue, issue.number, capturedAt,
      { recordId: first.manifest.recordId, revision: 2, manifestHash: second.manifestHash }, parseZcgSourceEvidence(issue.number, [rawEvent, removal], [rawComment]));
    expect(third.manifest).toMatchObject({ revision: 3, previousManifestHash: second.manifestHash });
    expect(third.capture.proposal.outcome).toBe("under_review");
    expect(third.manifestHash).not.toBe(first.manifestHash);
  });

  it.each([
    { html_url: "https://github.com/other/repo/issues/99901" }, { number: 99902 }, { pull_request: {} },
    { updated_at: "2026-10-13T12:00:00.000Z" }, { labels: [...ready, ready[0]] }
  ])("refuses mismatched, future or invalid source updates: %j", async change => {
    await expect(buildSourceUpdate({ ...issue, ...change }, issue.number, capturedAt, null, empty)).rejects.toThrow();
  });

  it("rejects cross-issue comments, event origins and evidence dated after capture", async () => {
    expect(() => parseZcgSourceEvidence(issue.number, [], [{ ...rawComment, html_url: `${url}0#issuecomment-301` }])).toThrow();
    expect(() => parseZcgSourceEvidence(issue.number, [{ ...rawEvent, url: "https://api.github.com/repos/other/repo/issues/events/201" }], [])).toThrow();
    const future = parseZcgSourceEvidence(issue.number, [], [{ ...rawComment, updated_at: "2026-10-13T00:00:00.000Z" }]);
    await expect(buildSourceUpdate(issue, issue.number, capturedAt, null, future)).rejects.toThrow();
    const predatesIssue = parseZcgSourceEvidence(issue.number, [{ ...rawEvent, created_at: "2026-10-07T00:00:00.000Z" }], []);
    await expect(buildSourceUpdate(issue, issue.number, capturedAt, null, predatesIssue)).rejects.toThrow();
  });

  it("rejects a rehashed package with an observation fingerprint inconsistent with its source", async () => {
    const original = await buildSourceUpdate(issue, issue.number, capturedAt, null, empty);
    const changed = structuredClone(original.bundle);
    const file = changed.files.find(file => file.path === "source.json")!;
    const capture = JSON.parse(new TextDecoder().decode(decodeFile(file)));
    capture.observationHash = "0".repeat(64);
    const text = canonicalJson(capture); file.data = Buffer.from(text).toString("base64");
    const manifest = JSON.parse(changed.manifest), entry = manifest.files.find((row: { path: string }) => row.path === "source.json");
    entry.bytes = utf8(text).length; entry.sha256 = await sha256(utf8(text)); changed.manifest = canonicalJson(manifest);
    await expect(verifySourceProposal(changed, await sha256(utf8(changed.manifest)))).rejects.toThrow("fingerprint");
  });
});
