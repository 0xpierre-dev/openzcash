import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { zcgDisbursementOverrides, zcgDisbursements } from "@/lib/db/schema";
import { canonicalRecipient, isAliasName } from "./recipient-aliases";

export type DisbRow = typeof zcgDisbursements.$inferSelect;

/** Ids of disbursements the admin has corrected (for the "edited" badge). */
export async function overriddenDisbursementIds(): Promise<Set<string>> {
  const rows = await getDb()
    .select({ id: zcgDisbursementOverrides.disbursementId })
    .from(zcgDisbursementOverrides);
  return new Set(rows.map((r) => r.id));
}

export type DisbFilters = {
  sheet?: string;
  type?: string;
  grant?: string;
  category?: string;
  search?: string;
  limit?: number;
};

/** WHERE clauses shared by the list and its aggregate, so both describe the
 *  same population. `month` (YYYY-MM) narrows by paid-out month. */
function disbConds(opts: DisbFilters & { month?: string }) {
  const conds = [];
  if (opts.sheet) conds.push(eq(zcgDisbursements.sourceSheet, opts.sheet));
  if (opts.type) conds.push(eq(zcgDisbursements.disbursementType, opts.type));
  if (opts.grant) conds.push(eq(zcgDisbursements.project, opts.grant));
  if (opts.category) conds.push(eq(zcgDisbursements.category, opts.category));
  if (opts.month) {
    conds.push(
      sql`${zcgDisbursements.paidOutDate}::text like ${`${opts.month}-%`}`,
    );
  }
  if (opts.search) {
    // Topic search: match recipient, project title, OR milestone label — a
    // search for "BTCPay" must find "Payment Gateway with BTCPay" (recipient
    // Hanh), not just rows whose recipient contains the term.
    const term = `%${opts.search}%`;
    conds.push(
      or(
        ilike(zcgDisbursements.recipientNameRaw, term),
        ilike(zcgDisbursements.project, term),
        ilike(zcgDisbursements.milestoneLabel, term),
      )!,
    );
  }
  return conds;
}

export async function listDisbursements(
  opts: DisbFilters = {},
): Promise<DisbRow[]> {
  const conds = disbConds(opts);
  return getDb()
    .select()
    .from(zcgDisbursements)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(
      sql`${zcgDisbursements.paidOutDate} desc nulls last`,
      desc(zcgDisbursements.importedAt),
    )
    .limit(opts.limit ?? 250);
}

export type DisbSelectionSummary = {
  /** Rows matching the filters, regardless of the list's row limit. */
  count: number;
  paidCount: number;
  /** Budgeted USD of paid entries. */
  usdPaidCents: bigint;
  zecPaidZat: bigint;
};

/** Totals over the SAME filtered population as `listDisbursements`, without
 *  the row limit, so a KPI tile never sums a truncated window of the ledger. */
export async function summarizeDisbursements(
  opts: Omit<DisbFilters, "limit"> & { month?: string } = {},
): Promise<DisbSelectionSummary> {
  const conds = disbConds(opts);
  const [r] = await getDb()
    .select({
      count: sql<number>`count(*)::int`,
      paidCount: sql<number>`count(*) filter (where ${zcgDisbursements.isPaid})::int`,
      usdPaidCents: sql<string>`coalesce(sum(${zcgDisbursements.amountUsdCents}) filter (where ${zcgDisbursements.isPaid}),0)`,
      zecPaidZat: sql<string>`coalesce(sum(${zcgDisbursements.zecDisbursedZat}) filter (where ${zcgDisbursements.isPaid}),0)`,
    })
    .from(zcgDisbursements)
    .where(conds.length ? and(...conds) : undefined);
  return {
    count: r?.count ?? 0,
    paidCount: r?.paidCount ?? 0,
    usdPaidCents: BigInt(r?.usdPaidCents ?? "0"),
    zecPaidZat: BigInt(r?.zecPaidZat ?? "0"),
  };
}

export type RecipientTotal = {
  recipientKey: string;
  recipientName: string;
  usdCents: bigint;
  zecZat: bigint;
  /** Recorded settled payments; USD is the budgeted value of paid entries. */
  paidUsdCents: bigint;
  paidZecZat: bigint;
  /** Nº de grants (projetos distintos) — não confundir com pagamentos. */
  grantCount: number;
  /** Nº de pagamentos efetivados (milestones pagos). */
  paymentCount: number;
  /** Nº de linhas no ledger (milestones + outros desembolsos). */
  lineCount: number;
  isInternal: boolean;
  lastPaid: string | null;
  /** Totais SOMENTE das linhas de ecossistema (exclui stipend/ops internos).
   * Quem acumula os dois papéis — membro do comitê que também mantém um
   * projeto financiado, como hanh — precisa aparecer nos rankings públicos
   * pelo valor de grant, sem que o stipend mensal o esconda por inteiro. */
  externalUsdCents: bigint;
  externalZecZat: bigint;
  externalPaidUsdCents: bigint;
  externalPaidZecZat: bigint;
  externalPaymentCount: number;
  externalLastPaid: string | null;
  /** Linhas internas existem para este recebedor (stipend, ops). */
  hasInternal: boolean;
};

