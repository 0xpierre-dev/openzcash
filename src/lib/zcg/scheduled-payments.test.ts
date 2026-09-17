import { describe, expect, it } from "vitest";
import {
  scheduledPayments,
  validDay,
  type ScheduleRow,
} from "./scheduled-payments";
const row = (overrides: Partial<ScheduleRow> = {}): ScheduleRow => ({
  id: "a",
  project: "Project",
  sourceSheet: "grants_disbursed",
  grantStatus: "open",
  isPaid: false,
  isTest: false,
  isInternal: false,
  estimatedPayoutDate: "2026-10-01",
  amountUsdCents: 101n,
  category: "Infrastructure",
  ...overrides,
});
const today = "2026-09-17";
describe("scheduled payment accounting", () => {
  it("reconciles exact cents across categories and months without rounding", () => {
    const s = scheduledPayments(
      [
        row(),
        row({
          id: "b",
          amountUsdCents: 9007199254740993n,
          category: "Wallets",
          estimatedPayoutDate: "2026-11-01",
        }),
        row({ id: "c", amountUsdCents: 99n }),
      ],
      today,
    );
    expect(s.totalCents).toBe(9007199254741193n);
    expect(s.byCategory.reduce((a, r) => a + r.cents, 0n)).toBe(s.totalCents);
    expect(s.byMonth.reduce((a, r) => a + r.cents, 0n)).toBe(s.totalCents);
  });
  it.each([
    "cancelled",
    "keyholder_veto",
    "funds_returned",
    "rejected",
    "withdrawn",
    "pending",
    "",
  ])("excludes unapproved or blocked status %s", (grantStatus) => {
    expect(scheduledPayments([row({ grantStatus })], today).rows).toHaveLength(
      0,
    );
  });
  it("blocks all milestones when another row records cancellation", () => {
    expect(
      scheduledPayments(
        [row(), row({ id: "b", grantStatus: "cancelled", isPaid: true })],
        today,
      ).totalCents,
    ).toBe(0n);
  });
  it("does not infer payments from tests, internal transfers or other sheets", () => {
    const s = scheduledPayments(
      [
        row({ isPaid: true }),
        row({ isTest: true }),
        row({ isInternal: true }),
        row({ sourceSheet: "monthly" }),
      ],
      today,
    );
    expect(s.rows).toHaveLength(0);
  });
  it("includes today, separates past estimates and preserves unknown amounts", () => {
    const s = scheduledPayments(
      [
        row({ id: "today", estimatedPayoutDate: today }),
        row({ id: "past", estimatedPayoutDate: "2026-09-16" }),
        row({ id: "none", estimatedPayoutDate: null }),
        row({ id: "unknown", amountUsdCents: null }),
        row({ id: "clawback", amountUsdCents: -10n }),
      ],
      today,
    );
    expect(s.rows.map((r) => r.id)).toEqual(["today"]);
    expect(s).toMatchObject({
      totalCents: 101n,
      overdue: 1,
      undated: 1,
      unknownAmount: 1,
      nonpositive: 1,
    });
  });
  it("filters the same population for the table, total and both breakdowns", () => {
    const s = scheduledPayments(
      [
        row(),
        row({ id: "b", category: "Wallets" }),
        row({ id: "c", estimatedPayoutDate: "2026-11-01" }),
      ],
      today,
      { from: "2026-10-01", to: "2026-10-31", category: "Infrastructure" },
    );
    expect(s.rows.map((r) => r.id)).toEqual(["a"]);
    expect(s.totalCents).toBe(101n);
    expect(s.byMonth).toHaveLength(1);
  });
  it("rejects invalid dates and never reclassifies past estimates as future", () => {
    expect(validDay("2026-02-30")).toBe(false);
    expect(validDay("soon")).toBe(false);
    const s = scheduledPayments(
      [
        row({ estimatedPayoutDate: "2026-02-30" }),
        row({ estimatedPayoutDate: "2026-09-16" }),
      ],
      today,
      { from: "2026-01-01" },
    );
    expect(s.totalCents).toBe(0n);
    expect(s.undated).toBe(1);
    expect(s.overdue).toBe(1);
  });
});
