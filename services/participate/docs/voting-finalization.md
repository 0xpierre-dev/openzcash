# Voting closure and finalization

9 October 2026 · Closure safety and collection checks

## Delivered: closure safety

The voting deadline now closes the voting window without expiring uncollected tickets/requests or executing membership actions. Concurrent lifecycle workers compare the original status and dates before changing a poll; a stale opener cannot overwrite a close. No database migration is required for this slice.

`CLOSED` means **Tally pending** in the DAO. Public/admin decision summaries no longer treat CLOSED as a final outcome, and notification feeds do not publish a result solely because a poll closed. Existing aggregate count visibility is unchanged; a unified publication/privacy policy remains separate work.

The membership action service requires `FINALIZED`, including in its conditional action claim. CLOSED and legacy ARCHIVED flags leave a pending action untouched. Closing no longer calls this service. There is no automatic finalizer or new manual-finalize endpoint in this delivery; a status flag alone is not chain evidence.

Choice locking checks the actual opening/closing dates, even if lifecycle synchronization has not run. The request API stops returning payment details after the deadline and rechecks it after a slow wallet observation. Preserving a request for collection does not keep voting open.

## Collector behavior

The existing collector cannot prove a complete canonical-chain scan up to the cutoff. Reconciliation therefore returns `tallyPending: true` for CLOSED or elapsed OPEN rounds without classifying their notes. It creates neither confirmed nor permanently rejected receipts for those rounds. Requests remain available for the future cutoff-aware collector.

For an open round, receipt processing locks the poll row through a conditional status update and rechecks the clock inside the same transaction as the ticket claim, receipt and tally. If closure wins while the wallet read is in flight, no receipt/ticket/tally mutation is applied. Concurrent retries retain the existing receipt uniqueness and one-vote ticket claim.

This fixes premature execution and destructive handling of delayed observations. It does **not** yet count a valid late-collected vote, prove finality, recover previously expired/rejected records, reverse earlier membership actions or supply a veto procedure. Never reset historical receipts/tickets or set FINALIZED manually to bypass the pending state.

## Delivered: private wallet-history checks

Leaders can open a closed proposal and use **Tally verification → Check collection**. The API requires an active OWNER/MANAGER account in that DAO and a trusted write origin. Guests and invitation sessions cannot access the check history. The check is also allowed for an elapsed OPEN round while lifecycle synchronization catches up; an active voting window remains unavailable.

The read-only [history observer](../lib/zcash/poll-history-observer.ts) uses Zallet `z_listtransactions(account, 0, tip + 1, 0, 1000)` in one wallet database snapshot. The fixed exclusive end height excludes unmined transactions and the history includes spent outputs. Missing `to_address` values trigger transaction inspection, not silent omission. Each known ballot address must belong to the configured account; UA receiver aliases are verified. Recognized receiving outputs retain `(network, txid, pool, outputIndex)`, exact integer amount, raw-memo interpretation, block hash/height/time and observed confirmations. Nonmatching or malformed memo text is preserved or blocks the check; the observer does not decide whether an output is a vote.

The node and wallet must agree on a fully scanned, unlocked tip. Each relevant transaction must appear in its canonical block, with matching heights and confirmation counts. The tip is checked again after observation; a change blocks that attempt. Network mismatch, stale chain, incompatible version, incomplete sync, inconsistent output data, timeout, excessive history or missing configuration produces a specific pending reason. No RPC provider error or credential reaches the browser.