export async function recipientTotals(): Promise<RecipientTotal[]> {
  const db = getDb();
  const rows = await db
    .select({
      recipientKey: zcgDisbursements.recipientKey,
      recipientName: sql<string>`max(${zcgDisbursements.recipientNameRaw})`,
      usdCents: sql<string>`coalesce(sum(${zcgDisbursements.amountUsdCents}),0)`,
      zecZat: sql<string>`coalesce(sum(${zcgDisbursements.zecDisbursedZat}),0)`,
      paidUsdCents: sql<string>`coalesce(sum(${zcgDisbursements.amountUsdCents}) filter (where ${zcgDisbursements.isPaid}),0)`,
      paidZecZat: sql<string>`coalesce(sum(${zcgDisbursements.zecDisbursedZat}) filter (where ${zcgDisbursements.isPaid}),0)`,
      grantCount: sql<number>`count(distinct ${zcgDisbursements.project}) filter (where ${zcgDisbursements.sourceSheet} in ('grants_disbursed','coinholder_grants'))::int`,
      paymentCount: sql<number>`count(*) filter (where ${zcgDisbursements.isPaid})::int`,
      lineCount: sql<number>`count(*)::int`,
      isInternal: sql<boolean>`bool_and(${zcgDisbursements.isInternal})`,
      hasInternal: sql<boolean>`bool_or(${zcgDisbursements.isInternal})`,
      externalUsdCents: sql<string>`coalesce(sum(${zcgDisbursements.amountUsdCents}) filter (where not ${zcgDisbursements.isInternal}),0)`,
      externalZecZat: sql<string>`coalesce(sum(${zcgDisbursements.zecDisbursedZat}) filter (where not ${zcgDisbursements.isInternal}),0)`,
      externalPaidUsdCents: sql<string>`coalesce(sum(${zcgDisbursements.amountUsdCents}) filter (where ${zcgDisbursements.isPaid} and not ${zcgDisbursements.isInternal}),0)`,
      externalPaidZecZat: sql<string>`coalesce(sum(${zcgDisbursements.zecDisbursedZat}) filter (where ${zcgDisbursements.isPaid} and not ${zcgDisbursements.isInternal}),0)`,
      externalPaymentCount: sql<number>`count(*) filter (where ${zcgDisbursements.isPaid} and not ${zcgDisbursements.isInternal})::int`,
      externalLastPaid: sql<
        string | null
      >`max(${zcgDisbursements.paidOutDate}) filter (where ${zcgDisbursements.isPaid} and not ${zcgDisbursements.isInternal})`,
      lastPaid: sql<
        string | null
      >`max(${zcgDisbursements.paidOutDate}) filter (where ${zcgDisbursements.isPaid})`,
    })
    .from(zcgDisbursements)
    .groupBy(zcgDisbursements.recipientKey)
    .orderBy(sql`sum(${zcgDisbursements.amountUsdCents}) desc nulls last`);

  const mapped = rows.map((r) => ({
    recipientKey: r.recipientKey,
    recipientName: r.recipientName,
    usdCents: BigInt(r.usdCents),
    zecZat: BigInt(r.zecZat),
    paidUsdCents: BigInt(r.paidUsdCents),
    paidZecZat: BigInt(r.paidZecZat),
    grantCount: r.grantCount,
    paymentCount: r.paymentCount,
    lineCount: r.lineCount,
    isInternal: r.isInternal,
    lastPaid: r.lastPaid,
    externalUsdCents: BigInt(r.externalUsdCents),
    externalZecZat: BigInt(r.externalZecZat),
    externalPaidUsdCents: BigInt(r.externalPaidUsdCents),
    externalPaidZecZat: BigInt(r.externalPaidZecZat),
    externalPaymentCount: r.externalPaymentCount,
    externalLastPaid: r.externalLastPaid,
    hasInternal: r.hasInternal,
  }));

  // Fold curated aliases: the sheet spells the same grantee differently
  // across years and tabs (NightHawk/Nighthawk, RedDev/RED.DEV INC), which
  // would otherwise split one grantee into two half-sized rows.
  const merged = new Map<string, RecipientTotal>();
  for (const r of mapped) {
    const name = canonicalRecipient(r.recipientName);
    const prev = merged.get(name);
    if (!prev) {
      merged.set(name, { ...r, recipientName: name });
      continue;
    }
    merged.set(name, {
      ...prev,
      // Keep the canonical row's key so existing detail links stay valid.
      recipientKey: isAliasName(r.recipientName)
        ? prev.recipientKey
        : r.recipientKey,
      usdCents: prev.usdCents + r.usdCents,
      zecZat: prev.zecZat + r.zecZat,
      paidUsdCents: prev.paidUsdCents + r.paidUsdCents,
      paidZecZat: prev.paidZecZat + r.paidZecZat,
      externalUsdCents: prev.externalUsdCents + r.externalUsdCents,
      externalZecZat: prev.externalZecZat + r.externalZecZat,
      externalPaidUsdCents: prev.externalPaidUsdCents + r.externalPaidUsdCents,
      externalPaidZecZat: prev.externalPaidZecZat + r.externalPaidZecZat,
      externalPaymentCount: prev.externalPaymentCount + r.externalPaymentCount,
      externalLastPaid:
        (prev.externalLastPaid ?? "") >= (r.externalLastPaid ?? "")
          ? prev.externalLastPaid
          : r.externalLastPaid,
      grantCount: prev.grantCount + r.grantCount,
      paymentCount: prev.paymentCount + r.paymentCount,
      lineCount: prev.lineCount + r.lineCount,
      isInternal: prev.isInternal && r.isInternal,
      hasInternal: prev.hasInternal || r.hasInternal,
      lastPaid:
        (prev.lastPaid ?? "") >= (r.lastPaid ?? "")
          ? prev.lastPaid
          : r.lastPaid,
    });
  }

  return [...merged.values()].sort((a, b) =>
    b.usdCents > a.usdCents ? 1 : b.usdCents < a.usdCents ? -1 : 0,
  );
}

