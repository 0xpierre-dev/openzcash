import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { normalizeSupply, compareSupply, normalizeMonthly, monthRange, analyticsQuerySchema, compareMonths, previousMonth } from "./chain-analytics";
import { analyticsAnswer, directAnalyticsQuery } from "./analytics-answer";
import { isFinancialEvidence, numericFacts, PROTOCOL_FACTS, unsupportedFigures } from "./grounding";
import { NOW, supplyFixture, chainFixture, zecblockFixture, monthlyFixture, responseFixture } from "./fixtures/analytics";
afterEach(() => vi.useRealTimers());
const primary = () => normalizeSupply("ShieldedScan", responseFixture(supplyFixture()), chainFixture(), NOW);
const secondary = () => normalizeSupply("ZecBlock", responseFixture(zecblockFixture(), "https://api.zecblock.com/v1/network/blockchain-info"), undefined, NOW);
// Individually valid accounting at the same height, but 460 rather than 450 ZEC shielded.
const conflictingSecondary = () => {
  const data = zecblockFixture();
  data.data.valuePools.find(p => p.id === "transparent")!.chainValueZat = "49000000000";
  data.data.valuePools.find(p => p.id === "orchard")!.chainValueZat = "11000000000";
  return normalizeSupply("ZecBlock", responseFixture(data), undefined, NOW);
};
const supplyEvidence = (readings: ReturnType<typeof primary>[]) => ({
  content: JSON.stringify({ data: { metric: "supply", ...compareSupply(readings), readings } }),
});

