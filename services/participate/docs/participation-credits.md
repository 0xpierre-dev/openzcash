# Participation credits and comment reactions

8 October 2026

## Product model

**Zcred** is the public name for participation credits: private, scope-bound usage units attached to a permanent user account. Use the same spelling for singular and plural amounts (`1 Zcred`, `25 Zcred`), while keeping the profile menu and account dialog named **Credits**. Payment amounts remain denominated in **ZEC**; the name does not imply a fixed ZEC conversion rate.

Product decision, 10 October 2026: **1 Zcred costs US$ 0.25; initial proposal submission costs 20 Zcred / US$ 5**. This price is agreed but not activated in the fixed-ZEC purchase implementation. It does not give demo credits cash value or change existing comment/like costs. See [the publication contract](./proposal-publication-product.md) for quote, submission, recovery and anchoring requirements.

Zcred are separate from ZEC balances, treasury budgets, DAO membership and governance ballots. The implementation uses original application code informed by the public Free2Z design; it neither issues Free2Z 2Zs nor connects to the Free2Z account service.

The profile menu contains **Credits**. A participant sees available credits, the community's comment and like costs, and a private activity history. Owners can configure participation as **Free** or **Use credits** in the local demonstration. Existing communities start with free participation.

Each comment has one like per authorized actor. Removing a like costs nothing. Restoring a previously paid like does not charge again. Reactions do not contribute to quorum, alter ballot weight, grant membership, rank proposals by payment, or authorize a treasury allocation.

Temporary invitation sessions remain sponsored: they can participate within their existing proposal permissions without buying a persistent credit account. No account is created or linked by matching a nickname, Zcash address or ZcashName.

## Current operating boundary

The dedicated local sandbox uses `WORKSPACE_PREVIEW=true` outside production. A separate opt-in [public free pilot](./participate-public-access.md) uses `PARTICIPATE_PUBLIC_DEMO=true` with explicit host/committee IDs and verified personal email accounts. Each eligible account can claim 25 demo credits once in its authorized scope; the public pilot never grants DAO credits or enables a shared persona. The amount is fixed by the server, has no ZEC value and never produces a treasury funding entry. The disposable PostgreSQL test database is supported only in test mode.

Real Zcash top-ups are not enabled in the sample environment. The separate [purchase integration](./credit-purchases.md) adds receiver configuration, invoices and on-chain observation behind explicit activation. There is no withdrawal flow, exchange guarantee or personal seed creation. A persistent user credit account is not a Zcash wallet. A paid policy copied into an unsupported environment must not silently charge, grant test credits or pretend payment processing is ready.

The purchase integration opens a payment request in the user's external wallet, which retains the user's seed and spending keys. It identifies each payment using an opaque order memo, confirms the receiving output on the selected chain, and issues credits exactly once. Different receiving addresses do not necessarily imply separate wallets or user-controlled spending keys. See the separate integration document for activation and validation requirements.

Each DAO receives its own purchases; committee proposals use a separately configured committee receiving wallet. The [purchase integration](./credit-purchases.md) implements private invoices and confirmed incoming payments; activation remains disabled until receiver configuration and live validation are completed. Sustainability funding continues to use manual allocations; credit consumption does not automatically transfer ZEC or duplicate revenue in either treasury.

## Integrity and access

- Public proposal records allow any active permanent account to comment and like. This grants no DAO membership or voting access. DAO discussions still require current management authority or ballot eligibility. Buying credits never opens a private discussion.
- Derive the charge on the server using the current community policy. Require the displayed policy version before a paid action; a changed price produces a conflict instead of a silent charge.
- Commit comment publication or the initial paid reaction together with its debit. Insufficient funds or failed publication rolls the entire transaction back.
- Preserve the request key across retries. Matching replays return the existing outcome without a second comment, like or debit; a changed payload with the same key conflicts.
- Use integer credit amounts and conditional balance updates inside serializable transactions. SQL checks reject negative balances, malformed operations and inconsistent journal totals.
- Retain an append-only credit journal and reaction request history. UI responses expose only aggregate likes and the current viewer's reaction, never a list of reactors or other members' balances.
- Preserve comments when the user opens the credit panel or a network request fails. Disclose costs before posting or reacting.
- Existing moderation records remain visible. The demonstration does not refund consumed credits on moderation; a production refund policy must be decided before real purchases are enabled.

## API surfaces

