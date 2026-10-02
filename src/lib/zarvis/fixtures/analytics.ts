export const NOW = Date.UTC(2026, 9, 2, 12);
export const supplyFixture = () => ({
  heightReadAt: 3503367, minedZat: 100000000000, shieldedZat: 45000000000,
  partitionComplete: true, shieldedZatExcludes: ["lockbox"], asOf: NOW / 1000 - 15,
  pools: [
    { pool: "transparent", balanceZat: 50000000000 }, { pool: "sprout", balanceZat: 100000000 },
    { pool: "sapling", balanceZat: 9900000000 }, { pool: "orchard", balanceZat: 10000000000 },
    { pool: "lockbox", balanceZat: 5000000000 }, { pool: "ironwood", balanceZat: 25000000000 },
  ],
});
export const chainFixture = () => ({ height: 3503367, bestBlockHash: "a".repeat(64), lastBlockTimestamp: NOW / 1000 - 120, asOf: NOW / 1000 - 15 });
export const zecblockFixture = () => ({
  data: { chain: "main", blocks: 3503367, headers: 3503367, bestblockhash: "a".repeat(64),
    chainSupply: { chainValueZat: "100000000000", monitored: true },
    valuePools: supplyFixture().pools.map(p => ({ id: p.pool, chainValueZat: String(p.balanceZat), monitored: true })),
  },
  meta: { network: "mainnet", generatedAt: new Date(NOW - 15000).toISOString(), indexedHeight: 3503367, source: { observedAt: null } },
});
export const monthlyFixture = () => ({
  interval: "month", balanceBasis: "period-closing-at-top-height", coinbase: "excluded", asOf: NOW / 1000,
  range: { from: Date.UTC(2026, 8, 1) / 1000, to: Date.UTC(2026, 8, 1) / 1000 },
  points: [{ periodStart: Date.UTC(2026, 8, 1) / 1000, topHeight: 3501995,
    txs: { transparent: 100, mixed: 40, shielded: 60 },
    balances: { sprout: 100000000, sapling: 9900000000, orchard: 10000000000, ironwood: 25000000000 },
    netFlowZat: -200000000,
    fullyShieldedShare: { pct: 30, numerator: 60, denominator: 200 },
    poolTouchingShare: { pct: 50, numerator: 100, denominator: 200 },
  }],
});
export const responseFixture = (value: unknown, url = "https://api.shieldedscan.xyz/v1/supply") => ({ value, url, retrievedAt: new Date(NOW).toISOString() });
