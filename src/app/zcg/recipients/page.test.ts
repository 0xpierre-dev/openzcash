import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/zcg/disbursements-repo", () => ({
  recipientTotals: async () => [
    { recipientKey: "unpaid", recipientName: "Unpaid grantee", externalUsdCents: 75000000n, externalZecZat: 0n,
      externalPaidUsdCents: 0n, externalPaidZecZat: 0n, externalPaymentCount: 0, externalLastPaid: null },
    { recipientKey: "paid", recipientName: "Paid grantee", externalUsdCents: 500000n, externalZecZat: 100000000n,
      externalPaidUsdCents: 500000n, externalPaidZecZat: 100000000n, externalPaymentCount: 1, externalLastPaid: "2026-08-01" },
    { recipientKey: "internal", recipientName: "Internal costs", externalUsdCents: 0n, externalZecZat: 0n,
      externalPaidUsdCents: 0n, externalPaidZecZat: 0n, externalPaymentCount: 0, externalLastPaid: null },
  ],
}));
vi.mock("@/lib/cache/memo", () => ({
  LEDGER_TTL_MS: 1,
  cached: async (_key: string, _ttl: number, loader: () => Promise<unknown>) => loader(),
}));
vi.mock("@/components/synced", () => ({ Synced: () => null }));
vi.mock("./recipients-table", () => ({ RecipientsTable: () => null }));

import Page from "./page";
import { RecipientsTable } from "./recipients-table";
import { Stat } from "@/components/ui";

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<Record<string, unknown>>(child)) return [];
    return [child, ...elements(child.props.children as ReactNode)];
  });
}

describe("recipient ranking", () => {
  it("ranks and totals only external paid entries while retaining unpaid budgets", async () => {
    const nodes = elements(await Page());
    const rows = nodes.find((node) => node.type === RecipientsTable)?.props.rows;
    expect(rows).toMatchObject([
      { recipientKey: "paid", rank: 1, _usd: 500000, _budgetedUsd: 500000, paymentCount: 1 },
      { recipientKey: "unpaid", rank: 2, _usd: 0, _budgetedUsd: 75000000, paymentCount: 0, lastPaid: "" },
    ]);
    const total = nodes.find((node) => node.type === Stat && node.props.label === "USD paid to date");
    expect(total?.props.value).toBe("$5K");
  });
});
