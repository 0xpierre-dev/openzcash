import "server-only";
import { z } from "zod";
import { readAnalytics, type AnalyticsResponse } from "./analytics-client";
import type { Evidence } from "./local";
import type { ZarvisSource } from "./types";

const POOLS = ["transparent", "sprout", "sapling", "orchard", "lockbox", "ironwood"] as const;
const MAX_ZAT = 2_100_000_000_000_000n;
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const height = integer.positive();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const amount = z.union([integer, z.string().regex(/^(0|[1-9]\d{0,15})$/)])
  .transform(String).refine(v => BigInt(v) <= MAX_ZAT);
const signedAmount = z.union([z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER), z.string().regex(/^-?(0|[1-9]\d{0,15})$/)])
  .transform(String).refine(v => BigInt(v) >= -MAX_ZAT && BigInt(v) <= MAX_ZAT);
const sum = (values: string[]) => values.reduce((a, b) => a + BigInt(b), 0n).toString();
const instant = (seconds: number, now: number) => {
  if (!Number.isSafeInteger(seconds) || seconds < 1477612800 || seconds * 1000 > now + 60_000) throw new Error("ANALYTICS_TIMESTAMP");
  return new Date(seconds * 1000).toISOString();
};
const shieldedSchema = z.object({
  heightReadAt: height, minedZat: amount, shieldedZat: amount, partitionComplete: z.literal(true), asOf: integer,
  shieldedZatExcludes: z.array(z.string()),
  pools: z.array(z.object({ pool: z.enum(POOLS), balanceZat: amount })).length(6),
});
const chainSchema = z.object({ height, bestBlockHash: hash, lastBlockTimestamp: integer, asOf: integer });
const zecblockSchema = z.object({
  data: z.object({
    chain: z.literal("main"), blocks: height, headers: height, bestblockhash: hash,
    chainSupply: z.object({ chainValueZat: amount, monitored: z.literal(true) }),
    valuePools: z.array(z.object({ id: z.enum(POOLS), chainValueZat: amount, monitored: z.literal(true) })).length(6),
  }),
  meta: z.object({ network: z.literal("mainnet"), generatedAt: z.iso.datetime(), indexedHeight: height,
    source: z.object({ observedAt: z.iso.datetime().nullable() }),
  }),
});
export type SupplyReading = {
  provider: "ShieldedScan" | "ZecBlock"; height: number; blockHash: string | null;
  totalZat: string; circulatingZat: string; shieldedZat: string; lockboxZat: string;
  pools: { pool: typeof POOLS[number]; balanceZat: string }[];
  reportedAt: string; retrievedAt: string; blockObservedAt: string | null;
  freshness: "current" | "stale" | "unknown"; sourceUrl: string;
};
function supplyTotals(pools: SupplyReading["pools"], totalZat: string) {
  if (new Set(pools.map(p => p.pool)).size !== POOLS.length || sum(pools.map(p => p.balanceZat)) !== totalZat) throw new Error("ANALYTICS_PARTITION");
  const lockboxZat = pools.find(p => p.pool === "lockbox")!.balanceZat;
  return { totalZat, lockboxZat, circulatingZat: (BigInt(totalZat) - BigInt(lockboxZat)).toString(),
    shieldedZat: sum(pools.filter(p => p.pool !== "transparent" && p.pool !== "lockbox").map(p => p.balanceZat)) };
}
export function normalizeSupply(provider: SupplyReading["provider"], response: AnalyticsResponse, chain?: unknown, now = Date.now()): SupplyReading {
  let result: Omit<SupplyReading, "freshness">;
  if (provider === "ShieldedScan") {
    const data = shieldedSchema.parse(response.value);
    const totals = supplyTotals(data.pools, data.minedZat);
    if (totals.shieldedZat !== data.shieldedZat || !data.shieldedZatExcludes.includes("lockbox")) throw new Error("ANALYTICS_SHIELDED_TOTAL");
    const tip = chainSchema.safeParse(chain);
    const aligned = tip.success && tip.data.height === data.heightReadAt;
    result = { provider, height: data.heightReadAt, blockHash: aligned ? tip.data.bestBlockHash : null,
      ...totals, pools: data.pools, reportedAt: instant(data.asOf, now), retrievedAt: response.retrievedAt,
      blockObservedAt: aligned ? instant(tip.data.lastBlockTimestamp, now) : null, sourceUrl: response.url };
  } else {
    const { data, meta } = zecblockSchema.parse(response.value);
    if (data.blocks !== meta.indexedHeight || data.headers - data.blocks > 2 || data.headers < data.blocks) throw new Error("ANALYTICS_INDEX_HEIGHT");
    const pools = data.valuePools.map(p => ({ pool: p.id, balanceZat: p.chainValueZat }));
    result = { provider, height: data.blocks, blockHash: data.bestblockhash, ...supplyTotals(pools, data.chainSupply.chainValueZat),
      pools, reportedAt: meta.generatedAt, retrievedAt: response.retrievedAt,
      blockObservedAt: meta.source.observedAt, sourceUrl: response.url };
  }
  for (const time of [result.reportedAt, result.retrievedAt, result.blockObservedAt].filter((v): v is string => v !== null)) {
    if (!Number.isFinite(Date.parse(time)) || Date.parse(time) > now + 60_000) throw new Error("ANALYTICS_TIMESTAMP");
  }
  const aged = now - Date.parse(result.reportedAt) > 10 * 60_000 || (result.blockObservedAt !== null && now - Date.parse(result.blockObservedAt) > 10 * 60_000);
  return { ...result, freshness: aged ? "stale" : result.blockObservedAt ? "current" : "unknown" };
}
export function compareSupply(readings: SupplyReading[]) {
  if (readings.length < 2) return { status: readings.length ? "single_source" : "unavailable", selected: readings[0] ?? null, differences: [] as string[] };
  const [a, b] = readings;
  const newer = a.height >= b.height ? a : b;
  if (a.height !== b.height) return { status: "different_heights", selected: newer, differences: [] as string[] };
  const differences = [
    ...(a.blockHash && b.blockHash && a.blockHash !== b.blockHash ? ["blockHash"] : []),
    ...POOLS.filter(pool => a.pools.find(p => p.pool === pool)!.balanceZat !== b.pools.find(p => p.pool === pool)!.balanceZat),
  ];
  // A missing hash cannot turn a known same-height amount disagreement into a usable balance.
  if (differences.length) return { status: "mismatch", selected: null, differences };
  return { status: !a.blockHash || !b.blockHash ? "unverified_hash" : "matched", selected: a, differences };
}

