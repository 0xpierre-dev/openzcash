import { sumAmounts } from "./build";
import type { FinanceRecords, HistoryEvent, PaymentRecord, ProjectHistory } from "./types";

export const validActivityMonth = (month: string) => /^20\d{2}-(?:0[1-9]|1[0-2])$/.test(month);
const WORK = new Set<HistoryEvent["kind"]>(["release", "report", "delivery", "integration", "usage"]);
function timestamp(date: string | null): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(date)) return null;
  const n = Date.parse(date);
  return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === date.slice(0, 10) ? n : null;
}
function amounts(rows: PaymentRecord[]) {
  const usd = sumAmounts(rows.map(row => row.budgetUsdCents));
  const zec = sumAmounts(rows.map(row => row.recordedZecZat));
  return { paidEntries: rows.length, budgetUsdCents: usd.known, recordedZecZat: zec.known,
    missingUsd: usd.missing, missingZec: zec.missing };
}

/** Join the complete public ledger to reviewed identities, never fuzzy names or truncated excerpts. */
export function monthlyProjectActivity(histories: ProjectHistory[], finance: FinanceRecords, month: string, now = new Date()) {
  if (!validActivityMonth(month) || month > now.toISOString().slice(0, 7)) throw new Error("Use a current or past YYYY-MM month.");
  const start = Date.parse(`${month}-01T00:00:00Z`);
  const endDate = new Date(start); endDate.setUTCMonth(endDate.getUTCMonth() + 1);
  const end = endDate.getTime(), cutoff = Math.min(end - 1, now.getTime());
  const beforeCutoff = (date: string | null) => { const n = timestamp(date); return n !== null && n <= cutoff; };
  const inPeriod = (date: string | null) => { const n = timestamp(date); return n !== null && n >= start && n <= cutoff; };
  const paid = finance.paymentsAvailable ? [...new Map(finance.payments.filter(row => row.isPaid).map(row => [row.id, row])).values()] : [];
  const periodPayments = paid.filter(row => inPeriod(row.paidDate));
  const associated = new Set<string>();
  const projects = histories.flatMap(history => {
    // Ambiguous award bindings are already withheld by buildProjectHistory.
    const linkedIds = new Set(history.grants.flatMap(grant => grant.milestones.filter(m => m.paymentRecorded).map(m => m.id)));
    const linked = paid.filter(row => linkedIds.has(row.id) && beforeCutoff(row.paidDate));
    const payments = linked.filter(row => inPeriod(row.paidDate));
    payments.forEach(row => associated.add(row.id));
    const work = history.timeline.filter(event => WORK.has(event.kind) && inPeriod(event.date));
    // A proposal/approval alone is not evidence that the project received funding.
    if (!linked.length || (!work.length && !payments.length)) return [];
    const sharedGrants = history.grants.filter(grant => grant.sharedWith.length && grant.milestones.some(m => payments.some(row => row.id === m.id)))
      .map(grant => ({ id: grant.id, title: grant.title, sharedWith: grant.sharedWith }));
    return [{ id: history.project.id, name: history.project.name,
      url: `https://openzcash.org/ecosystem/history/${history.project.id}?month=${month}`,
      amounts: amounts(payments), payments, work, sharedGrants,
      undatedWorkSources: history.timeline.filter(event => WORK.has(event.kind) && !event.date).length }];
  }).sort((a, b) => b.work.length - a.work.length || a.name.localeCompare(b.name));
  return {
    kind: "monthly_project_activity" as const, schemaVersion: 1,
    period: { month, start: new Date(start).toISOString(), endExclusive: endDate.toISOString(), cutoff: new Date(cutoff).toISOString(), partial: end > now.getTime(), timezone: "UTC" },
    assembledAt: now.toISOString(), ledgerImportedAt: finance.importedAt,
    repositorySnapshotAt: histories[0]?.repositorySnapshotAt ?? null,
    coverage: { ...{ proposalsAvailable: finance.proposalsAvailable, paymentsAvailable: finance.paymentsAvailable }, workComplete: false,
      profilesChecked: histories.length, fundedWithWork: projects.filter(p => p.work.length).length,
      paidWithoutDatedWork: projects.filter(p => !p.work.length).length,
      unassociatedPaymentEntries: finance.paymentsAvailable ? periodPayments.filter(row => !associated.has(row.id)).length : null,
      paidEntriesWithoutValidDate: finance.paymentsAvailable ? paid.filter(row => timestamp(row.paidDate) === null).length : null },
    // This is a ledger total, not a sum of project cards. Shared awards occur once here.
    ledger: finance.paymentsAvailable ? { ...amounts(periodPayments),
      programs: ["zcg", "coinholder"].map(program => ({ program, ...amounts(periodPayments.filter(row => row.program === program)) })) } : null,
    projects,
    notes: [
      "Cohort: projects with a dated paid ledger entry on or before the period cutoff, and dated work or a payment within the period. Undated funding does not establish historical eligibility.",
      "Work uses publication/event dates, payments use paid dates. A report published this month may describe earlier activity; retain its own stated coverage.",
      "USD is the historical budget value of entries marked paid, not bank settlement or current ZEC valuation. ZEC is the separately recorded disbursement column. Refunds retain their sign; missing values remain unknown.",
      "Shared grant amounts are associated amounts, not allocations to each project. Never add project cards. Unassociated ledger payments are retained in the ledger total.",
      "Work coverage is incomplete: a dated repository snapshot plus individually reviewed additions. Undated community report links are excluded from monthly work counts. Missing evidence is not proof of no work or non-delivery.",
      "A payment or release does not establish milestone acceptance, grant completion or causal impact. Only reviewed delivery records support acceptance statements.",
    ],
  };
}
export type MonthlyProjectActivity = ReturnType<typeof monthlyProjectActivity>;
