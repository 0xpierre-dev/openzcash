# ZecHub governance reader

`src/lib/dao/zechub.ts` supplies the ZecHub page, news feed and Zarvis. It is read-only: no wallet, signature, vote or transaction is involved.

## Sources and availability

1. Read the newest 50 proposals from the public DAO DAO indexer on `juno-1`.
2. If it fails, returns invalid records, or unexpectedly returns no history, query the same proposal module directly through the public Juno REST endpoint at `rest.cosmos.directory/juno`.
3. If both fail, retain the last successful in-process snapshot as `stale`, with its original retrieval time. Without a successful snapshot, return `unavailable` and show unavailable totals rather than zero proposals.

Successful reads are cached for ten minutes; failed reads retry after one minute. Concurrent readers share one request. The cache always holds up to 50 proposals, so the news feed's smaller window cannot truncate the governance page. Restarting the process clears this cache.

The contract query is `{"reverse_proposals":{"limit":50}}` against proposal module `juno14futcfehnc8fn4nz6gtm25svn05mzz09ju8rtj0jvven2hpxj85s0q8a55`. Responses are validated before use. The response shape is defined by [DAO DAO's proposal contract](https://github.com/DA0-DA0/dao-contracts/blob/development/contracts/proposal/dao-proposal-single/src/query.rs).

Proposal links retain the canonical DAO DAO destination, using prefix `A` for this single-choice module. This restores the portal's listing independently of the indexer; availability of the external DAO DAO interface is outside the portal's control.

## Dates and interpretation

The contract response has no creation timestamp. Reuse an already-known timestamp for the same proposal ID; otherwise leave it absent. Do not substitute the fetch time, expiration, or block height. News omits undated proposals rather than presenting old proposals as new. Zarvis receives the actual source, availability and retrieval time.

This feed describes ZecHub DAO decisions only. It does not establish ZCG or Zcash Foundation approval, a Zcash protocol decision, or payment. Treasury balances and payout records remain sourced separately from the public treasury spreadsheet.

## Regression checks

`src/lib/dao/zechub.test.ts` covers the indexer outage, direct contract response, validation, shared cache, concurrent refreshes, stale fallback and recovery. Page and Zarvis tests cover availability labels, canonical links and provenance. Live verification must check the rendered proposal links as well as HTTP status: an HTTP 200 page can still contain an unavailable upstream feed.
