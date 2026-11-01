# Portal integration

The portal serves `/zcg/participate` and forwards an allowlisted set of APIs and
recovery downloads to this independent service. The backend owns its own
database. The upstream URL and secrets remain server-side.

For local development, use portal `http://127.0.0.1:3000` and service
`http://127.0.0.1:3001`. Set the portal's `PARTICIPATE_UPSTREAM_URL` to the latter.
Set `PARTICIPATE_COMMUNITY_ID` in both apps to the intended seeded archive host.
The service's `APP_BASE_URL`, `PASSKEY_ORIGIN` and `PARTICIPATE_PARENT_ORIGIN`
should use the portal origin. Restart both processes after environment changes.

In production, use the canonical HTTPS portal origin and an isolated backend
connection. Preserve the browser Origin and host-only authentication cookies;
never take the trusted application origin from user-controlled forwarded headers.
The proxy excludes wallet administration and unapproved payment/committee routes.

The portal owns its official-source/history APIs and normal `/_next` assets.
Embedded service assets use `/_participate-assets/_next/`. The bridge checks
origin, source window and message version and shares appearance/readiness,
not account credentials or wallet data. Passkeys require acceptance on the
final public origin and relying-party identity.

See [Local setup](../README.md), [Public access](participate-public-access.md)
and [Deployment](deployment.md). Historical public snapshots are reference data;
a fresh installation does not include the hosted site's users or activity.