describe("Supply accounting and reconciliation", () => {
  it("keeps exact six-pool totals, dates and the Lockbox distinction", () => {
    const reading = primary();
    expect(reading).toMatchObject({ totalZat: "100000000000", circulatingZat: "95000000000", shieldedZat: "45000000000", lockboxZat: "5000000000", freshness: "current" });
    expect(reading.blockObservedAt).not.toBe(reading.reportedAt);
    expect(secondary().freshness).toBe("unknown");
    expect(compareSupply([reading, secondary()]).status).toBe("matched");
  });
  it.each(["duplicate", "sum", "fraction", "negative", "shielded", "missing", "partition", "future"])("rejects invalid primary accounting: %s", kind => {
    const data = supplyFixture();
    if (kind === "duplicate") data.pools[0].pool = "sprout";
    if (kind === "sum") data.minedZat++;
    if (kind === "fraction") data.pools[0].balanceZat += 0.5;
    if (kind === "negative") data.pools[0].balanceZat = -1;
    if (kind === "shielded") data.shieldedZat++;
    if (kind === "missing") data.pools.pop();
    if (kind === "partition") data.partitionComplete = false;
    if (kind === "future") data.asOf += 1000;
    expect(() => normalizeSupply("ShieldedScan", responseFixture(data), chainFixture(), NOW)).toThrow();
  });
  it.each(["network", "height", "lag", "unmonitored", "precision"])("rejects unusable secondary readings: %s", kind => {
    const data = zecblockFixture();
    if (kind === "network") data.meta.network = "testnet";
    if (kind === "height") data.meta.indexedHeight++;
    if (kind === "lag") data.data.headers += 3;
    if (kind === "unmonitored") data.data.valuePools[0].monitored = false;
    if (kind === "precision") data.data.chainSupply.chainValueZat = "9007199254740993";
    expect(() => normalizeSupply("ZecBlock", responseFixture(data), undefined, NOW)).toThrow();
  });
  it("never compares different heights as a match or averages a disagreement", () => {
    const a = primary(), b = secondary();
    b.height++;
    expect(compareSupply([a, b])).toMatchObject({ status: "different_heights", selected: b });
    b.height--;
    b.blockHash = "b".repeat(64);
    expect(compareSupply([a, b])).toMatchObject({ status: "mismatch", selected: null, differences: ["blockHash"] });
    b.blockHash = a.blockHash; b.pools[0].balanceZat = "49999999999";
    expect(compareSupply([a, b])).toMatchObject({ status: "mismatch", selected: null, differences: ["transparent"] });
    a.blockHash = null;
    expect(compareSupply([a, secondary()]).status).toBe("unverified_hash");
    expect(compareSupply([secondary()]).status).toBe("single_source");
    expect(compareSupply([])).toMatchObject({ status: "unavailable", selected: null });
  });
  it("does not attach a tip hash to a different-height supply read", () => {
    const tip = chainFixture(); tip.height++;
    const data = normalizeSupply("ShieldedScan", responseFixture(supplyFixture()), tip, NOW);
    expect(data).toMatchObject({ blockHash: null, blockObservedAt: null, freshness: "unknown" });
  });
  it.each(["primary", "secondary", "both"])("withholds conflicting same-height amounts when the %s hash is missing", missing => {
    const a = primary(), b = conflictingSecondary();
    if (missing !== "secondary") a.blockHash = null;
    if (missing !== "primary") b.blockHash = null;
    expect(compareSupply([a, b])).toMatchObject({ status: "mismatch", selected: null, differences: ["transparent", "orchard"] });
    expect(analyticsAnswer(supplyEvidence([a, b]), "en")).toContain("could not establish one verified balance");
  });
  it.each(["primary", "secondary", "both"])("preserves the unverified fallback for agreeing amounts when the %s hash is missing", missing => {
    const a = primary(), b = secondary();
    if (missing !== "secondary") a.blockHash = null;
    if (missing !== "primary") b.blockHash = null;
    expect(compareSupply([a, b])).toMatchObject({ status: "unverified_hash", selected: a, differences: [] });
  });
  it("a new retrieval cannot hide an old block or source response", () => {
    const tip = chainFixture(); tip.lastBlockTimestamp -= 3600;
    expect(normalizeSupply("ShieldedScan", responseFixture(supplyFixture()), tip, NOW).freshness).toBe("stale");
    expect(normalizeSupply("ZecBlock", responseFixture(zecblockFixture()), undefined, NOW + 3600000).freshness).toBe("stale");
  });
});
describe("Supply reconciliation in the financial guard", () => {
  it.each(["same", "missing", "competing"])("does not promote rejected readings with %s hashes into numeric facts", hashes => {
    const a = primary(), b = conflictingSecondary();
    if (hashes === "missing") a.blockHash = null;
    if (hashes === "competing") b.blockHash = "b".repeat(64);
    const evidence = supplyEvidence([a, b]);
    expect(isFinancialEvidence([evidence])).toBe(true);
    const facts = numericFacts([evidence]);
    expect(facts).toEqual(PROTOCOL_FACTS);
    expect(unsupportedFigures("Shielded: 450 ZEC or 460 ZEC.", facts)).toEqual(["450 ZEC", "460 ZEC"]);
  });
  it.each(["matched", "single_source", "unverified_hash", "different_heights"])("retains only the selected reading for %s supply", status => {
    const a = primary(), b = status === "different_heights" ? conflictingSecondary() : secondary();
    if (status === "unverified_hash") a.blockHash = null;
    if (status === "different_heights") a.height++;
    const evidence = supplyEvidence(status === "single_source" ? [a] : [a, b]);
    expect(JSON.parse(evidence.content).data.status).toBe(status);
    const facts = numericFacts([evidence]);
    expect(unsupportedFigures("Shielded: 450 ZEC. Circulating: 950 ZEC. Lockbox: 50 ZEC.", facts)).toEqual([]);
    expect(unsupportedFigures("Shielded: 460 ZEC.", facts)).toEqual(["460 ZEC"]);
  });
  it("keeps other evidence and reviewed documents usable when supply is rejected", () => {
    const evidence = [supplyEvidence([primary(), conflictingSecondary()]), { content: JSON.stringify({ data: { quote: { cents: 12345 }, treasuryZec: 321, changePercent: 7.3 } }) }];
    const facts = numericFacts(evidence, [{ text: "A reviewed example uses 678 ZEC." }]);
    expect(unsupportedFigures("$123.45, 321 ZEC, 7.3%, 678 ZEC and 21 million ZEC.", facts)).toEqual([]);
    expect(unsupportedFigures("450 ZEC and 460 ZEC", facts)).toEqual(["450 ZEC", "460 ZEC"]);
  });
  it("does not collect supply figures when no reading was selected", () => {
    expect(numericFacts([supplyEvidence([])])).toEqual(PROTOCOL_FACTS);
  });
});
describe("Calendar-month metrics", () => {
  it("preserves the actual denominator, signed net flow and UTC closing basis", () => {
    const data = normalizeMonthly(responseFixture(monthlyFixture()), "2026-09", NOW);
    expect(data).toMatchObject({ periodStatus: "closed", timezone: "UTC", periodStart: "2026-09-01T00:00:00.000Z", periodEnd: "2026-10-01T00:00:00.000Z", netFlowZat: "-200000000", totalTransactions: 200, fullyShielded: { percent: 30 }, poolTouching: { percent: 50 } });
  });
  it.each(["empty", "duplicate", "wrong-month", "numerator", "denominator", "percentage", "coinbase", "premature"])("fails closed for misleading monthly data: %s", kind => {
    const data = monthlyFixture();
    if (kind === "empty") data.points = [];
    if (kind === "duplicate") data.points.push(data.points[0]);
    if (kind === "wrong-month") data.points[0].periodStart = Date.UTC(2026, 7, 1) / 1000;
    if (kind === "numerator") data.points[0].fullyShieldedShare.numerator++;
    if (kind === "denominator") data.points[0].poolTouchingShare.denominator--;
    if (kind === "percentage") data.points[0].fullyShieldedShare.pct = 55;
    if (kind === "coinbase") data.coinbase = "included";
    if (kind === "premature") data.asOf = Date.UTC(2026, 8, 29) / 1000;
    expect(() => normalizeMonthly(responseFixture(data), "2026-09", NOW)).toThrow();
  });
  it("keeps current months partial and null net flow unavailable", () => {
    const data = monthlyFixture(); data.points[0].periodStart = Date.UTC(2026, 9, 1) / 1000;
    const result = normalizeMonthly(responseFixture({ ...data, points: [{ ...data.points[0], netFlowZat: null }] }), "2026-10", NOW);
    expect(result).toMatchObject({ periodStatus: "partial", netFlowZat: null });
    expect(analyticsAnswer({ content: JSON.stringify({ data: { metric: "monthly_activity", monthly: result } }) }, "pt")).toMatch(/mês parcial[\s\S]*Fluxo líquido indisponível/);
    expect(() => monthRange("2026-11", NOW)).toThrow();
    expect(() => monthRange("2026-02-01", NOW)).toThrow();
  });
  it("distinguishes an empty measured month from unavailable percentages", () => {
    const data = monthlyFixture();
    data.points[0].txs = { transparent: 0, mixed: 0, shielded: 0 };
    const result = normalizeMonthly(responseFixture({ ...data, points: [{ ...data.points[0], fullyShieldedShare: { pct: null, numerator: 0, denominator: 0 }, poolTouchingShare: { pct: null, numerator: 0, denominator: 0 } }] }), "2026-09", NOW);
    expect(result.fullyShielded.percent).toBeNull();
  });
  it("feeds signed ZEC amounts and both percentages into the financial guard", () => {
    const evidence = { content: JSON.stringify({ data: { metric: "monthly_activity", monthly: normalizeMonthly(responseFixture(monthlyFixture()), "2026-09", NOW) } }) };
    expect(isFinancialEvidence([evidence])).toBe(true);
    const facts = numericFacts([evidence]);
    expect(unsupportedFigures("Net flow: -2 ZEC. Fully shielded: 30%. Pool touching: 50%.", facts)).toEqual([]);
    expect(unsupportedFigures("Net flow: 987654 ZEC. Fully shielded: 99.9%.", facts)).toHaveLength(2);
  });
});
describe("Narrow routing and tool boundary", () => {
  it("routes a comparison to application arithmetic and handles year boundaries", () => {
    expect(directAnalyticsQuery("Compare atividade mensal de setembro 2026.")).toEqual({ metric: "monthly_comparison", month: "2026-09" });
    expect(previousMonth("2026-01")).toBe("2025-12");
    expect(directAnalyticsQuery("Compare monthly activity for last month.", NOW)).toEqual({ metric: "monthly_comparison", month: "2026-09" });
    expect(directAnalyticsQuery("Compare monthly activity for last month.", Date.UTC(2026, 0, 31))).toEqual({ metric: "monthly_comparison", month: "2025-12" });
    expect(directAnalyticsQuery("Mostre atividade mensal do mês passado.", NOW)).toEqual({ metric: "monthly_activity", month: "2026-09" });
  });
  it.each(["How much ZEC is in shielded pools?", "Quanto ZEC está em cada pool?", "Qual é a oferta circulante de ZEC?", "¿Cuál es la oferta total de Zcash?"])("recognizes current supply: %s", q => {
    expect(directAnalyticsQuery(q)).toEqual({ metric: "supply", month: null });
  });
  it.each(["Show monthly activity for 2026-09.", "Mostre atividade mensal de setembro 2026.", "Muestra actividad mensual de septiembre 2026"])("resolves an explicit month: %s", q => {
    expect(directAnalyticsQuery(q)).toEqual({ metric: "monthly_activity", month: "2026-09" });
  });
  it.each(["What are shielded pools?", "What is the ZCG balance?", "How much ZEC was shielded in 2025?", "Show monthly activity for September", "Compare supply and grant spending", "Show monthly activity for 2026-09 and 2026-08", "How much ZEC is in shielded pools? Also explain migrations."])("preserves the wider question for synthesis: %s", q => expect(directAnalyticsQuery(q)).toBeUndefined());
  it.each([{ metric: "supply", month: "2026-09" }, { metric: "monthly_activity", month: null }, { metric: "supply", month: null, url: "https://private/" }, { metric: "migration", month: null }])("rejects unsupported query: %j", q => expect(analyticsQuerySchema.safeParse(q).success).toBe(false));
  it.each(["en", "pt", "es"] as const)("shows reconciliation and sources in %s", lang => {
    const readings = [primary(), secondary()];
    const text = analyticsAnswer({ content: JSON.stringify({ data: { metric: "supply", ...compareSupply(readings), readings } }), sources: [{ title: "ShieldedScan", url: "https://shieldedscan.xyz" }, { title: "ZecBlock", url: "https://zecblock.com" }] }, lang);
    expect(text).toContain("950 ZEC"); expect(text).toContain("Lockbox"); expect(text).toContain("UTC"); expect(text).toContain("https://zecblock.com");
    expect(text).not.toMatch(/undefined|NaN/);
  });
});
describe("Comparisons are calculations with explicit eligibility", () => {
  const september = () => normalizeMonthly(responseFixture(monthlyFixture()), "2026-09", NOW);
  const august = () => {
    const data = monthlyFixture(); data.points[0].periodStart = Date.UTC(2026, 7, 1) / 1000;
    data.points[0].topHeight = 3467590;
    return normalizeMonthly(responseFixture(data), "2026-08", NOW);
  };
  it("separates relative growth from percentage points and computes exact balance differences", () => {
    const current = september(), previous = august();
    previous.totalTransactions = 100;
    previous.fullyShielded.percent = 20;
    previous.poolClosings[0].balanceZat = "50000000";
    current.netFlowZat = "50000000";
    const comparison = compareMonths(previous, current);
    expect(comparison).toMatchObject({ comparable: true, changes: { transactions: { delta: 100, changePercent: 100 }, fullyShielded: { changePercentagePoints: 10 }, closingShielded: { deltaZat: "50000000" } } });
    const evidence = { content: JSON.stringify({ data: { metric: "monthly_comparison", comparison } }) };
    expect(isFinancialEvidence([evidence])).toBe(true);
    expect(unsupportedFigures("Transaction growth was 100%. The balance increased by 0.5 ZEC.", numericFacts([evidence]))).toEqual([]);
    const text = analyticsAnswer(evidence, "pt");
    expect(text).toContain("+10 pp"); expect(text).toContain("Transações não são usuários únicos");
  });
  it("does not turn zero or partial baselines into confident growth claims", () => {
    const previous = august(), current = september();
    current.netFlowZat = "0";
    previous.totalTransactions = 0;
    expect(compareMonths(previous, current).changes?.transactions.changePercent).toBeNull();
    current.periodStatus = "partial";
    expect(compareMonths(previous, current)).toMatchObject({ comparable: false, changes: null });
    current.periodStatus = "closed"; previous.month = "2026-07";
    expect(compareMonths(previous, current)).toMatchObject({ comparable: false, changes: null });
  });
  it("withholds a comparison when month-end balances contradict the reported net flow", () => {
    const previous = august(), current = september();
    expect(compareMonths(previous, current)).toMatchObject({ comparable: false, changes: null, netFlowMatchesClosings: false });
    current.netFlowZat = null;
    expect(compareMonths(previous, current)).toMatchObject({ comparable: true, netFlowMatchesClosings: null });
  });
});
