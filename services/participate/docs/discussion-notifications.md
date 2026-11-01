# Private Participate notifications

Participate's signed-in header has a notification bell for **likes on your comments** and **replies to your comments**. It shows unread counts, a compact inbox, older-page loading and a mark-all-read action. Clicking an item marks that item read, reveals its proposal through any active filter, and focuses the exact comment or reply inline. From other Participate views it returns to the proposal list inside the same embedded workspace.

The inbox refreshes every 30 seconds while the page is visible, when returning to the tab or coming online, and when opened. It persists across sessions and devices. This feature does not send email or browser push messages and requests no browser notification permission.

Notifications are written in the same database transaction as the accepted interaction, credit debit and public activity event. Self-interactions are skipped. Concurrent requests and retries are deduplicated; removing a like withdraws its notification, and re-liking restores the existing item with its prior read state. Notifications introduce no additional Zcred charge or blockchain transaction. The original interaction remains eligible for the existing activity anchoring flow; private inbox state is never included in public archive packages.

Only the authenticated active recipient can list or acknowledge their inbox. Public-pilot account and host/committee restrictions are enforced server-side. The response uses the same proposal-scoped pseudonym/profile sharing rules as discussions; emails, internal actor IDs and login names are not returned. Hidden comment content is excluded, including from unread counts. Viewing the inbox does not mark messages read. Mark-all-read is bounded by its snapshot timestamp so later notifications stay unread.

Before running the updated service, back up the database, apply `prisma/upgrades/20261010_discussion_notifications.sql` once and regenerate Prisma. This additive migration creates only the private notification table, enum, constraints and indexes. No prior activity is backfilled and no existing proposal, anchor, user or credit record is modified. Grant the existing application role access to the new table under the installation's normal database policy.

Tests cover concurrent likes, replayed replies, self-actions, profile privacy, recipient/scope isolation, hidden content, pagination, acknowledgement, transactional rollback and credit preservation, plus the private API, inbox interactions and inline comment focus.

## Preview validation — 2026-10-10

- 30 component/API tests passed, plus 6 notification integration tests against the named disposable PostgreSQL database. The 18 existing archive-credit/public-pilot integration tests also passed. TypeScript and targeted ESLint checks passed.
- A fresh private VPS database backup completed successfully before the additive migration. The existing application role received SELECT, INSERT and UPDATE on the new table. Post-migration checks preserved 25 proposal archives, 25 anchors and 5 users; the new inbox started empty. No historic notifications were fabricated.
- The local service on port 4411 was restarted with the generated Prisma client. The signed-in notification inbox loaded successfully within the OpenZcash preview on port 4421. Desktop and 390-pixel mobile rendering were checked, including the empty state and panel boundaries. Populated delivery, unread changes and comment navigation were exercised with isolated fixtures, not by publishing test activity to the live pilot.
- This validation did not deploy the application to production or send email/push notifications.

## New proposals for committee members — 2026-10-15

- A first verified import of an open, under-review official proposal, or a real native publication, creates one `PROPOSAL_ARRIVED` item for each active member of its committee. Owner, manager, reviewer and moderator roles are included. Disabled memberships/accounts, shared preview personas, outside communities and unaccepted invitations are excluded. The applicant is not an implicit committee member.
- Notifications are persisted in the publication transaction. If saving the inbox fails, publication and any native credit debit roll back together. The unique `(kind, recipientId, archiveId)` key prevents retry duplicates. Later revisions, historical/terminal decisions, private drafts and demo publications create no arrival notifications. Existing archives are not backfilled and newly added members do not receive historical arrival alerts.
- Intake can retain private arrival items while the committee workspace is paused. Listing and acknowledging them still require the committee-operation gate and a current active membership, on every request; recording an arrival grants no access or signing permission. A revoked membership immediately removes these items from that person's visible inbox and unread count.
- The header labels these items **New proposal to review**, names the proposal, and opens its committee review. Navigation works from the public board and other committee tabs. Each member has independent unread/read state, including across sessions. The existing 30-second visible-page refresh applies.
- New clients opt in with `include=proposals` on GET/PATCH `/api/account/notifications`. Older clients retain a comment-only inbox and cannot accidentally mark unseen proposal notifications read. The opt-in is only a response capability; it does not bypass account, membership, scope, cursor or origin checks.
- No emails, browser push, public activity events, anchors or extra participation fees are produced by an inbox notification.

### Deployment order

1. Back up the private service database and verify the existing comment-notification migration is present.
2. Apply `prisma/upgrades/20261015_proposal_arrival_notifications.sql` once with `psql -v ON_ERROR_STOP=1`, **without** `--single-transaction`. PostgreSQL must commit the enum addition before the following constraint. The migration only extends the existing inbox; it does not backfill or modify financial/public records.
3. Regenerate Prisma and deploy the service with this schema, then deploy the compatible portal UI (the portal may also go first; older services ignore the capability query). Respect the separately authorized committee activation process; do not enable it merely to show notifications.
4. Verify active-member isolation, a real new arrival when the committee is active, unread persistence and the destination. This change was tested with local disposable data; it has not been deployed or migrated in production.
