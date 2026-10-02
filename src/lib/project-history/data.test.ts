import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ select: vi.fn(), where: vi.fn(), proposals: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({ select: mocks.select }) }));
vi.mock("@/lib/zcg/proposals-repo", () => ({ listProposals: mocks.proposals }));
import { invalidate } from "@/lib/cache/memo";
import { readHistoryFinance } from "./data";

const importedAt = new Date("2026-10-01T15:00:00Z");
beforeEach(() => {
  vi.clearAllMocks(); invalidate("project-history");
  mocks.select.mockImplementation(() => ({ from: () => ({ where: mocks.where }) }));
  mocks.where.mockResolvedValue([{ id: "p1", sheet: "grants_disbursed", project: "Alpha", recipientKey: "alpha", milestone: "1", deliverable: null, isPaid: true, paidDate: "2026-09-03", budgetUsdCents: 12345n, recordedZecZat: -1n, gid: "803214474", row: 2, importedAt }]);
  mocks.proposals.mockResolvedValue([{ id: "a1", program: "zcg", title: "Alpha", status: "pending", decisionDate: null, submittedDate: "2026-09-01", requestedUsdCents: null, platformLink: null, forumLink: null, sourceSheetGid: "1164534734", sourceRowIndex: 2, importedAt }]);
});
describe("project history public financial adapter", () => {
  it("uses the published proposal projection, selects only public fields, and excludes test/internal/operations rows in SQL", async () => {
    const result = await readHistoryFinance();
    expect(mocks.proposals).toHaveBeenCalledOnce();
    expect(result.proposals[0].status).toBe("pending");
    expect(result.payments[0]).toMatchObject({ budgetUsdCents: "12345", recordedZecZat: "-1", source: { url: expect.stringContaining("range=A3") } });
    const projection = Object.keys(mocks.select.mock.calls[0][0]);
    expect(projection).not.toContain("recipientId");
    expect(projection).not.toContain("locked");
    const sql = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(sql.sql).toContain('"is_test"');
    expect(sql.sql).toContain('"is_internal"');
    expect(sql.params).toEqual([false, false, "grants_disbursed", "coinholder_grants"]);
  });
  it("keeps the available proposal source when the payment source fails", async () => {
    mocks.where.mockRejectedValue(new Error("private database failure detail"));
    const result = await readHistoryFinance();
    expect(result).toMatchObject({ paymentsAvailable: false, proposalsAvailable: true, payments: [] });
    expect(JSON.stringify(result)).not.toContain("private database failure");
  });
  it("coalesces concurrent reads and caches only public source records", async () => {
    const records = await Promise.all([readHistoryFinance(), readHistoryFinance(), readHistoryFinance()]);
    expect(records[0]).toEqual(records[1]);
    expect(mocks.where).toHaveBeenCalledOnce();
    await readHistoryFinance();
    expect(mocks.where).toHaveBeenCalledOnce();
  });
});
