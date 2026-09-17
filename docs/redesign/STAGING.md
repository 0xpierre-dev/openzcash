# OpenZcash redesign environment

This is an independent test deployment of the production application, with real
routes, server rendering, database queries and existing administrator actions.

- URL: https://zbo-redesign.up.railway.app/design-review
- Branch: `michae2xl/redesign-staging`
- Production baseline: `2ea7f6b1d8f3d2b73edaeca719a82431d1e0fbb4`
- Confirmed production deployment: `a66d7ba2-f4ad-474b-ba61-c01c8061c821`
- Railway project: `zcash-back-office` (`5476eada-862a-47bd-9166-49be9933d33c`)
- Railway environment: `redesign` (`c28d22c7-0df0-47c5-92e5-361df867ee42`)
- Application service: `zbo`; database service: `postgres-db`.
- Database: `openzcash_redesign`, on this environment's own private network and volume.

## Data and access

The 17 ZCG/ZecHub accounting and publication tables were copied from production.
`data-parity.json` records counts and canonical row digests from both databases.
All 5,567 rows, including 1,012 ledger records, matched at the recorded time.
Amounts retain their original integer cents/zatoshis, identifiers, dates, source
references and administrative corrections. The committee's source-linked roles
and relationship data remain unchanged.

Private viewing keys, invitations, scanner handles, payroll and private chain
records were not copied. Management pages initially have empty private datasets.
The official transparent ZCG address had no stored treasury/chain rows in the
production database at the time of copying, so no public reconciliation records
were omitted from those private-data tables.

Database, session, administrator, cron and onboarding credentials were generated
specifically for this environment. Production credentials are not accepted.
The administrator password is available only in Railway → redesign → zbo →
Variables → ADMIN_PASSWORD. Do not copy it into documentation, commits or chat.

`DISABLE_AUTO_REFRESH=true` pauses the startup/recurring scheduler, automatic
spreadsheet refresh and cron endpoint so the accounting snapshot can be compared. Live external
prices, chain heights, feeds and proposal signals retain their existing read
behavior and may change; this is not a frozen image of the entire internet.
Any writes or manual imports affect only the test database. This environment has
its own infrastructure usage while it remains running.

## Design scope

The shared interior layout introduces warm white surfaces, gold accents, grouped
navigation, consistent tables/statistics, an all-screens directory, a committee
page and a future-payment schedule. Existing route contracts, detail query
parameters, forms and underlying data logic remain available.

The home page, its app launcher and both treasury cards keep their production
layout. Monthly routes, publications and generators are unchanged. The 3D room,
canvas, proposal dialog and assets are unchanged; an entrance screen now mounts
the original room after the user presses Enter.

Scheduled payments use approved/open/completed grant-ledger entries that are
unpaid, not test/internal, have a real estimate date today or later in Brasília
time, and a positive known amount. Cancelled/vetoed/returned grants are excluded.
The table, category subtotals, month subtotals and total share one population.
Undated, overdue and unknown-amount entries are explicitly counted separately.

## Deployment and migration boundary

This branch's Railway start command verifies the exact redesign environment ID
and database before migrations run. It refuses to start against production.
Search-engine indexing is disabled with metadata and response headers.

Railway's `redesign` environment is connected to `Michae2xl/openzcash`, branch
`michae2xl/redesign-staging`. Pushes to this branch publish this test environment.
The first successful GitHub deployment was `a856f3e0-a748-4572-b92e-18abea147705`.
Production remains connected to its existing deployment configuration.

For a manual CLI deployment, use explicit environment and service identifiers:

```sh
railway up --project 5476eada-862a-47bd-9166-49be9933d33c \
  --environment c28d22c7-0df0-47c5-92e5-361df867ee42 \
  --service zbo --detach --message "redesign: <commit>"
```

There is no automatic merge or migration to production. Review the pages and
data first. A later production migration must deliberately remove the staging
startup guard, retain production configuration, and deploy the reviewed changes.
No DNS or production-domain changes are part of this preview.

## Validation

- TypeScript and production build passed.
- 335 unit tests passed; 8 pre-existing integration tests skipped.
- Scoped ESLint: zero errors (two small local-image warnings).
- 254 protected files checked byte-for-byte against production, with no changes.
- Full public-table row comparison passed; see `data-parity.json`.
- Browser and HTTP verification are recorded after deployment.
