# Public access and operator roles

Public proposal browsing and recovery downloads need no account. Comments,
likes, private drafts and profile settings require the authenticated account and
its scoped permissions. Official source decisions never become participant votes.

## Free pilot

The free pilot is opt-in through `PARTICIPATE_PUBLIC_DEMO`,
`PARTICIPATE_COMMUNITY_ID` and `PARTICIPATE_COMMITTEE_ID`. It requires a real
verified, active, non-demo account. Demo Zcred have no monetary value and do not
become purchased credit balances. Shared local demo personas are disabled in
production. Keep all pilot and committee flags off in a fresh deployment until
its scope has been reviewed.

See [Email authentication](email-auth.md), [Credits](participation-credits.md)
and [Submission behavior](participate-submissions.md).

## Authorized administrator preview

An operator may use `scripts/setup-participate-admin.ts --email <verified-email>`
first as a dry run, then with `--apply` after checking the environment. The script
requires an active, verified, non-demo account and prompts privately for the
administrator password. Do not put passwords in arguments, files or chat.
This does not create committee membership.

The read-only committee preview expires after 15 minutes and is bound to the
account, host and credential version. Locking or signing out clears the cookie;
expiry, disabled accounts, revoked roles or changed credentials invalidate it.
The public-pilot moderation grant is separate: it allows hiding a comment only
with a recorded reason. A preview token cannot authorize moderation or voting.
Previously downloaded public text cannot be recalled.

## Committee release gate

Committee operations stay disabled by default. Global ADMIN and DAO roles do
not grant committee voting powers. An authorized owner, verified personal
membership and enrolled keys are required. See [Committee operations](committee-operations.md).

## Hosting acceptance

Test real email delivery and code consumption, expiry/resend/replay, logout,
physical-device passkeys and administrator moderation on the final HTTPS
origin. Configure durable backups, restore tests and monitoring. Automated local
tests and historical chain receipts do not establish these operational facts.
See [Deployment](deployment.md) and [Remaining acceptance](roadmap.md).
