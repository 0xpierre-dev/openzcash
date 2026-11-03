# Zcash Network data

The `/zcash-network` dashboard reads `/api/network` every 30 seconds. Core chain data comes from [Zcash Info](https://api.zcashinfo.com/docs); activity and daily supply observations come from [ZecBlock](https://zecblock.com/docs). Each section retains its own observation time and freshness. A delayed or unavailable section makes the overall status partial without discarding other live sections.

## Halving projection

`src/lib/network/halving.ts` implements the discrete mainnet schedule from [ZIP 208](https://zips.z.cash/zip-0208), [ZIP 218](https://zips.z.cash/zip-0218), and the [ZIP 259 deployment constants](https://zips.z.cash/zip-0259). The source must report NU7 activation at **3,543,405** before the NU7 projection is used. That schedule targets 75-second blocks before activation and 25-second blocks from the activation block, with the third halving at **6,132,390** and subsequent intervals of **5,040,000** blocks.

Remaining blocks and the estimated UTC date use the latest observed block, not the indexer's tip. The date integrates the target spacing on each side of activation; actual mining cadence will change the estimate. Era progress follows ZIP 218's weighted subsidy interval. The projected subsidy uses integer zatoshi rounding and excludes NSM reissuance, so it is not calculated by halving the observed minted amount. Current block and miner subsidies remain source observations.

A missing NU7 activation retains the legacy 75-second schedule. An unrecognized upgrade before the projected halving, inconsistent target spacing, or unsupported historical height withholds the projection and displays an explicit waiting state. If the published activation or consensus rules change, verify the new rules and update the constants and boundary tests together.

## Inflation freshness

Annualized inflation requires two consecutive completed UTC daily supply observations, including Deferred Lockbox issuance. Intraday points and a following day's 00:00:01 observation do not substitute for a 23:59:59 daily close. When the latest full close is delayed, its value and date remain visible with a delay label, and the dashboard remains partial. This is independent of the halving projection.

## Validation

`npx vitest run src/lib/network` covers legacy and NU7 activation/halving boundaries, zatoshi rounding, inconsistent source data, caching, and delayed sections. Also check `/zcash-network` in light/dark themes and a narrow viewport, including the source link, period selection, and refresh control.
