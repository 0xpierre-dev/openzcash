// @vitest-environment node
import { NextRequest } from "next/server";
import { readPilotPackages } from "@/lib/archive/catalog";
import { buildSourceUpdate } from "@/lib/archive/source-proposals";
import { sourceCaptureFixture } from "@/tests/helpers/source-capture";
const { readRevision } = vi.hoisted(() => ({ readRevision: vi.fn() }));
vi.mock("@/lib/services/proposal-archives", () => ({ readArchiveRevision: readRevision }));
import { GET } from "@/app/api/communities/[communityId]/archives/[recordId]/route";
const item = (await readPilotPackages())[0];
const request = (revision = "", communityId = "dao-a") => GET(new NextRequest(`http://localhost/api/record${revision ? `?revision=${revision}` : ""}`), { params: Promise.resolve({ communityId, recordId: item.manifest.recordId }) });
beforeEach(() => { readRevision.mockReset(); readRevision.mockResolvedValue({ ...item, revision: 1, anchors: [], privateConfig: "must not leak", archive: { revisions: [{ revision: 1, createdAt: new Date("2026-10-09T00:00:00Z") }] } }); });
it("serves public preserved contents without raw storage fields or invented chain proof", async () => {
  const result = await request(); const body = await result.json();
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(body.record).toMatchObject({ revision: 1, manifestHash: item.manifestHash, proof: { verified: false, label: "Not anchored", hasReceipt: false } });
  expect(body.record.markdown).toContain(item.manifest.title);
  expect(JSON.stringify(body)).not.toContain("must not leak"); expect(body.record.packageJson).toBeUndefined();
});
it("scopes the lookup to the requested community and revision", async () => {
  readRevision.mockResolvedValue(null);
  expect((await request("2", "dao-b")).status).toBe(404);
  expect(readRevision).toHaveBeenCalledWith("dao-b", item.manifest.recordId, 2);
});
it.each(["0", "01", "-1", "10001", "abc"])("rejects invalid revision %s before touching storage", async revision => {
  expect((await request(revision)).status).toBe(404); expect(readRevision).not.toHaveBeenCalled();
});
it("fails closed when stored files cannot be verified", async () => {
  readRevision.mockRejectedValue(new Error("private storage error"));
  const result = await request(); expect(result.status).toBe(503); expect(await result.json()).toEqual({ error: "ARCHIVE_UNAVAILABLE" });
});
it("returns verified source status and provenance from the requested revision without inferring signed votes", async () => {
  const capture = sourceCaptureFixture();
  const update = await buildSourceUpdate({ number: capture.proposal.issueNumber, html_url: capture.proposal.proposalUrl, title: capture.proposal.title,
    body: "# Application\n\nPreserved application body.", state: capture.proposal.state, state_reason: capture.sourceStateReason,
    created_at: capture.proposal.submittedAt, updated_at: capture.proposal.sourceUpdatedAt, user: { login: capture.proposal.applicant }, labels: capture.source.labels },
  capture.proposal.issueNumber, capture.checkedAt, { recordId: capture.proposal.id, revision: 1, manifestHash: "a".repeat(64) }, capture.evidence);
  readRevision.mockResolvedValue({ ...update, revision: 2, anchors: [], archive: { revisions: [{ revision: 2, createdAt: new Date(capture.checkedAt) }, { revision: 1, createdAt: new Date(capture.proposal.submittedAt) }] } });
  const response = await request("2");
  expect(response.status).toBe(200);
  const { record } = await response.json();
  expect(record.sourceCapture).toMatchObject({ schema: "PARTICIPATE_SOURCE_CAPTURE_V2", proposal: { outcome: "approved" }, evidence: capture.evidence });
  expect(record.revisions.map((revision: { revision: number }) => revision.revision)).toEqual([2, 1]);
  expect(record.proof.verified).toBe(false);
  expect(record.votes).toBeUndefined();
});
