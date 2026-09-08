import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  selections: [] as Record<string, unknown>[],
  rows: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/db/client", () => ({
  getDb: () => ({
    select: (fields: Record<string, unknown>) => {
      state.selections.push(fields);
      const query = {
        from: () => query,
        where: () => query,
        groupBy: () => query,
        orderBy: () => query,
        limit: () => query,
        then: (resolve: (rows: typeof state.rows) => unknown) =>
          Promise.resolve(state.rows).then(resolve),
      };
      return query;
    },
  }),
}));

import { disbursementsSummary, recipientTotals } from "./disbursements-repo";

function sqlFor(field: string): string {
  const expression = state.selections[0][field];
  expect(expression, `${field} must be selected`).toBeDefined();
  return new PgDialect().sqlToQuery(expression as SQL).sql;
}

function recipient(overrides: Record<string, unknown> = {}) {
  return {
    recipientKey: "example",
    recipientName: "Example",
    usdCents: "75000000",
    zecZat: "0",
    paidUsdCents: "0",
    paidZecZat: "0",
    externalUsdCents: "75000000",
    externalZecZat: "0",
    externalPaidUsdCents: "0",
    externalPaidZecZat: "0",
    grantCount: 1,
    paymentCount: 0,
    externalPaymentCount: 0,
    lineCount: 5,
    isInternal: false,
    hasInternal: false,
    lastPaid: null,
    externalLastPaid: null,
    ...overrides,
  };
}

beforeEach(() => {
  state.selections = [];
  state.rows = [];
});

describe("recipient payment accounting", () => {
  it("also restricts homepage paid totals to settled entries", async () => {
    await disbursementsSummary();
    for (const field of ["usdPaidCents", "zecPaidZat"]) {
      expect(sqlFor(field)).toMatch(/filter \(where .*"is_paid"\)/);
    }
  });

  it("filters paid USD and ZEC at the database boundary", async () => {
    await recipientTotals();
    for (const field of ["paidUsdCents", "paidZecZat"]) {
      expect(sqlFor(field)).toMatch(/filter \(where .*"is_paid"\)/);
    }
    for (const field of [
      "externalPaidUsdCents",
      "externalPaidZecZat",
      "externalPaymentCount",
      "externalLastPaid",
    ]) {
      expect(sqlFor(field)).toContain('"is_paid"');
      expect(sqlFor(field)).toContain('not "zcg_disbursements"."is_internal"');
    }
  });

  it("preserves a budget without presenting it as a payment", async () => {
    state.rows = [recipient()];
    const [result] = await recipientTotals();
    expect(result.usdCents).toBe(75000000n);
    expect(result).toMatchObject({
      paidUsdCents: 0n,
      externalPaidUsdCents: 0n,
      externalPaymentCount: 0,
      externalLastPaid: null,
    });
  });

  it("merges alias payments without mixing in internal stipends", async () => {
    state.rows = [
      recipient({
        recipientKey: "pgp for crypto, llc",
        recipientName: "PGP for Crypto, LLC",
        paidUsdCents: "12500",
        externalPaidUsdCents: "12500",
        paidZecZat: "300000000",
        externalPaidZecZat: "300000000",
        paymentCount: 1,
        externalPaymentCount: 1,
        lastPaid: "2026-07-01",
        externalLastPaid: "2026-07-01",
      }),
      recipient({
        recipientKey: "pgp for crypto (paul brigner)",
        recipientName: "pgp for crypto (paul brigner)",
        usdCents: "2500",
        externalUsdCents: "0",
        paidUsdCents: "2500",
        paidZecZat: "100000000",
        paymentCount: 1,
        grantCount: 0,
        isInternal: true,
        hasInternal: true,
        lastPaid: "2026-08-01",
      }),
    ];
    const results = await recipientTotals();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      paidUsdCents: 15000n,
      paidZecZat: 400000000n,
      externalPaidUsdCents: 12500n,
      externalPaidZecZat: 300000000n,
      paymentCount: 2,
      externalPaymentCount: 1,
      lastPaid: "2026-08-01",
      externalLastPaid: "2026-07-01",
    });
  });
});
