// @vitest-environment node
import { NextRequest } from "next/server";
import { readPilotPackages } from "@/lib/archive/catalog";
import { canonicalJson } from "@/lib/archive/format";
import { archiveProofFixture } from "@/tests/helpers/archive-proof";

const { readRevision } = vi.hoisted(() => ({ readRevision: vi.fn() }));
vi.mock("@/lib/services/proposal-archives", () => ({ readArchiveRevision: readRevision }));
import { GET } from "@/app/api/communities/[communityId]/archives/[recordId]/revisions/[revision]/route";

const item = (await readPilotPackages())[0];
const request = (file = "", revision = "1", communityId = "dao-a") => GET(new NextRequest(`http://localhost/api/download${file ? `?file=${encodeURIComponent(file)}` : ""}`), {
  params: Promise.resolve({ communityId, recordId: item.manifest.recordId, revision })
});

describe("public revision downloads", () => {
  beforeEach(() => { readRevision.mockReset(); readRevision.mockResolvedValue({ ...item, packageJson: canonicalJson(item.bundle), anchors: [] }); });
  afterEach(() => vi.useRealTimers());
  it("downloads exact committed bytes with safe noncached response headers", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(canonicalJson(item.bundle));
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toContain(`${item.manifest.recordId}-r1.zvoice.json`);
    const markdown = await request("proposal.md");
    expect(await markdown.text()).toBe(Buffer.from(item.bundle.files.find(file => file.path === "proposal.md")!.data, "base64").toString("utf8"));
  });
  it("makes instructions available but refuses to fabricate a chain receipt", async () => {
    expect(await (await request("VERIFY.md")).text()).toContain(item.manifestHash);
    const response = await request("verification.json");
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "CHAIN_RECEIPT_UNAVAILABLE" });
  });
  it("downloads exact source evidence bytes from the selected revision and rejects absent source files", async () => {
    expect((await request("source.json", "1")).status).toBe(404);
    const source = '{"preserved":"source evidence"}\n';
    readRevision.mockResolvedValue({ ...item, bundle: { ...item.bundle, files: [...item.bundle.files, { path: "source.json", encoding: "base64", data: Buffer.from(source).toString("base64") }] }, anchors: [] });
    const response = await request("source.json", "2");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(source);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("content-disposition")).toContain("-r2-source.json");
    expect(readRevision).toHaveBeenLastCalledWith("dao-a", item.manifest.recordId, 2);
  });
  it("exports only a receipt bound to the requested revision", async () => {
    const f = archiveProofFixture(); vi.useFakeTimers(); vi.setSystemTime(f.now);
    readRevision.mockResolvedValue({ ...f.revision, anchors: [f.anchor] });
    const response = await request("verification.json");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ schema: "ZVOICE_ARCHIVE_RECEIPT_V1", manifestHash: f.revision.manifestHash });
    f.revision.manifest.revision = 2;
    expect((await request("verification.json")).status).toBe(409);
  });
  it("keeps lookup community-scoped and returns not found for missing revisions", async () => {
    readRevision.mockResolvedValue(null);
    expect((await request("", "2", "dao-b")).status).toBe(404);
    expect(readRevision).toHaveBeenCalledWith("dao-b", item.manifest.recordId, 2);
  });
  it("does not expose storage errors or return an unvalidated package", async () => {
    readRevision.mockRejectedValue(new Error("private database address and invalid stored package"));
    const response = await request();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "ARCHIVE_DOWNLOAD_UNAVAILABLE" });
  });
  it.each(["../proposal.md", "wallet.json", "attachments/secret.txt"])("rejects unsupported file selection %s", async file => {
    expect((await request(file)).status).toBe(404);
    expect(readRevision).not.toHaveBeenCalled();
  });
  it.each(["0", "-1", "1e2", "01", "10001"])("rejects invalid revision %s", async revision => {
    expect((await request("", revision)).status).toBe(404);
    expect(readRevision).not.toHaveBeenCalled();
  });
});
