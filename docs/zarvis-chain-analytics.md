# Public chain analytics

Zarvis owns the routing, validation, reconciliation and answer layer. Public data comes from [ShieldedScan](https://shieldedscan.xyz/api-docs) and [ZecBlock](https://zecblock.com/docs), through fixed, keyless HTTPS GET endpoints. The integration does not call either explorer's AI, send conversation text, query private wallet data or change the grant/payment ledger.

## Supported questions

- “How much ZEC is in shielded pools?”
- “Qual é a oferta circulante de ZEC?”
- “Mostre atividade mensal de setembro 2026.”
- “Show monthly activity for 2026-09.”
- “Compare atividade mensal de setembro 2026.”

These narrow factual forms can finish without a model call. Complex questions can invoke the registered query_zcash_analytics function. One tool call reads either current supply (month: null) or one explicit UTC calendar month (month: "YYYY-MM").

The monthly_comparison metric fetches that month and its predecessor and calculates transaction growth, changes in both shielded shares (percentage points) and closing shielded balance changes in code. Two closed UTC months are required. A zero baseline produces no growth percentage. This is descriptive evidence, not a claim about users, economic transfer volume or which project caused adoption. Model-assisted ecosystem analysis can combine these results with existing dated funding, delivery and governance tools; those datasets retain their own definitions and periods.

The comparison also checks increasing closing heights and reconciles reported net flow to the difference in closing shielded balances when flow is available. Contradictory accounting withholds the comparison. “Last month” resolves against the execution date in UTC, including the year boundary.

## Data contract

Supply reads ShieldedScan's six-pool partition and chain tip, plus ZecBlock's mainnet node supply. Integers are validated and normalized to decimal-string zatoshis. Every pool must occur exactly once, and the partition must sum to issued supply. Circulating is defined as issued minus Lockbox; this is distinct from market-provider estimates.

Two readings are reconciled only at identical heights and block hashes. At different heights, the newer indexed reading is selected and the discrepancy is disclosed. A missing hash is unverified. A same-height/hash amount disagreement (or competing hash) selects no canonical value. A failed provider leaves an explicitly unconfirmed single-source reading. Matching explorers do not prove independent upstream infrastructure.

Source response time, retrieval time and block observation time remain separate. Unknown observation time is not evidence of freshness. Responses/block observations more than ten minutes old are marked stale. Future timestamps, malformed partitions and mainnet/index mismatches fail validation.

Monthly activity is sourced only from ShieldedScan's indexed monthly aggregate. It is not independently reconciled against a second monthly index. The contract checks the requested month, one returned bucket, coinbase exclusion, closing-balance basis and both percentage numerators/denominators. Current calendar months are explicitly partial. The upstream range describes returned bucket starts, not proof of an arbitrary requested interval; only the one-month UTC contract is exposed.

Net pool flow is neither gross shielding volume nor migration volume. Closing balances are neither monthly averages nor maximum balances. Null flow remains unavailable; no record or source failure becomes zero. Custom date ranges, gross flows, migration analyses and USD conversions are not part of this first adapter.

## Reliability and privacy

Fixed allowlisted hosts and paths; redirects rejected; public headers only; 128 KiB body cap; five-second fetch deadline; abortable caller wait; at most sixty seconds of bounded public-data caching with coalesced reads. A 429 pauses uncached reads for that provider according to Retry-After. No automatic retry storm, stale-on-error fallback, stored conversations or forwarding of user credentials.

Sources accompany both deterministic and model-assisted answers. All monetary and percentage fields enter Zarvis's existing numeric evidence guard.

## Verification

Run the analytics test files, then the repository tests, lint, typecheck and build. Live smoke checks should call lookupChainAnalytics or the deterministic questions above, without needing an AI-provider request. Do not infer production deployment from local tests.