export type CategoryTotal = {
  category: string;
  usdCents: bigint;
  count: number;
};

export type ZcgSummary = {
  /** Nº de linhas no ledger (milestones + IC + mensais + discricionários). */
  count: number;
  /** Nº de grants distintos (projetos). */
  grantCount: number;
  paidCount: number;
  recipientCount: number;
  usdTotalCents: bigint;
  zecTotalZat: bigint;
  usdPaidCents: bigint;
  zecPaidZat: bigint;
  byCategory: CategoryTotal[];
  bySheet: { sheet: string; count: number }[];
};

export async function disbursementsSummary(): Promise<ZcgSummary> {
  const db = getDb();

  const [totals] = await db
    .select({
      count: sql<number>`count(*)::int`,
      grantCount: sql<number>`count(distinct ${zcgDisbursements.project}) filter (where ${zcgDisbursements.sourceSheet} in ('grants_disbursed','coinholder_grants'))::int`,
      paidCount: sql<number>`count(*) filter (where ${zcgDisbursements.isPaid})::int`,
      recipientCount: sql<number>`count(distinct ${zcgDisbursements.recipientKey}) filter (where not ${zcgDisbursements.isInternal})::int`,
      usdTotalCents: sql<string>`coalesce(sum(${zcgDisbursements.amountUsdCents}),0)`,
      zecTotalZat: sql<string>`coalesce(sum(${zcgDisbursements.zecDisbursedZat}),0)`,
      usdPaidCents: sql<string>`coalesce(sum(${zcgDisbursements.amountUsdCents}) filter (where ${zcgDisbursements.isPaid}),0)`,
      zecPaidZat: sql<string>`coalesce(sum(${zcgDisbursements.zecDisbursedZat}) filter (where ${zcgDisbursements.isPaid}),0)`,
    })
    .from(zcgDisbursements);

  const byCategory = await db
    .select({
      category: sql<string>`coalesce(${zcgDisbursements.category},'(uncategorized)')`,
      usdCents: sql<string>`coalesce(sum(${zcgDisbursements.amountUsdCents}),0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(zcgDisbursements)
    .where(sql`not ${zcgDisbursements.isInternal}`)
    .groupBy(sql`coalesce(${zcgDisbursements.category},'(uncategorized)')`)
    .orderBy(sql`sum(${zcgDisbursements.amountUsdCents}) desc nulls last`)
    .limit(12);

  const bySheet = await db
    .select({
      sheet: zcgDisbursements.sourceSheet,
      count: sql<number>`count(*)::int`,
    })
    .from(zcgDisbursements)
    .groupBy(zcgDisbursements.sourceSheet)
    .orderBy(sql`count(*) desc`);

  return {
    count: totals?.count ?? 0,
    grantCount: totals?.grantCount ?? 0,
    paidCount: totals?.paidCount ?? 0,
    recipientCount: totals?.recipientCount ?? 0,
    usdTotalCents: BigInt(totals?.usdTotalCents ?? "0"),
    zecTotalZat: BigInt(totals?.zecTotalZat ?? "0"),
    usdPaidCents: BigInt(totals?.usdPaidCents ?? "0"),
    zecPaidZat: BigInt(totals?.zecPaidZat ?? "0"),
    byCategory: byCategory.map((c) => ({
      category: c.category,
      usdCents: BigInt(c.usdCents),
      count: c.count,
    })),
    bySheet,
  };
}
