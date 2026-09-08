import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/zcg/disbursements-repo", () => ({
  listDisbursements: async () => [{
    id: "example", recipientNameRaw: "Example", project: "Example project",
    sourceSheet: "grants_disbursed", sourceSheetGid: "803214474", sourceRowIndex: 183,
    importedAt: new Date("2026-09-08T01:00:00Z"), amountUsdCents: 250000n,
    zecDisbursedZat: null, isPaid: false,
  }],
}));
vi.mock("@/lib/cache/memo", () => ({
  LEDGER_TTL_MS: 1,
  cached: async (_key: string, _ttl: number, loader: () => Promise<unknown>) => loader(),
}));
import { GET } from "./route";

describe("disbursement record provenance", () => {
  it("preserves legacy amounts and includes the exact source row and collection timestamp", async () => {
    const response = await GET(new Request("https://example.test/api/zcg/data/disbursements"));
    const json = await response.json();
    expect(json).toMatchObject({ count: 1, total: 1 });
    expect(json.data[0]).toMatchObject({
      amountUsd: 2500, isPaid: false,
      sourceSheetGid: "803214474", sourceRow: 184,
      sourceUrl: expect.stringMatching(/#gid=803214474&range=A184$/),
      importedAt: "2026-09-08T01:00:00.000Z",
    });
  });

  it("includes provenance in CSV exports", async () => {
    const response = await GET(new Request("https://example.test/api/zcg/data/disbursements?format=csv"));
    const csv = await response.text();
    expect(csv.split("\n")[0]).toContain("sourceRow,sourceUrl,importedAt");
    expect(csv).toContain("#gid=803214474&range=A184");
  });
});
