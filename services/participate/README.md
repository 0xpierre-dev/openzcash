# Participate

The independently runnable Participate application and API: public proposal
records, revisions, verification downloads, accounts, email codes, passkeys,
discussion, participation credits, and community/committee workflows.
The OpenZcash portal exposes selected routes through an explicit same-origin
proxy; this app has its own database and secrets.

## Install locally

Use Node 24.22.1 and PostgreSQL. Run these commands in this directory:

```sh
npm ci
cp .env.example .env
```

Set `DATABASE_URL` to a new local database. Generate distinct random values for
`ZCAP_SESSION_SECRET`, `ZCAP_INTERNAL_SECRET`, and `EMAIL_AUTH_SECRET` (for example,
`openssl rand -hex 32`). The template values are not deployment credentials.
Use the fresh-database setup described in [Database setup](docs/database.md).
Existing installations require reviewed upgrades, not schema replacement.

Create your own initial owner and community by setting `SEED_ADMIN_NICK`,
`SEED_ADMIN_PASSWORD`, `SEED_ADMIN_EMAIL`, `SEED_COMMUNITY_NAME`, and `SEED_COMMUNITY_SLUG` in `.env`.
Then run:

```sh
npm run db:seed
npm run dev -- --hostname 127.0.0.1 --port 3001
```

Use an inbox you control for `SEED_ADMIN_EMAIL`; normal sign-in uses email
verification, not the seed password. Seeding does not transfer ownership of existing records or enable a committee.
Public snapshots under `data/` are reference material; live accounts and
production records are not included. A fresh database does not contain the
OpenZcash site's activity or private users.

## Connect the portal

Configure `APP_BASE_URL`, `PASSKEY_ORIGIN`, and `PARTICIPATE_PARENT_ORIGIN` to
`http://127.0.0.1:3000` for local development. Set `PARTICIPATE_COMMUNITY_ID` to
the seeded community's ID. Set that same `PARTICIPATE_COMMUNITY_ID` in the portal. In the portal, set
`PARTICIPATE_UPSTREAM_URL=http://127.0.0.1:3001` and open `/zcg/participate`.
The portal keeps the backend's database URL and email secrets private.

Passkeys are bound to the public portal origin and relying-party identity.
For email login, configure your own verified sender and Resend key. Without
those, delivery stays disabled. Tests mock email delivery; they send no email.
Do not reuse OpenZcash production credentials or enable shared demo sign-in
on a real deployment.

For the isolated committee practice flow, see
[Committee practice](docs/committee-practice.md). It requires its own database,
test records and explicit gates; the ordinary seed does not enable it.

## Operate and extend

Keep real credit purchases, live committee operations and wallet writers off
until separately configured and reviewed. Zcred accounting is not a wallet
balance. The web process must not hold a spend key or a wallet writer endpoint.
The optional automation worker and wallet transport are separate operator
components; see [Deployment](docs/deployment.md) and
[Automation](docs/participate-automation.md).

Public source records and chain receipts are distinct from proposal approvals.
Historical snapshots are dated evidence. A confirmed anchor proves a commitment
was recorded, not that the proposal, author or funding request was endorsed.

The legacy community voting rail remains a pilot. Collector trust, membership,
finalization and publication policy need deployment-specific review. See
[Threat model](docs/threat-model.md), [Privacy model](docs/privacy-model.md), and
[Voting finalization](docs/voting-finalization.md).

## Verify

```sh
npm run typecheck
npm run lint
npm test
npm run test:runtime
npm run build
```

Database tests are opt-in. Create a disposable local `community_treasury_tests`
database using the same baseline, then set `TREASURY_TEST_DATABASE_URL` and
`PARTICIPATE_TEST_PORT` (default 55438). Database suites run serially. The separate
`PARTICIPATE_DEMO_TEST_DATABASE_URL` suite creates its own synthetic demo fixture
in a fresh local `participate_demo_test` database with the baseline applied. It
refuses existing accounts and is not enabled by the treasury variable. See the
[demo test commands](docs/committee-practice.md#database-regression-tests).
Never run these tests against user data. CI prepares both databases and runs
the demo suite alongside the other database tests.

Apache-2.0. The source and attribution notices are preserved. See [NOTICE](NOTICE)
for changes made while preparing this distribution.

The build regenerates the three portable verification bundles from the current
source and lockfile. To regenerate them alone, run `npm run build:verifiers`.
