import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { parseMayaSnapshot } from "./import-snapshots";

const TAB = `Project,Amount (USD),Transferred,ZEC Transferred,USD Transferred,ZEC/USD,,"KPIs as of September 16, 2026 UTC:",
Maya Multi-Sig ,"$1,000.00",30 Jun 2025,25.5,,39.22,,USD Value in Wallet,"$106,577"
Maya Multi-Sig ,"$99,000.00",30 Jun 2025,2554.84,,38.75,,ZEC ,223.97
,,,,,,,CACAO,"1,748,043.20"
,,,,,,,Total Fee Revenue,
,,,,,,,,
,,,,,,,Current Value of ZEC transferred (,"$3,718,244.14"
,,,,,,,Gain/Loss (USD Value),"-$3,611,667"
`;

describe("parseMayaSnapshot", () => {
  it("reads the KPI block that sits to the right of the transfers table", () => {
    const snap = parseMayaSnapshot(parseCsv(TAB), "1024670602", new Date("2026-09-20T00:00:00Z"));
    expect(snap.usdCashBalanceCents).toBe(10_657_700n);
    expect(snap.zecBalanceZat).toBe(22_397_000_000n);
    expect(snap.usdValueOfZecCents).toBe(371_824_414n);
    expect(snap.status).toBe("kpis as of september 16, 2026");
  });
});
