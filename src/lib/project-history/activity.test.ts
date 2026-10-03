import { describe, expect, it } from "vitest";
import { monthlyProjectActivity } from "./activity";
import { buildProjectHistory } from "./build";
import type { FinanceRecords, HistoryEvent, HistoryIdentity, PaymentRecord } from "./types";

const source = { label: "Synthetic public ledger", url: "https://example.org/ledger", observedAt: "2026-10-02T12:00:00Z" };
const identity: HistoryIdentity = { id: "alpha", name: "Alpha", description: "Fixture", category: "Community", website: "https://example.org", project: null,
  communityId: "alpha", recipientKeys: ["alpha"], applicationTopics: [], reportTopics: [], repositories: [], checkedAt: "2026-09-08" };
const payment: PaymentRecord = { id: "paid", program: "zcg", project: "Alpha grant", recipientKey: "alpha", milestone: "1", deliverable: "A deliverable",
  isPaid: true, paidDate: "2026-09-03", budgetUsdCents: "12345", recordedZecZat: "100000000", source };
const work: HistoryEvent = { id: "release-a", kind: "release", title: "A release", detail: "Published, not accepted", date: "2026-09-30T23:59:59Z", evidence: "published_artifact", source, grantId: null };
const now = new Date("2026-10-02T12:00:00Z");
function make(rows = [payment], events = [work], month = "2026-09", available = true, identities = [identity]) {
  const finance: FinanceRecords = { proposals: [], payments: rows, proposalsAvailable: true, paymentsAvailable: available, importedAt: source.observedAt };
  const histories = identities.map(i => ({ ...buildProjectHistory(i, identities, finance, "2026-09-08", [], now), timeline: events }));
  return monthlyProjectActivity(histories, finance, month, now);
}

describe("monthly funding and work evidence", () => {
  it("uses payment dates and event dates separately across exact UTC boundaries", () => {
    const data = make([payment, { ...payment, id: "aug", paidDate: "2026-08-31", budgetUsdCents: "9900" }, { ...payment, id: "oct", paidDate: "2026-10-01", budgetUsdCents: "7700" }], [work, { ...work, id: "oct-report", kind: "report", date: "2026-10-01", detail: "September report published in October" }]);
    expect(data.ledger).toMatchObject({ paidEntries: 1, budgetUsdCents: "12345" });
    expect(data.projects[0].work.map(w => w.id)).toEqual([work.id]);
    expect(data.projects[0].amounts.budgetUsdCents).toBe("12345");
    expect(data.period).toMatchObject({ partial: false, endExclusive: "2026-10-01T00:00:00.000Z" });
  });
  it("does not infer historical funding from future payments, unpaid approvals or undated records", () => {
    for (const row of [{ ...payment, isPaid: false }, { ...payment, paidDate: "2026-10-01" }, { ...payment, paidDate: null }]) expect(make([row]).projects).toEqual([]);
    const fundedEarlier = make([{ ...payment, paidDate: "2026-08-01" }]);
    expect(fundedEarlier.coverage.fundedWithWork).toBe(1);
    expect(fundedEarlier.projects[0].amounts).toMatchObject({ paidEntries: 0, budgetUsdCents: null });
  });
  it("retains paid projects with missing work and excludes undated report links from activity", () => {
    const data = make([payment], [{ ...work, kind: "report", date: null }]);
    expect(data.coverage).toMatchObject({ fundedWithWork: 0, paidWithoutDatedWork: 1, workComplete: false });
    expect(data.projects[0].undatedWorkSources).toBe(1);
    expect(data.projects[0].work).toEqual([]);
  });
  it("deduplicates shared awards only in the complete ledger, without inventing project allocations", () => {
    const data = make([payment, payment, { ...payment, id: "unlinked", recipientKey: "other", project: "Other grant", budgetUsdCents: "100" }], [work], "2026-09", true, [identity, { ...identity, id: "beta", name: "Beta" }]);
    expect(data.projects).toHaveLength(2);
    expect(data.projects[0].sharedGrants).toHaveLength(1);
    expect(data.ledger).toMatchObject({ paidEntries: 2, budgetUsdCents: "12445" });
    expect(data.coverage.unassociatedPaymentEntries).toBe(1);
  });
  it("preserves refunds, missing values and financial-source failures", () => {
    const data = make([payment, { ...payment, id: "refund", budgetUsdCents: "-100", recordedZecZat: "-1000000" }, { ...payment, id: "unknown", budgetUsdCents: null, recordedZecZat: null }]);
    expect(data.ledger).toMatchObject({ budgetUsdCents: "12245", recordedZecZat: "99000000", missingUsd: 1, missingZec: 1 });
    expect(make([payment], [work], "2026-09", false)).toMatchObject({ ledger: null, projects: [], coverage: { paymentsAvailable: false, unassociatedPaymentEntries: null } });
  });
  it("bounds current-month data by the real cutoff and rejects impossible months", () => {
    const data = make([{ ...payment, paidDate: "2026-10-02" }, { ...payment, id: "future", paidDate: "2026-10-30" }], [{ ...work, date: "2026-10-01" }, { ...work, id: "later", date: "2026-10-03" }], "2026-10");
    expect(data.period).toMatchObject({ partial: true, cutoff: now.toISOString() });
    expect(data.ledger?.paidEntries).toBe(1);
    expect(data.projects[0].work).toHaveLength(1);
    for (const month of ["2026-13", "2026-11", "September", "2026-09-01"]) expect(() => make([payment], [work], month)).toThrow();
    expect(make([{ ...payment, paidDate: "2026-09-31" }]).coverage.paidEntriesWithoutValidDate).toBe(1);
  });
  it("does not attach an ambiguous proposal's payments to a project", () => {
    const proposal = { id: "a", program: "zcg" as const, title: payment.project, status: "approved", submittedDate: null, decisionDate: null, requestedUsdCents: null, platformLink: null, forumLink: null, source };
    const finance: FinanceRecords = { payments: [payment], proposals: [proposal, { ...proposal, id: "b" }], paymentsAvailable: true, proposalsAvailable: true, importedAt: source.observedAt };
    const history = { ...buildProjectHistory(identity, [identity], finance, "2026-09-08", [], now), timeline: [work] };
    const data = monthlyProjectActivity([history], finance, "2026-09", now);
    expect(data.projects).toEqual([]);
    expect(data.coverage.unassociatedPaymentEntries).toBe(1);
    expect(data.ledger?.paidEntries).toBe(1);
  });
});