The reviewed contract is Zallet **0.1.0-beta.3**, checked against source commit `987382f67e622915228686e9f956c6a9c9a7514c` and `522b486d2e4acea9fd8868ac8331e25abd6ec145`. Discovery must advertise that version and the required methods. This checks compatibility, not build authenticity. The listing API is experimental; review and pin the deployed binary. Sources: [Zallet RPC reference](https://zcash.github.io/zallet/rpc/index.html), [sync operations](https://zcash.github.io/zallet/operations/index.html), [reviewed transaction-history source](https://github.com/zcash/zallet/blob/987382f67e622915228686e9f956c6a9c9a7514c/zallet-core/src/components/json_rpc/methods/list_transactions.rs).

Limits are explicit: fewer than 1,000 account history rows, at most 128 ballot request addresses, 256 RPC calls, 4 MiB per response, 6 seconds per call and 30 seconds per observation. Hitting a limit blocks the check. A future scan worker must support bounded ranges and durable progress before larger histories are supported; OFFSET pagination is not used to assume completeness. Only Sapling/Orchard external receiving outputs are supported.

### Persistence and recovery

`PollCollectionCheck` records RUNNING → OBSERVED or BLOCKED with actor, request key, scope digest, timestamps and a 60-second lease. Completed records cannot be updated or deleted under SQL guards. Snapshot JSON and a stable SHA-256 digest are retained privately; the browser receives only status, safe counts and timestamps. Evidence serialization recursively sorts object keys using `localeCompare(..., "en")`, preserves array order, and uses JSON string/number encoding before hashing UTF-8 bytes. No recipient address, memo, output identity, account UUID or provider endpoint is exposed by the history API.

The service serializes claims on the poll, coalesces identical request keys, limits all leaders collectively to one check per minute and rechecks scope/authorization after external reads. A later request marks expired work interrupted; an old worker cannot overwrite its terminal record or a newer snapshot. Elapsed RUNNING leases already display an interrupted state even before another request persists recovery.

Install the additive [SQL upgrade](../prisma/upgrades/20261009_poll_collection_checks.sql) and regenerate Prisma. It has no backfill and changes no poll, ticket, request, receipt or tally. Retain the check table on rollback; deploy the prior UI/service without deleting evidence. Configure the existing `ZALLET_RPC_URL`, credentials and `POLL_COLLECTOR_ACCOUNT_UUID`, plus server-only `POLL_COLLECTOR_NETWORK` and a validating node at `POLL_CHAIN_RPC_URL` with optional `POLL_CHAIN_RPC_USER` / `POLL_CHAIN_RPC_PASSWORD`. Use read-only RPC credentials and private connectivity. HTTPS is required except for loopback HTTP. Configuration is never accepted from the browser.

### Boundary

**OBSERVED means a wallet-history snapshot, never a finalized tally.** `fully_synced_height` is relative to the wallet's imported history/birthday; the current RPC contract does not prove the account was scanned before the round began. The collector identity is recorded per check but is not yet frozen per round. Empty history, observed confirmations and miner timestamps therefore cannot authorize finalization. The check does not classify pre/post-cutoff votes, apply approval/abstention rules, update receipts/tallies, grant membership, reserve funds or execute payments. The legacy collector remains unchanged. Legacy polls receive no synthetic chain proof.

## Next slice: verifiable completion

Before enabling finalization, implement and test:

1. A recorded cutoff/confirmation policy chosen before opening, with an explicit compatibility path for legacy rounds.
2. Canonical inclusion evidence for every counted receiving output, including collection after the deadline. Wallet observation time is not inclusion time.
3. Complete wallet-history coverage through the cutoff, including spent outputs; an unspent-note list or an empty response is insufficient proof.
4. Extend the persisted snapshot history with durable scan progress, frozen source/network identity, cutoff evidence and a reproducible final tally. Missing coverage or unavailable sources leave the round pending.
5. A transactionally guarded finalization/execution path with retry, concurrent-worker and chain-change handling; applicable veto policies must finish before execution.
6. Migration/recovery review for historical states without fabricated confirmation evidence.

The current one-block collector and 40%/67% pilot voting defaults are preserved. The check records observed confirmations but does not establish a required depth. Resolve D02/D05 before a cutoff-aware finalizer is enabled; no default or historical rule is silently replaced.

## Verification

Targeted tests cover preserved requests, deadline enforcement, repeated closes, stale opening, pending membership actions, pending feed/UI state, closure during a wallet read and receipt retries. The PostgreSQL suite exercises actual transaction behavior in the isolated local test database; its wallet responses are fixtures, not live Zcash evidence.

Original closure-safety checkpoint, 9 October 2026:

- Full regression suite with two workers: **896 passed, 40 skipped**. Database suites are skipped in that command unless explicitly configured.
- Dedicated PostgreSQL voting-close suite: **5 passed**, run separately against the isolated database.
- TypeScript check passed. Lint reported no errors and one existing image-element warning in `zcash-brandmark.tsx`.
- The closed proposal displays **Tally pending** in the browser, including at a 390-pixel mobile viewport in light and dark themes.

```bash
npm test -- tests/services/poll-lifecycle.test.ts tests/services/dao-members.test.ts tests/services/ticket-locking.test.ts tests/reconcile/reconcile-route.test.ts tests/services/public-notification-feed.test.ts tests/polls/visibility.test.ts tests/polls/vote-requests.test.ts
npm test -- --maxWorkers=2
TREASURY_TEST_DATABASE_URL='postgresql://dao_test@127.0.0.1:55438/community_treasury_tests' npm test -- tests/integration/voting-close-postgres.test.ts
```

The integration suite rejects other hosts, ports and database names. It creates unique test communities and retains their records. No deployment, chain transaction or real membership change is performed by these tests.

Collection-check checkpoint, 9 October 2026:

- Full regression suite: **1,030 passed, 78 skipped**. The skipped database suites require explicit configuration.
- New observer/API/component tests plus proposal-page regression: **45 passed**.
- Separate PostgreSQL collection and voting-close suites: **11 passed** (6 collection + 5 closure), covering idempotency, concurrency, source failure, interruption/restart, scope changes, authorization revocation, immutable history and unchanged voting/membership records.
- TypeScript and scoped ESLint passed. Schema upgrade applied only to the local test and preview databases.
- Preview verification records **NOT_CONFIGURED** truthfully. No live Zcash collector or binding finalization was validated.
- Desktop and 390-pixel mobile review passed in light/dark themes; details expand and the mobile page has no horizontal overflow.

```bash
npm test -- tests/zcash/poll-history-observer.test.ts tests/admin/collection-check-routes.test.ts tests/components/proposal-collection-check.test.tsx tests/workspace/community-pages.test.tsx
TREASURY_TEST_DATABASE_URL='postgresql://dao_test@127.0.0.1:55438/community_treasury_tests' npm test -- tests/integration/poll-collection-checks-postgres.test.ts tests/integration/voting-close-postgres.test.ts
```
