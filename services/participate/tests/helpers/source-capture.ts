import { SOURCE_EVIDENCE_SCOPE, type SourceCapture } from "@/lib/archive/source-proposals";

export function sourceCaptureFixture(): Extract<SourceCapture, { schema: "PARTICIPATE_SOURCE_CAPTURE_V2" }> {
  const url = "https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/99901";
  const labels = [{ name: "✅ Grant Approved", color: "087f23", description: "Approved" }];
  return {
    schema: "PARTICIPATE_SOURCE_CAPTURE_V2", checkedAt: "2026-10-12T12:00:00.000Z", observationHash: "b".repeat(64),
    sourceStateReason: "completed", evidenceScope: SOURCE_EVIDENCE_SCOPE,
    proposal: { id: "zcg-github-99901", issueNumber: 99901, title: "A preserved source proposal", applicant: "applicant", outcome: "approved", state: "closed",
      submittedAt: "2026-10-08T10:00:00.000Z", sourceUpdatedAt: "2026-10-12T11:00:00.000Z", requestedUsd: null,
      tags: [], labels: labels.map(label => label.name), proposalUrl: url },
    source: { recordId: "zcg-github-99901", issueNumber: 99901, url, title: "A preserved source proposal", state: "closed",
      updatedAt: "2026-10-12T11:00:00.000Z", category: null, labels },
    evidence: {
      events: [{ id: 701, event: "labeled", url: "https://api.github.com/repos/ZcashCommunityGrants/zcashcommunitygrants/issues/events/701",
        createdAt: "2026-10-12T10:00:00.000Z", actor: { id: 41, login: "source-maintainer" }, label: { name: labels[0].name, color: labels[0].color } }],
      comments: [{ id: 801, url: `${url}#issuecomment-801`, createdAt: "2026-10-12T10:00:00.000Z", updatedAt: "2026-10-12T11:00:00.000Z",
        author: { id: 41, login: "source-maintainer" }, association: "COLLABORATOR", body: "The application was approved. **Source rationale.**" }]
    }
  };
}