| Endpoint | Purpose |
| --- | --- |
| `GET /api/account/credits` | Current permanent user's accessible community balances and credit history; optional community filter. |
| `POST /api/account/credits/preview` | One-time, fixed local demo allowance for an authorized community. |
| `GET /api/admin/communities/:communityId/participation` | Current participation policy for authorized managers. |
| `PATCH /api/admin/communities/:communityId/participation` | Owner-only, version-checked policy update. |
| `GET /api/polls/:pollId/comments` | Authorized discussion, aggregate reactions and the viewer's participation context. |
| `POST /api/polls/:pollId/comments` | Publish with an idempotency key and, for paid participation, policy version. |
| `POST /api/polls/:pollId/comments/:commentId/reaction` | Explicit like state with an idempotency key and policy version when charging. |

Account endpoints use the current session identity, not a caller-supplied user ID. Mutation endpoints reject untrusted origins. All private responses are uncached.

## Database upgrade

Apply `prisma/upgrades/20261008_participation_credits.sql` once after the account-profile and community-workspace upgrades, with a verified backup. It is additive and initializes no credit balances or charges. It adds the participation policy, credit account and journal tables, comment request keys, and reaction records with relational and transactional integrity constraints.

Then apply `prisma/upgrades/20261008_participation_reaction_rate_limit.sql` to add the actor/time index used for the 30-actions-per-minute reaction limit. This additional index upgrade is safe to rerun.

Prisma client generation is required after the schema update. `prisma db push` alone does not install the SQL constraints and triggers. A fresh database also needs the equivalent SQL integrity definitions before it can be used for paid participation.

## Release acceptance

Validate replay safety, concurrent overspending, atomic action/debit rollback, active permissions, community isolation, cost-version changes, invitation sponsorship, production refusal of demo funding, and retained drafts. Verify the credit account and discussion interfaces in light/dark themes and at narrow widths. Real top-ups require additional invoice, confirmation, reconciliation, expiry and chain-reorganization tests before activation.

## How Free2Z associates a user with Zcash

The classic Free2Z web purchase flow sends a Zcash payment to the platform's current receiving address. Its shielded memo contains a purchase action and the account username, allowing the service to assign an internal 2Z balance. This is account attribution, not the creation of a separately controlled Zcash wallet for each web account. See the pinned [TuzisDialog implementation](https://github.com/free2z/zuu/blob/40bfabffb3f765046ceafad213a26a5754dbd6b9/ts/react/free2z/src/components/TuzisDialog.tsx).

Free2Z's separate ZUULI wallet architecture describes the wallet application holding the master seed and spending keys; the content application holds an authentication token and credit balance. This repository documentation describes an architecture and is not proof of deployment to every user. See the pinned [app-suite architecture](https://github.com/free2z/zuu/blob/40bfabffb3f765046ceafad213a26a5754dbd6b9/docs/free2z/app-suite/architecture.md).

For this DAO, the implemented account holds usage credits. The purchase integration follows: create a private order, pay with an external Zcash wallet, observe and confirm the receiving payment, then credit that order's user/community exactly once. It uses an opaque order reference instead of putting a public username into the payment request. Each DAO receives payments in its own configured wallet account.

## Initial participation-credit verification record

- 545 tests across 83 files passed, including 11 PostgreSQL credit/discussion tests and 4 existing treasury transaction tests.
- The production build and TypeScript check passed. Lint reported zero errors and two pre-existing image warnings.
- Credit checks cover authorization, community isolation, fixed demo grants, missing/stale policy versions, same-request retries, concurrent spending, action/debit rollback and immutable journal reconciliation.
- Interface tests cover private balances, current-community selection, retry-safe demo grants, policy conflicts, retained drafts, unavailable balance recovery, focus restoration and credit update events.
- Manual browser validation of the new interface is pending. The original preview tab became an internal connection-error page while the server was stopped; browser automation refused navigation from that page. The development server has been restarted for the user to reopen the HTTP preview.
- No production deployment, real purchase, custody, withdrawal or treasury transfer was performed.

## Public proposal module

The [separate Proposals module](./proposals-module.md) uses the same ledger implementation with a distinct **COMMITTEE** account and policy for ZCG records. It cannot debit a DAO balance. See [Committee credits](./committee-credits.md). Its listing shows real local proposal-like and visible-comment counts. Comments and preserved records expand beneath each card. Costs remain visible before paid actions; the private balance stays in Credits. New likes/comments never change the imported ZCG positions.

Apply `prisma/upgrades/20261010_archive_participation.sql` after the archive migration. It adds proposal likes with append-only request history and a permanent prior-charge marker for proposal and comment likes. It does not grant credits or retroactively charge existing interactions. No database fields or API requests can grant voting rights through this flow.