export const analyticsQuerySchema = z.object({
  metric: z.enum(["supply", "monthly_activity", "monthly_comparison"]),
  month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/).nullable(),
}).strict().refine(v => v.metric === "supply" ? v.month === null : v.month !== null);
export const analyticsTool = {
  type: "function" as const, name: "query_zcash_analytics", strict: true,
  description: "Read public Zcash chain analytics. supply: current six-pool balances, total issued and circulating supply (issued minus Lockbox), with ShieldedScan/ZecBlock reconciliation at the same height AND hash. month must be null. monthly_activity: one explicit YYYY-MM calendar month in UTC; transaction counts excluding coinbase, fully-shielded/pool-touching shares with denominators, pool closing balances and NET pool flow. monthly_comparison: compare that month with the previous calendar month using application-calculated changes, percentage-point changes and net flows. Only two closed months are comparable. Current months are partial. No arbitrary date ranges, gross shielding flows, private wallet histories or USD volumes. Preserve source timestamps, unknown freshness, mismatch and coverage limits. Never combine overlapping sources or invent missing totals.",
  parameters: { type: "object", properties: {
    metric: { type: "string", enum: ["supply", "monthly_activity", "monthly_comparison"] },
    month: { type: ["string", "null"], description: "YYYY-MM for a month or its comparison against the preceding month; null for supply" },
  }, required: ["metric", "month"], additionalProperties: false },
};
export function monthRange(month: string, now = Date.now()) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month) || month < "2016-10" || month > new Date(now).toISOString().slice(0, 7)) throw new Error("ANALYTICS_MONTH");
  const start = Date.parse(month + "-01T00:00:00Z");
  const next = new Date(start); next.setUTCMonth(next.getUTCMonth() + 1);
  return { from: start / 1000, to: next.getTime() / 1000 - 1, partial: now < next.getTime() };
}
const share = z.object({ pct: z.number().min(0).max(100).nullable(), numerator: integer, denominator: integer });
const monthlySchema = z.object({
  interval: z.literal("month"), balanceBasis: z.literal("period-closing-at-top-height"), coinbase: z.literal("excluded"), asOf: integer,
  points: z.array(z.object({
    periodStart: integer, topHeight: height,
    txs: z.object({ transparent: integer, mixed: integer, shielded: integer }),
    balances: z.object({ sprout: amount, sapling: amount, orchard: amount, ironwood: amount }),
    netFlowZat: signedAmount.nullable(), fullyShieldedShare: share, poolTouchingShare: share,
  })).length(1),
});
export function normalizeMonthly(response: AnalyticsResponse, month: string, now = Date.now()) {
  const range = monthRange(month, now), data = monthlySchema.parse(response.value), point = data.points[0];
  const reportedAt = instant(data.asOf, now);
  if (point.periodStart !== range.from || data.asOf < range.from || (!range.partial && data.asOf <= range.to)) throw new Error("ANALYTICS_MONTH_COVERAGE");
  const totalTransactions = point.txs.transparent + point.txs.mixed + point.txs.shielded;
  if (!Number.isSafeInteger(totalTransactions)) throw new Error("ANALYTICS_COUNT");
  function checkedShare(value: z.infer<typeof share>, numerator: number) {
    const percent = totalTransactions ? Math.round(numerator / totalTransactions * 10_000) / 100 : null;
    if (value.numerator !== numerator || value.denominator !== totalTransactions || (percent === null ? value.pct !== null : value.pct === null || Math.abs(value.pct - percent) > 0.011)) throw new Error("ANALYTICS_DENOMINATOR");
    return { percent, numerator, denominator: totalTransactions };
  }
  const poolClosings = Object.entries(point.balances).map(([pool, balanceZat]) => ({ pool, balanceZat }));
  if (BigInt(sum(poolClosings.map(p => p.balanceZat))) > MAX_ZAT) throw new Error("ANALYTICS_PARTITION");
  return { provider: "ShieldedScan", month, timezone: "UTC", periodStart: new Date(range.from * 1000).toISOString(),
    periodEnd: new Date((range.to + 1) * 1000).toISOString(), periodEndExclusive: true,
    periodStatus: range.partial ? "partial" : "closed", closingHeight: point.topHeight,
    transactions: point.txs, totalTransactions, coinbase: "excluded",
    fullyShielded: checkedShare(point.fullyShieldedShare, point.txs.shielded),
    poolTouching: checkedShare(point.poolTouchingShare, point.txs.shielded + point.txs.mixed),
    poolClosings, netFlowZat: point.netFlowZat, reportedAt, retrievedAt: response.retrievedAt,
    sourceUrl: response.url, stale: now - data.asOf * 1000 > 10 * 60_000,
    coverage: "Publisher's indexed calendar-month aggregate; no independent count reconciliation. Closing balances are not averages. Net flow is not gross shielding volume. Partial months are not comparable to closed months.",
  };
}
export type MonthlyReading = ReturnType<typeof normalizeMonthly>;
export function previousMonth(month: string) {
  const date = new Date(month + "-01T00:00:00Z");
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}
/** Arithmetic, not generated prose. A partial period never gets a closed-month growth rate. */
export function compareMonths(previous: MonthlyReading, current: MonthlyReading) {
  const percent = (before: number, after: number) => before > 0 ? Math.round((after - before) / before * 10_000) / 100 : null;
  const shareChange = (before: number | null, after: number | null) => before === null || after === null ? null : Math.round((after - before) * 100) / 100;
  const previousShieldedZat = sum(previous.poolClosings.map(p => p.balanceZat)), currentShieldedZat = sum(current.poolClosings.map(p => p.balanceZat));
  const netFlowMatchesClosings = current.netFlowZat === null ? null
    : BigInt(currentShieldedZat) - BigInt(previousShieldedZat) === BigInt(current.netFlowZat);
  const comparable = previous.periodStatus === "closed" && current.periodStatus === "closed"
    && previous.month === previousMonth(current.month) && previous.closingHeight < current.closingHeight
    && netFlowMatchesClosings !== false;
  return { previous, current, comparable,
    netFlowMatchesClosings,
    changes: comparable ? {
      transactions: { previous: previous.totalTransactions, current: current.totalTransactions,
        delta: current.totalTransactions - previous.totalTransactions, changePercent: percent(previous.totalTransactions, current.totalTransactions) },
      fullyShielded: { previousPercent: previous.fullyShielded.percent, currentPercent: current.fullyShielded.percent,
        changePercentagePoints: shareChange(previous.fullyShielded.percent, current.fullyShielded.percent) },
      poolTouching: { previousPercent: previous.poolTouching.percent, currentPercent: current.poolTouching.percent,
        changePercentagePoints: shareChange(previous.poolTouching.percent, current.poolTouching.percent) },
      closingShielded: { previousZat: previousShieldedZat, currentZat: currentShieldedZat,
        deltaZat: (BigInt(currentShieldedZat) - BigInt(previousShieldedZat)).toString(),
        changePercent: percent(Number(previousShieldedZat), Number(currentShieldedZat)) },
    } : null,
    interpretation: "Changes are descriptive, not causal. Percent change differs from percentage-point change. No growth rate when the baseline is zero. Transactions do not measure unique users or hidden transfer volume; grant payments, project delivery and network adoption require separate evidence.",
  };
}
export type MonthlyComparison = ReturnType<typeof compareMonths>;
const source = (title: string, r: AnalyticsResponse): ZarvisSource => ({ title, url: r.url, retrievedAt: r.retrievedAt });
/** Normalize only validated fields; no remote prose is promoted into tool instructions. */
export async function lookupChainAnalytics(args: unknown, signal: AbortSignal): Promise<Evidence> {
  signal.throwIfAborted();
  const parsed = analyticsQuerySchema.safeParse(args);
  if (!parsed.success) return { content: JSON.stringify({ error: "Invalid analytics query. Use supply with month null, or monthly_activity/monthly_comparison with one YYYY-MM." }) };
  const sources: ZarvisSource[] = [];
  try {
    if (parsed.data.metric !== "supply") {
      const month = parsed.data.month!;
      monthRange(month);
      const months = parsed.data.metric === "monthly_comparison" ? [previousMonth(month), month] : [month];
      const readings = await Promise.all(months.map(async selectedMonth => {
        const response = await readAnalytics("shieldedMonthly", signal, monthRange(selectedMonth));
        return { response, monthly: normalizeMonthly(response, selectedMonth) };
      }));
      for (const r of readings) sources.push(source("ShieldedScan · " + r.monthly.month + " chain activity", r.response));
      return { content: JSON.stringify({ data: parsed.data.metric === "monthly_comparison"
        ? { metric: "monthly_comparison", comparison: compareMonths(readings[0].monthly, readings[1].monthly) }
        : { metric: "monthly_activity", monthly: readings[0].monthly } }), sources };
    }
    const results = await Promise.allSettled([
      readAnalytics("shieldedSupply", signal), readAnalytics("shieldedChain", signal), readAnalytics("zecblockSupply", signal),
    ]);
    signal.throwIfAborted();
    const readings: SupplyReading[] = [], unavailable: string[] = [];
    for (const [index, provider] of [[0, "ShieldedScan"], [2, "ZecBlock"]] as const) {
      const response = results[index];
      try {
        if (response.status !== "fulfilled") throw new Error("ANALYTICS_UNAVAILABLE");
        readings.push(normalizeSupply(provider, response.value, results[1].status === "fulfilled" ? results[1].value.value : undefined));
        sources.push(source(provider + " · supply pools", response.value));
      } catch { unavailable.push(provider); }
    }
    if (results[1].status === "fulfilled" && readings.some(r => r.provider === "ShieldedScan" && r.blockHash)) sources.push(source("ShieldedScan · chain tip", results[1].value));
    const comparison = compareSupply(readings);
    return { content: JSON.stringify({ data: { metric: "supply", ...comparison, readings, unavailable,
      definitions: "All amounts are exact zatoshis. Total is issued supply; circulating is issued minus the unspendable Lockbox, not an exchange estimate. Shielded excludes transparent and Lockbox. Two explorer reads are not proof of independent upstream infrastructure. Never average mismatches; no canonical total is selected for a mismatch. Different heights are not a confirmed match. Unknown or stale freshness is not live confirmation.",
    } }), sources };
  } catch {
    signal.throwIfAborted();
    return { content: JSON.stringify({ error: "Chain analytics unavailable, invalid, rate-limited or outside supported calendar months. Missing data is not zero; do not substitute a different period." }), sources };
  }
}
